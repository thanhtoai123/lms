import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { devActorAllowed } from "@satarobo/core";
import { processOutbox, scanLeadSla, runSurveyTriggers, processEmailQueue, remindDueHomework, publishDuePosts, syncAffiliateRewards, recordHeartbeat, syncInvoiceDrafts, dispatchParentMessages, dispatchPush, pruneLoginEvents, remindPauseEnding, buildActionRequiredAlerts } from "@satarobo/api";

/** So khớp không lệ thuộc thời gian (chống dò khoá theo độ trễ) */
function timingSafeEqualStr(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * GET /api/cron/outbox — Vercel Cron (mỗi phút) hoặc gọi tay. Bảo vệ bằng CRON_SECRET.
 * Self-host: dùng `pnpm worker` (vòng lặp) thay vì route này.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Không còn "mở toang khi chưa đặt CRON_SECRET": chỉ môi trường phát triển (tài khoản mẫu bật) mới được gọi tay.
  if (!secret) {
    if (!devActorAllowed(process.env)) return NextResponse.json({ ok: false, error: "CRON_SECRET chưa cấu hình" }, { status: 503 });
  } else if (!timingSafeEqualStr(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = getDb();
  const sla = await scanLeadSla(db);
  const r = await processOutbox(db, { batch: 200 });
  const surveyInvites = await runSurveyTriggers(db);
  const invoices = await syncInvoiceDrafts(db, { limit: 100 });
  const messages = await dispatchParentMessages(db, { limit: 200 });
  const push = await dispatchPush(db, { limit: 200 });
  const email = await processEmailQueue(db, { limit: 100 });
  const homeworkReminders = await remindDueHomework(db);
  const postsPublished = await publishDuePosts(db);
  const affiliates = await syncAffiliateRewards(db);
  // Dọn nhật ký đăng nhập quá 1 năm — mỗi giờ một lần
  const loginEventsPruned = new Date().getUTCMinutes() === 7 ? await pruneLoginEvents(db) : 0;
  // nhắc hết bảo lưu: chạy mỗi lần gọi nhưng không tạo trùng việc chăm sóc
  const pauseReminders = await remindPauseEnding(db);
  // Rà "Cần thực hiện" (đối soát ngân hàng, báo cáo marketing) — mỗi giờ một lần, không tạo trùng trong ngày
  const actionAlerts = new Date().getUTCMinutes() === 11 ? (await buildActionRequiredAlerts(db)).created : 0;
  await recordHeartbeat(db, "cron", { processed: r.processed, failed: r.failed });
  return NextResponse.json({ ok: true, slaEvents: sla, surveyInvites, email, homeworkReminders, postsPublished, affiliates, invoices, messages, push, loginEventsPruned, pauseReminders, actionAlerts, ...r });
}
