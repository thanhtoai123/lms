/**
 * Worker vòng lặp cho self-host / dev: pnpm worker
 * Mỗi 10s: quét SLA lead → xử lý outbox → chạy automation rules.
 */
// Nạp .env ở gốc monorepo (pnpm --filter chạy trong packages/api nên dotenv/config không thấy)
// — thiếu dòng này worker chết ngay vì DATABASE_URL trống và outbox không bao giờ được xử lý.
import "@satarobo/db/env";
import { createDb } from "@satarobo/db";
import { processOutbox, scanLeadSla } from "./services/engagement";
import { runSurveyTriggers } from "./services/care";
import { processEmailQueue } from "./services/admin";
import { remindDueHomework } from "./services/assignments";
import { publishDuePosts } from "./services/growth";
import { retentionSweep } from "./services/compliance";
import { candidateRetention } from "./services/recruit";
import { syncAffiliateRewards } from "./services/affiliates";
import { recordHeartbeat } from "./services/ops";
import { syncInvoiceDrafts } from "./services/einvoice";
import { dispatchParentMessages } from "./services/delivery";
import { dispatchPush } from "./services/pilot";
import { pruneLoginEvents } from "./services/loginSecurity";
import { remindPauseEnding } from "./services/studentLifecycle";
import { buildActionRequiredAlerts } from "./services/notify";
import { pruneRateLimits } from "./lib/rateLimit";
import { apiLogger } from "./lib/logger";

// Worker có việc quét / ẩn danh hoá chạy lâu hơn một màn hình web, nên nới riêng
// `statement_timeout` cho tiến trình này (60s) thay vì nới cho cả hệ.
// Pool nhỏ: worker chạy tuần tự, 4 kết nối là đủ và để dành kết nối cho web.
const db = createDb(undefined, { statementTimeoutMs: 60_000, max: 4 });
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
let running = true;
let lastSurvey = 0;
let lastRetention = 0;
let lastRatePrune = 0;
/** Log của worker đi qua bộ che PII giống mọi nơi khác */
const log = apiLogger.child("worker");
process.on("SIGINT", () => { running = false; });

async function tick() {
  try {
    const sla = await scanLeadSla(db);
    const r = await processOutbox(db, { batch: 200 });
    const inv = await syncInvoiceDrafts(db, { limit: 50 });
    if (inv.drafted || inv.issued || inv.failed) log.info(`einvoice drafted=${inv.drafted} issued=${inv.issued} failed=${inv.failed}`);
    const msg = await dispatchParentMessages(db, { limit: 100 });
    if (msg.sent || msg.failed || msg.fallback) log.info(`zns/sms sent=${msg.sent} failed=${msg.failed} fallback=${msg.fallback} retry=${msg.retried}`);
    const pu = await dispatchPush(db, { limit: 100 });
    if (pu.pushed || pu.failed || pu.gone) log.info(`web push pushed=${pu.pushed} failed=${pu.failed} gone=${pu.gone}`);
    const em = await processEmailQueue(db, { limit: 50 });
    if (em.sent || em.failed) log.info(`email sent=${em.sent} failed=${em.failed}`);
    if (Date.now() - lastSurvey > 15 * 60_000) {
      lastSurvey = Date.now();
      const pub = await publishDuePosts(db);
      if (pub) log.info(`posts published=${pub}`);
      const hw = await remindDueHomework(db);
      if (hw) log.info(`homework reminders=${hw}`);
      const af = await syncAffiliateRewards(db);
      if (af.created || af.voided) log.info(`affiliate rewards created=${af.created} voided=${af.voided}`);
      const n = await runSurveyTriggers(db);
      if (n) log.info(`survey invites=${n}`);
      const act = await buildActionRequiredAlerts(db);
      if (act.created) log.info(`action required alerts=${act.created}`);
    }
    if (Date.now() - lastRetention > 24 * 3600_000) {
      const le = await pruneLoginEvents(db);
      if (le) log.info(`login events pruned=${le}`);
      lastRetention = Date.now();
      const rt = await retentionSweep(db, { dryRun: false, actorId: null });
      if (rt.done) log.info(`retention anonymized=${rt.done}`);
      const cr = await candidateRetention(db, { dryRun: false });
      if (cr.count) log.info(`candidates anonymized=${cr.count}`);
      const pr = await remindPauseEnding(db);
      if (pr) log.info(`pause reminders=${pr}`);
    }
    // Dọn bộ đếm trần tần suất đã hết hạn (bảng rate_limits) — mỗi 10 phút là đủ
    if (Date.now() - lastRatePrune > 10 * 60_000) {
      lastRatePrune = Date.now();
      const rl = await pruneRateLimits(db);
      if (rl) log.info(`rate limits pruned=${rl}`);
    }
    await recordHeartbeat(db, "worker", { processed: r.processed, failed: r.failed, sla });
    if (r.processed || r.failed || sla) log.info(`outbox processed=${r.processed} failed=${r.failed} actions=${r.actions} sla=${sla}`);
    // Hàng đợi chết là việc KHÔNG tự lành: phải có người vào trang Vận hành xem `lastError`
    if (r.deadLettered) log.error(`outbox dead-letter=${r.deadLettered} — vào /van-hanh để xem lý do rồi chạy lại (engagement.retryDeadLetter)`);
  } catch (e) {
    log.error("vòng lặp worker gặp lỗi", { err: e });
  }
}

log.info(`Sata Robo worker started (every ${interval}ms)`);
while (running) {
  await tick();
  await new Promise((r) => setTimeout(r, interval));
}
process.exit(0);
