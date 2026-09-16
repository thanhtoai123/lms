/**
 * Worker vòng lặp cho self-host / dev: pnpm worker
 * Mỗi 10s: quét SLA lead → xử lý outbox → chạy automation rules.
 */
import "dotenv/config";
import { createDb } from "@satarobo/db";
import { processOutbox, scanLeadSla } from "./services/engagement";

const db = createDb();
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
let running = true;
process.on("SIGINT", () => { running = false; });

async function tick() {
  try {
    const sla = await scanLeadSla(db);
    const r = await processOutbox(db, { batch: 200 });
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
