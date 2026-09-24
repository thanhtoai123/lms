/**
 * XỬ LÝ SỰ KIỆN ZALO OA — Đợt 2: ngoài tin nhắn, còn bốn việc sinh ra tiền hoặc giữ tiền.
 *
 *  • `follow` / `unfollow`  → biết ai còn quan tâm OA. Còn quan tâm thì nhắn miễn phí trong 48 giờ;
 *    rời OA rồi mà vẫn gõ trả lời thì Zalo nuốt tin — nhân viên tưởng đã trả lời khách.
 *  • `user_submit_info`     → khách **tự** bấm nút chia sẻ tên + SĐT. Đây là sự đồng ý rõ ràng do
 *    khách chủ động, nên hệ thống tạo lead ngay (ghi rõ nguồn) thay vì để nhân viên gõ tay.
 *  • `user_received_message`→ tin ZNS đã tới máy khách: `sent` mới có nghĩa "đã tới", đối soát được phí.
 *
 * Mọi nhánh đều chống lặp: sự kiện Zalo hay bắn lại, và webhook có thể được chạy lại bằng tay.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { conversations, messages, leads, parents, parentNotifications, type Database } from "@satarobo/db";
import { TRPCError } from "@trpc/server";
import { authorize, docSuKienZaloOa, replyWindow, SU_KIEN_OA_VI, XIN_THONG_TIN, type SuKienOa } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { ingestExternal } from "./messaging";
import { createLead } from "./leads";
import { accessTokenZalo } from "./zaloToken";
import { logger } from "../lib/logger";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
const log = logger.child("zalo-oa");

export type KetQuaOa = {
  ok: boolean;
  loai: SuKienOa["loai"];
  nhan: string;
  duplicate?: boolean;
  conversationId?: string;
  leadId?: string;
  error?: string;
};

/** Cờ đánh dấu khách đã rời OA — hiện ngay trên hội thoại để nhân viên không gõ tin vô ích */
export const CO_ROI_OA = "roi_oa";

async function hoiThoaiOa(d: Db, nguoiId: string) {
  return d.query.conversations.findFirst({ where: and(eq(conversations.channel, "zalo"), eq(conversations.externalId, nguoiId)) });
}

/**
 * Xử lý một sự kiện OA đã qua cửa chữ ký.
 * Dùng chung cho webhook và cho nút "Chạy lại" ở nhật ký webhook.
 */
