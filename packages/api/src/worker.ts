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
    const em = await processEmailQueue(db, { limit: 50 });
    if (em.sent || em.failed) console.log(new Date().toISOString(), `email sent=${em.sent} failed=${em.failed}`);
    if (Date.now() - lastSurvey > 15 * 60_000) {
      lastSurvey = Date.now();
      const pub = await publishDuePosts(db);
      if (pub) console.log(new Date().toISOString(), `posts published=${pub}`);
      const hw = await remindDueHomework(db);
      if (hw) console.log(new Date().toISOString(), `homework reminders=${hw}`);
      const n = await runSurveyTriggers(db);
      if (n) console.log(new Date().toISOString(), `survey invites=${n}`);
    }
    if (Date.now() - lastRetention > 24 * 3600_000) {
      lastRetention = Date.now();
      const rt = await retentionSweep(db, { dryRun: false, actorId: null });
      if (rt.done) console.log(new Date().toISOString(), `retention anonymized=${rt.done}`);
    }
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
