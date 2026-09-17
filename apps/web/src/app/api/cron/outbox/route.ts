import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { processOutbox, scanLeadSla, runSurveyTriggers, processEmailQueue, remindDueHomework, publishDuePosts, syncAffiliateRewards, recordHeartbeat } from "@satarobo/api";

/**
 * GET /api/cron/outbox — Vercel Cron (mỗi phút) hoặc gọi tay. Bảo vệ bằng CRON_SECRET.
 * Self-host: dùng `pnpm worker` (vòng lặp) thay vì route này.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ ok: false, error: "CRON_SECRET chưa cấu hình" }, { status: 503 });
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const db = getDb();
  const sla = await scanLeadSla(db);
  const r = await processOutbox(db, { batch: 200 });
  const surveyInvites = await runSurveyTriggers(db);
  const email = await processEmailQueue(db, { limit: 100 });
  const homeworkReminders = await remindDueHomework(db);
  const postsPublished = await publishDuePosts(db);
  const affiliates = await syncAffiliateRewards(db);
  await recordHeartbeat(db, "cron", { processed: r.processed, failed: r.failed });
  return NextResponse.json({ ok: true, slaEvents: sla, surveyInvites, email, homeworkReminders, postsPublished, affiliates, ...r });
}