export async function xuLySuKienOa(db: Database, body: unknown, actorId?: string | null): Promise<KetQuaOa> {
  const d = asDb(db);
  const sk = docSuKienZaloOa(body);
  if (!sk) return { ok: false, loai: "bo_qua", nhan: "Payload không đọc được", error: "Payload không phải JSON đối tượng" };
  const nhan = SU_KIEN_OA_VI[sk.loai];

  if (sk.loai === "tin_den") {
    const r = await ingestExternal(db, { channel: "zalo", senderId: sk.nguoiId!, text: sk.noiDung, messageId: sk.tinId!, at: sk.luc });
    if (!r.ok) return { ok: false, loai: sk.loai, nhan, error: r.error };
    // Khách nhắn lại nghĩa là vẫn còn liên lạc được — gỡ cờ "đã rời OA" nếu có
    await d.update(conversations)
      .set({ flags: sql`array_remove(${conversations.flags}, ${CO_ROI_OA})` })
      .where(and(eq(conversations.id, r.conversationId), sql`${CO_ROI_OA} = any(${conversations.flags})`));
    return { ok: true, loai: sk.loai, nhan, duplicate: r.duplicate, conversationId: r.conversationId };
  }

  if (sk.loai === "quan_tam" || sk.loai === "bo_quan_tam") {
    if (!sk.nguoiId) return { ok: true, loai: "bo_qua", nhan: "Sự kiện thiếu mã người dùng" };
    const c = await hoiThoaiOa(d, sk.nguoiId);
    const roi = sk.loai === "bo_quan_tam";
    if (c) {
      await d.update(conversations).set({
        flags: roi ? sql`array(select distinct unnest(${conversations.flags} || array[${CO_ROI_OA}]::text[]))` : sql`array_remove(${conversations.flags}, ${CO_ROI_OA})`,
        updatedAt: new Date(),
      }).where(eq(conversations.id, c.id));
      await d.insert(messages).values({
        conversationId: c.id, direction: "note", status: "received", externalId: `zalo:${sk.loai}:${sk.nguoiId}:${sk.luc.getTime()}`,
        body: roi ? "Khách đã bỏ quan tâm OA — từ giờ chỉ gửi được tin theo mẫu (ZNS)" : "Khách đã quan tâm OA trở lại",
        createdAt: sk.luc,
      }).onConflictDoNothing({ target: messages.externalId });
      // Quan tâm OA rồi thì nhắn theo user_id được — lưu vào hồ sơ phụ huynh để khỏi tốn ZNS
      if (!roi && c.parentId) {
        await d.update(parents).set({ zaloId: sk.nguoiId }).where(and(eq(parents.id, c.parentId), isNull(parents.zaloId)));
      }
      return { ok: true, loai: sk.loai, nhan, conversationId: c.id };
    }
    // Chưa có hội thoại: người mới quan tâm OA nhưng chưa nhắn gì — chưa có gì để lưu, ghi nhật ký là đủ
    return { ok: true, loai: sk.loai, nhan };
  }

  if (sk.loai === "gui_thong_tin") {
    if (!sk.nguoiId) return { ok: true, loai: "bo_qua", nhan: "Sự kiện thiếu mã người dùng" };
    const c = await hoiThoaiOa(d, sk.nguoiId);
    if (!c) return { ok: true, loai: sk.loai, nhan: `${nhan} (chưa có hội thoại tương ứng)` };
    const ghiChu = `Khách tự chia sẻ: ${sk.ten ?? "(không có tên)"}${sk.sdt ? ` · ${sk.sdt}` : ""}`;
    await d.insert(messages).values({
      conversationId: c.id, direction: "note", status: "received", body: ghiChu,
      externalId: `zalo:submit:${sk.nguoiId}:${sk.tinId ?? sk.luc.getTime()}`, createdAt: sk.luc,
    }).onConflictDoNothing({ target: messages.externalId });
    if (sk.ten && !c.displayName) await d.update(conversations).set({ displayName: sk.ten.slice(0, 120) }).where(eq(conversations.id, c.id));

    // Đã gắn lead/phụ huynh rồi thì chỉ bổ sung ghi chú, không tạo trùng
    if (c.leadId || c.parentId) return { ok: true, loai: sk.loai, nhan, conversationId: c.id, leadId: c.leadId ?? undefined };
    if (!sk.sdt) return { ok: true, loai: sk.loai, nhan: `${nhan} (không có SĐT nên chưa tạo lead)`, conversationId: c.id };

    try {
      // Khách CHỦ ĐỘNG bấm nút chia sẻ ⇒ đây là đồng ý thật, đủ căn cứ tạo lead (NĐ 13/2023)
      const r = await createLead(d, {
        parentName: sk.ten ?? "Khách Zalo", phone: sk.sdt, centerId: c.centerId, source: "zalo-oa",
        utmSource: "zalo", utmMedium: "chat", consent: true,
        notes: "Khách tự chia sẻ tên + SĐT qua nút Xin thông tin trên Zalo OA",
      }, actorId ?? null);
      if (r.lead) {
        await d.update(conversations).set({ leadId: r.lead.id, centerId: c.centerId ?? r.lead.centerId, updatedAt: new Date() }).where(eq(conversations.id, c.id));
        return { ok: true, loai: sk.loai, nhan, conversationId: c.id, leadId: r.lead.id, duplicate: r.duplicated };
      }
      return { ok: true, loai: sk.loai, nhan: `${nhan} (không tạo được lead)`, conversationId: c.id };
    } catch (e) {
      log.warn("Không tạo được lead từ thông tin khách tự gửi", { err: (e as Error).message });
      return { ok: true, loai: sk.loai, nhan: `${nhan} (lỗi tạo lead, đã ghi chú trong hội thoại)`, conversationId: c.id };
    }
  }

  if (sk.loai === "da_nhan_zns") {
    if (!sk.znsTinId) return { ok: true, loai: "bo_qua", nhan: "Sự kiện thiếu mã tin" };
    const r = await d.update(parentNotifications)
      .set({ deliveredAt: sk.luc })
      .where(and(eq(parentNotifications.providerRef, sk.znsTinId), isNull(parentNotifications.deliveredAt)))
      .returning({ id: parentNotifications.id });
    return { ok: true, loai: sk.loai, nhan, duplicate: r.length === 0 };
  }

  return { ok: true, loai: "bo_qua", nhan };
}

