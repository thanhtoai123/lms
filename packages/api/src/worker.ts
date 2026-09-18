/**
 * Worker vòng lặp cho self-host / dev: pnpm worker
 * Mỗi 10s: quét SLA lead → xử lý outbox → chạy automation rules.
 */
import "dotenv/config";
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

// Worker có việc quét / ẩn danh hoá chạy lâu hơn một màn hình web, nên nới riêng
// `statement_timeout` cho tiến trình này (60s) thay vì nới cho cả hệ.
// Pool nhỏ: worker chạy tuần tự, 4 kết nối là đủ và để dành kết nối cho web.
const db = createDb(undefined, { statementTimeoutMs: 60_000, max: 4 });
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
let running = true;
let lastSurvey = 0;
let lastRetention = 0;
process.on("SIGINT", () => { running = false; });

async function tick() {
  try {
    const sla = await scanLeadSla(db);
    const r = await processOutbox(db, { batch: 200 });
    const inv = await syncInvoiceDrafts(db, { limit: 50 });
    if (inv.drafted || inv.issued || inv.failed) console.log(new Date().toISOString(), `einvoice drafted=${inv.drafted} issued=${inv.issued} failed=${inv.failed}`);
    const msg = await dispatchParentMessages(db, { limit: 100 });
    if (msg.sent || msg.failed || msg.fallback) console.log(new Date().toISOString(), `zns/sms sent=${msg.sent} failed=${msg.failed} fallback=${msg.fallback} retry=${msg.retried}`);
    const pu = await dispatchPush(db, { limit: 100 });
    if (pu.pushed || pu.failed || pu.gone) console.log(new Date().toISOString(), `web push pushed=${pu.pushed} failed=${pu.failed} gone=${pu.gone}`);
    const em = await processEmailQueue(db, { limit: 50 });
    if (em.sent || em.failed) console.log(new Date().toISOString(), `email sent=${em.sent} failed=${em.failed}`);
    if (Date.now() - lastSurvey > 15 * 60_000) {
      lastSurvey = Date.now();
      const pub = await publishDuePosts(db);
      if (pub) console.log(new Date().toISOString(), `posts published=${pub}`);
      const hw = await remindDueHomework(db);
      if (hw) console.log(new Date().toISOString(), `homework reminders=${hw}`);
      const af = await syncAffiliateRewards(db);
      if (af.created || af.voided) console.log(new Date().toISOString(), `affiliate rewards created=${af.created} voided=${af.voided}`);
      const n = await runSurveyTriggers(db);
      if (n) console.log(new Date().toISOString(), `survey invites=${n}`);
      const act = await buildActionRequiredAlerts(db);
      if (act.created) console.log(new Date().toISOString(), `action required alerts=${act.created}`);
    }
    if (Date.now() - lastRetention > 24 * 3600_000) {
      const le = await pruneLoginEvents(db);
      if (le) console.log(new Date().toISOString(), `login events pruned=${le}`);
      lastRetention = Date.now();
      const rt = await retentionSweep(db, { dryRun: false, actorId: null });
      if (rt.done) console.log(new Date().toISOString(), `retention anonymized=${rt.done}`);
      const cr = await candidateRetention(db, { dryRun: false });
      if (cr.count) console.log(new Date().toISOString(), `candidates anonymized=${cr.count}`);
      const pr = await remindPauseEnding(db);
      if (pr) console.log(new Date().toISOString(), `pause reminders=${pr}`);
    }
    await recordHeartbeat(db, "worker", { processed: r.processed, failed: r.failed, sla });
    if (r.processed || r.failed || sla) console.log(new Date().toISOString(), `outbox processed=${r.processed} failed=${r.failed} actions=${r.actions} sla=${sla}`);
    // Hàng đợi chết là việc KHÔNG tự lành: phải có người vào trang Hệ thống xem `lastError`
    if (r.deadLettered) console.error(new Date().toISOString(), `outbox dead-letter=${r.deadLettered} — vào /van-hanh để xem lý do rồi chạy lại (engagement.retryDeadLetter)`);
  } catch (e) {
    console.error("worker error", e);
  }
}

console.log(`Sata Robo worker started (every ${interval}ms)`);
while (running) {
  await tick();
  await new Promise((r) => setTimeout(r, interval));
}
process.exit(0);
