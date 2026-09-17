import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { processOutbox, scanLeadSla, runSurveyTriggers } from "@satarobo/api";

/**
 * GET /api/cron/outbox — Vercel Cron (mỗi phút) hoặc gọi tay. Bảo vệ bằng CRON_SECRET.
 * Self-host: dùng `pnpm worker` (vòng lặp) thay vì route này.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const db = getDb();
  const sla = await scanLeadSla(db);
  const r = await processOutbox(db, { batch: 200 });
  const surveyInvites = await runSurveyTriggers(db);
  return NextResponse.json({ ok: true, slaEvents: sla, surveyInvites, ...r });
}