/* ------------------------------------------------------------------ */
/* Nút "Xin thông tin"                                                  */
/* ------------------------------------------------------------------ */

/** Lead sinh ra từ nút này — đếm ở màn Zalo CRM để biết nút có đáng dùng không */
export async function demLeadTuXinThongTin(db: Db, tuNgay: Date) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(sql`${leads.notes} like '%nút Xin thông tin%'`, sql`${leads.createdAt} >= ${tuNgay}`));
  return r?.n ?? 0;
}

/**
 * Gửi tin Tư vấn mẫu **"Xin thông tin"** (`request_user_info`): khách bấm một lần là Zalo gửi về
 * tên + SĐT qua sự kiện `user_submit_info` (xử lý ở trên). Đây là cách biến hội thoại ẩn danh thành
 * lead có SĐT **và có đồng ý** mà không phải hỏi tay.
 *
 * Chặn trước khi gọi: phải trong khung 48 giờ (ngoài khung Zalo không nhận), hội thoại phải là kênh
 * Zalo OA, và không gửi lại nếu 24 giờ qua đã xin một lần — nút này gửi dày rất phiền khách.
 */
export async function xinThongTinZalo(ctx: ProtectedContext, input: { id: string }) {
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.id) });
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy hội thoại" });
  if (c.channel !== "zalo") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chỉ dùng được trên hội thoại Zalo OA" });
  if (!authorize(ctx.actor, "message:create", { centerId: c.centerId }).allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền nhắn trong hội thoại này" });
  if (c.leadId || c.parentId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Hội thoại đã gắn lead / phụ huynh — không cần xin thông tin nữa" });
  const win = replyWindow("zalo", c.lastInboundAt, new Date());
  if (!win.allowed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: win.reason });
  const [gan] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.conversationId, c.id), eq(messages.tag, "XIN_THONG_TIN"), sql`${messages.createdAt} > now() - interval '24 hours'`));
  if ((gan?.n ?? 0) > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Đã xin thông tin trong 24 giờ qua — chờ khách trả lời đã" });

  const token = await accessTokenZalo(ctx.db as unknown as Database);
  if (!token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chưa khai báo Zalo OA (Tích hợp → Zalo OA)" });
  let status: "sent" | "failed" = "sent";
  let loi: string | null = null;
  let tinId: string | null = null;
  try {
    const r = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: token },
      body: JSON.stringify({
        recipient: { user_id: c.externalId },
        message: { attachment: { type: "template", payload: { template_type: "request_user_info", elements: [{ title: XIN_THONG_TIN.title, subtitle: XIN_THONG_TIN.subtitle, image_url: process.env.ZALO_XIN_THONG_TIN_ANH ?? undefined }] } } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: number; message?: string; data?: { message_id?: string } };
    if (!r.ok || j.error) { status = "failed"; loi = j.message ?? `Lỗi Zalo ${j.error ?? r.status}`; }
    else tinId = j.data?.message_id ?? null;
  } catch (e) {
    status = "failed";
    loi = (e as Error).message.slice(0, 200);
  }

  await ctx.db.insert(messages).values({
    conversationId: c.id, direction: "out", body: `[Xin thông tin] ${XIN_THONG_TIN.title}`, senderUserId: ctx.user.id,
    status, error: loi, tag: "XIN_THONG_TIN", externalId: tinId,
  });
  await ctx.db.update(conversations).set({ lastOutboundAt: new Date(), lastMessageAt: new Date(), lastPreview: "[Xin thông tin]", updatedAt: new Date() }).where(eq(conversations.id, c.id));
  return { status, error: loi };
}
