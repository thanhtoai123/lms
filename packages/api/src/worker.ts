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

const db = createDb();
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
    }
    if (Date.now() - lastRetention > 24 * 3600_000) {
      lastRetention = Date.now();
      const rt = await retentionSweep(db, { dryRun: false, actorId: null });
      if (rt.done) console.log(new Date().toISOString(), `retention anonymized=${rt.done}`);
      const cr = await candidateRetention(db, { dryRun: false });
      if (cr.count) console.log(new Date().toISOString(), `candidates anonymized=${cr.count}`);
    }
    await recordHeartbeat(db, "worker", { processed: r.processed, failed: r.failed, sla });
    if (r.processed || r.failed || sla) console.log(new Date().toISOString(), `outbox processed=${r.processed} failed=${r.failed} actions=${r.actions} sla=${sla}`);
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
