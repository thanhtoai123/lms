/**
 * TÀI KHOẢN KÊNH CHAT NGOÀI — khai báo nick Zalo cá nhân (chạy trên ZCRM) và nhận sự kiện của nó.
 *
 * Quan điểm thiết kế (xem docs/ZALO-KENH-TRINH-CAM.md): công cụ chat chạy NGOÀI hệ thống, hệ thống chỉ
 * **đọc** sự kiện đổ về. Nhờ vậy nick Zalo có bị khoá thì cũng chỉ mất kênh chat, toàn bộ lead và lịch
 * sử hội thoại vẫn nằm trong sổ sách.
 *
 * Bảo mật: mỗi tài khoản kênh có một bí mật riêng. Webhook phải kèm bí mật đó ở header `X-Webhook-Secret`
 * (so sánh theo thời gian hằng) HOẶC chữ ký HMAC-SHA256 của nguyên văn thân yêu cầu ở `X-Signature`.
 * Bí mật lưu mã hoá AES-256-GCM, không bao giờ trả về giao diện.
 */
import { and, eq, gte, isNull, desc, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { channelAccounts, conversations, messages, parents, leads, centers, appointments, type Database } from "@satarobo/db";
import { authorizeGlobal, docSuKienZcrm, duDeGhiTin, nickImLang, HAN_MUC_NICK_NGAY, type SuKienKenh, loiUrlCongNoi, khoaHoiThoai, timHoiThoaiZcrm, thanGuiZcrm, docLichHenZcrm, phanTichNhung, type HoiThoaiZcrm } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { sealWith, openWith } from "./pii";
import { writeAudit } from "./audit";
import { ingestExternal, ingestExternalOutbound } from "./messaging";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
/** Nhãn khoá mã hoá riêng cho kênh ngoài (khác nhãn PII và nhãn zalo OA) */
const NHAN = "kenh";
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

/** Ngày theo giờ VN, dạng YYYY-MM-DD — mốc reset bộ đếm tin/ngày */
export function ngayVN(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function slugHoa(raw: string): string {
  return raw
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Khai báo                                                             */
/* ------------------------------------------------------------------ */

export async function danhSachTaiKhoanKenh(ctx: ProtectedContext) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống xem được khai báo kênh");
  const rows = await ctx.db.query.channelAccounts.findMany({ orderBy: (t, { asc }) => [asc(t.channel), asc(t.label)] });
  const now = new Date();
  const homNay = ngayVN(now);
  return rows.map((r) => ({
    id: r.id, channel: r.channel, label: r.label, slug: r.slug, externalId: r.externalId, centerId: r.centerId,
    baseUrl: r.baseUrl, active: r.active, status: r.status,
    lastSeenAt: r.lastSeenAt, lastEventAt: r.lastEventAt, lastError: r.lastError,
    dailyCap: r.dailyCap, sentToday: r.sentDay === homNay ? r.sentToday : 0,
    imLang: nickImLang(r.lastSeenAt ?? r.lastEventAt, now),
    // Chỉ cho biết ĐÃ ĐẶT hay chưa — không bao giờ trả giá trị
    apiKeySet: !!r.apiKey, webhookSecretSet: !!r.webhookSecret,
  }));
}

export async function luuTaiKhoanKenh(ctx: ProtectedContext, input: {
  id?: string | null; channel: "zalo_ca_nhan"; label: string; centerId?: string | null; externalId?: string | null;
  baseUrl?: string | null; apiKey?: string | null; webhookSecret?: string | null; dailyCap?: number | null; active?: boolean;
}) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống được khai báo kênh");
  const label = input.label.trim();
  if (label.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Tên tài khoản kênh quá ngắn" });
  const cu = input.id ? await ctx.db.query.channelAccounts.findFirst({ where: eq(channelAccounts.id, input.id) }) : null;
  if (input.id && !cu) throw new TRPCError({ code: "NOT_FOUND", message: "Không thấy tài khoản kênh" });
  // Không gửi trường nào thì GIỮ NGUYÊN trường đó (sửa mỗi trần tin/ngày không được xoá mất địa chỉ API),
  // gửi chuỗi rỗng mới là cố ý xoá.
  const baseUrl = input.baseUrl === undefined ? (cu?.baseUrl ?? null) : (input.baseUrl?.trim() || null);
  const loiUrl = baseUrl ? loiUrlCongNoi(baseUrl) : null;
  if (loiUrl) throw new TRPCError({ code: "BAD_REQUEST", message: loiUrl });
  const slug = cu?.slug ?? `${slugHoa(label) || "nick"}-${Math.random().toString(36).slice(2, 6)}`;
  const giaTri = {
    channel: input.channel, label, slug, centerId: input.centerId ?? cu?.centerId ?? null,
    externalId: input.externalId?.trim() || cu?.externalId || null, baseUrl,
    apiKey: input.apiKey?.trim() ? sealWith(NHAN, input.apiKey.trim()) : (cu?.apiKey ?? null),
    webhookSecret: input.webhookSecret?.trim() ? sealWith(NHAN, input.webhookSecret.trim()) : (cu?.webhookSecret ?? null),
    dailyCap: Math.max(1, Math.min(1000, input.dailyCap ?? cu?.dailyCap ?? HAN_MUC_NICK_NGAY)),
    active: input.active ?? cu?.active ?? true,
    updatedBy: ctx.user.id,
  };
  const [row] = cu
    ? await ctx.db.update(channelAccounts).set(giaTri).where(eq(channelAccounts.id, cu.id)).returning()
    : await ctx.db.insert(channelAccounts).values(giaTri).returning();
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: cu ? "UPDATE" : "CREATE", module: "system", entity: "channel_accounts", entityId: row!.id,
    // Nhật ký chỉ ghi CÓ/KHÔNG với các khoá bí mật
    after: { channel: giaTri.channel, label, slug, baseUrl, dailyCap: giaTri.dailyCap, active: giaTri.active, apiKeySet: !!giaTri.apiKey, webhookSecretSet: !!giaTri.webhookSecret }, ip: ctx.ip,
  });
  return { id: row!.id, slug: row!.slug };
}

export async function xoaTaiKhoanKenh(ctx: ProtectedContext, input: { id: string }) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống được xoá khai báo kênh");
  const row = await ctx.db.query.channelAccounts.findFirst({ where: eq(channelAccounts.id, input.id) });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không thấy tài khoản kênh" });
  // Không xoá hội thoại đã nhận — chỉ ngắt kênh
  await ctx.db.update(channelAccounts).set({ active: false, status: "offline", updatedBy: ctx.user.id }).where(eq(channelAccounts.id, input.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "channel_accounts", entityId: input.id, after: { active: false }, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Nhận webhook                                                         */
/* ------------------------------------------------------------------ */

function bangNhau(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Bí mật đúng chưa: header bí mật thẳng, hoặc HMAC-SHA256 hex/base64 của nguyên văn thân yêu cầu */
export function chuKyHopLe(raw: string, headers: Record<string, string>, secret: string): boolean {
  const thang = headers["x-webhook-secret"] ?? headers["x-api-key"] ?? headers["x-zcrm-secret"];
  if (thang && bangNhau(thang, secret)) return true;
  // ZCRM v3.4: `X-Webhook-Signature` = HMAC-SHA256 hex của nguyên văn thân, không tiền tố
  const ky = headers["x-webhook-signature"] ?? headers["x-signature"] ?? headers["x-hub-signature-256"] ?? headers["x-zcrm-signature"];
  if (!ky) return false;
  const h = createHmac("sha256", secret).update(raw, "utf8").digest();
  const sach = ky.replace(/^sha256=/i, "").trim();
  return bangNhau(sach.toLowerCase(), h.toString("hex")) || bangNhau(sach, h.toString("base64"));
}

type KetQuaNhan =
  | { ok: true; status: "processed" | "duplicate" | "ignored"; loai?: string; conversationId?: string }
  | { ok: false; status: "rejected" | "failed"; httpStatus: number; error: string };

/**
 * Nhận một sự kiện của công cụ chat ngoài.
 * Thứ tự: tìm tài khoản kênh → kiểm bí mật → đọc sự kiện → ghi hội thoại / cập nhật trạng thái nick.
 */
export async function nhanSuKienKenh(db: Database, input: { slug: string; raw: string; headers: Record<string, string>; body: unknown }): Promise<KetQuaNhan> {
  const d = asDb(db);
  const acc = await d.query.channelAccounts.findFirst({ where: and(eq(channelAccounts.slug, input.slug), eq(channelAccounts.channel, "zalo_ca_nhan")) });
  if (!acc) return { ok: false, status: "rejected", httpStatus: 404, error: "Không có tài khoản kênh cho đường dẫn này" };
  if (!acc.active) return { ok: false, status: "rejected", httpStatus: 403, error: "Tài khoản kênh đã tắt" };
  const secret = openWith(NHAN, acc.webhookSecret);
  if (!secret) return { ok: false, status: "rejected", httpStatus: 503, error: "Tài khoản kênh chưa đặt bí mật webhook" };
  if (!chuKyHopLe(input.raw, input.headers, secret)) return { ok: false, status: "rejected", httpStatus: 401, error: "Sai bí mật / chữ ký" };
  return apDungSuKien(db, acc, input.body, input.headers["x-webhook-event"] ?? null);
}

/**
 * Chạy lại một sự kiện đã lưu ở `webhook_events` (người quản trị bấm "Chạy lại").
 * Không kiểm chữ ký: sự kiện đã qua cửa chữ ký lúc nhận, và người bấm phải có `system:update`.
 */
export async function xuLyLaiSuKienKenh(db: Database, input: { slug: string | null; body: unknown }): Promise<KetQuaNhan> {
  const d = asDb(db);
  const acc = input.slug
    ? await d.query.channelAccounts.findFirst({ where: and(eq(channelAccounts.slug, input.slug), eq(channelAccounts.channel, "zalo_ca_nhan")) })
    : await d.query.channelAccounts.findFirst({ where: eq(channelAccounts.channel, "zalo_ca_nhan") });
  if (!acc) return { ok: false, status: "rejected", httpStatus: 404, error: "Không còn tài khoản kênh tương ứng để chạy lại" };
  return apDungSuKien(db, acc, input.body);
}

type TaiKhoanKenh = typeof channelAccounts.$inferSelect;

/** Hội thoại nhóm đã biết (mã hội thoại ZCRM → hạn nhớ) — khỏi hỏi lại API mỗi tin nhóm */
const NHOM_DA_BIET = new Map<string, number>();
const NHO_NHOM_MS = 6 * 3600_000;

/** Gọi API công khai của ZCRM (X-API-Key). Hỏng thì trả null — webhook vẫn phải ghi được tin. */
async function goiZcrm(acc: TaiKhoanKenh, duongDan: string): Promise<unknown | null> {
  const baseUrl = acc.baseUrl?.replace(/\/+$/, "") ?? null;
  const apiKey = openWith(NHAN, acc.apiKey);
  if (!baseUrl || !apiKey || loiUrlCongNoi(baseUrl)) return null;
  try {
    const r = await fetch(`${baseUrl}${duongDan}`, { headers: { "X-API-Key": apiKey }, redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Tên khách, SĐT, mã luồng để trả lời — webhook tin nhắn của ZCRM không mang theo, phải tra */
async function traHoiThoaiZcrm(acc: TaiKhoanKenh, id: string): Promise<HoiThoaiZcrm | null> {
  return timHoiThoaiZcrm(await goiZcrm(acc, "/api/public/conversations?limit=50"), id);
}

/**
 * Gắn hội thoại vào phụ huynh / lead ĐÃ CÓ theo SĐT (không tạo mới — tạo lead cần dấu đồng ý).
 * Chỉ tìm trong cùng trung tâm (tenant) với nick nhận tin.
 */
async function ganTheoSdt(d: Db, convId: string, sdt: string, centerId: string | null) {
  const tenant = centerId ? (await d.select({ t: centers.tenantId }).from(centers).where(eq(centers.id, centerId)))[0]?.t ?? null : null;
  const [ph] = await d.select({ id: parents.id }).from(parents)
    .where(and(eq(parents.phoneNormalized, sdt), isNull(parents.deletedAt), tenant ? eq(parents.tenantId, tenant) : sql`true`)).limit(2);
  if (ph) {
    await d.update(conversations).set({ parentId: ph.id }).where(and(eq(conversations.id, convId), isNull(conversations.parentId), isNull(conversations.leadId)));
    return;
  }
  const [ld] = await d.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.phoneNormalized, sdt), centerId ? eq(leads.centerId, centerId) : sql`true`)).orderBy(desc(leads.createdAt)).limit(1);
  if (ld) await d.update(conversations).set({ leadId: ld.id }).where(and(eq(conversations.id, convId), isNull(conversations.parentId), isNull(conversations.leadId)));
}

async function apDungSuKien(db: Database, acc: TaiKhoanKenh, body: unknown, suKienHeader: string | null = null): Promise<KetQuaNhan> {
  const d = asDb(db);
  const sk = docSuKienZcrm(body, new Date(), suKienHeader);
  const now = new Date();
  if (!sk) {
    await d.update(channelAccounts).set({ lastEventAt: now }).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "ignored" };
  }

  // Mọi sự kiện hợp lệ đều là bằng chứng công cụ còn sống
  const chung = { lastEventAt: now, lastSeenAt: now } as const;

  if (sk.loai === "ket_noi" || sk.loai === "mat_ket_noi") {
    const song = sk.loai === "ket_noi";
    await d.update(channelAccounts).set({
      ...chung, status: song ? "online" : "offline",
      lastError: song ? null : `Nick Zalo${sk.nickId ? ` ${sk.nickId.slice(0, 8)}…` : ""} mất kết nối`,
      lastErrorAt: song ? null : now,
      ...(song ? {} : { lastSeenAt: acc.lastSeenAt }),
      // Mã nick mặc định chỉ tự điền khi chưa khai — một tổ chức ZCRM có thể có nhiều nick
      externalId: acc.externalId ?? sk.nickId,
    }).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "processed", loai: sk.loai };
  }

  if (sk.loai === "khach_moi") {
    // ZCRM v3.4: `contact.created` chỉ có { contactId, fullName } — không có mã Zalo để gom với tin nhắn,
    // nên KHÔNG dựng vỏ hội thoại (sẽ thành hội thoại ma). Hội thoại tự có khi khách nhắn tin đầu tiên.
    await d.update(channelAccounts).set({ ...chung, status: "online" }).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "ignored", loai: sk.loai };
  }

  if (!duDeGhiTin(sk)) {
    await d.update(channelAccounts).set(chung).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "ignored" };
  }

  const khoa = khoaHoiThoai(sk)!;
  const tieuDe = `Zalo cá nhân — ${acc.label}`;
  const nhoNhom = NHOM_DA_BIET.get(khoa);
  if (nhoNhom && nhoNhom > Date.now()) return { ok: true, status: "ignored", loai: "nhom" };

  let conv = await d.query.conversations.findFirst({ where: and(eq(conversations.channel, "zalo_ca_nhan"), eq(conversations.externalId, khoa)) });
  // Lần đầu gặp hội thoại (hoặc chưa biết mã luồng): tra API để có tên, SĐT, mã luồng, loại luồng
  const info = sk.hoiThoaiId && (!conv || !conv.extThreadId) ? await traHoiThoaiZcrm(acc, sk.hoiThoaiId) : null;
  const loaiLuong = info?.loaiLuong ?? sk.loaiLuong ?? (conv?.extThreadType as "user" | "group" | null) ?? null;
  if (loaiLuong === "group") {
    // Tin nhóm (nhóm lớp, nhóm phụ huynh) KHÔNG đưa vào hệ thống: là dữ liệu của nhiều người chưa
    // liên hệ với trung tâm, và không phải việc 1-1 của tư vấn viên
    NHOM_DA_BIET.set(khoa, Date.now() + NHO_NHOM_MS);
    await d.update(channelAccounts).set(chung).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "ignored", loai: "nhom" };
  }
  const threadId = info?.threadId ?? sk.threadId ?? conv?.extThreadId ?? (sk.loai === "tin_den" ? sk.nguoiId : null);
  const nickId = info?.nickId ?? sk.nickId ?? conv?.extNickId ?? null;
  const tinId = sk.tinId ?? `${khoa}-${sk.luc.getTime()}`;
  const chung2 = { ...chung, status: "online" as const };

  let r: { ok: true; conversationId: string; duplicate: boolean } | { ok: false; error: string };
  if (sk.loai === "tin_den") {
    r = await ingestExternal(db, {
      channel: "zalo_ca_nhan", senderId: khoa, displayName: info?.ten ?? sk.tenHienThi, text: sk.noiDung,
      messageId: tinId, at: sk.luc, attachments: sk.tepDinhKem.length ? sk.tepDinhKem : null,
      subject: tieuDe, centerId: acc.centerId, channelAccountId: acc.id,
    });
    await d.update(channelAccounts).set(chung2).where(eq(channelAccounts.id, acc.id));
  } else {
    // tin_di. Tin do nhân viên gửi TỪ HỆ THỐNG sẽ dội về đây lần nữa (ZCRM bắn `message.sent` cho mọi tin
    // của nick) — đã lưu lúc gửi, chỉ gắn mã tin của công cụ vào, không ghi đôi
    if (conv) {
      const [cuaMinh] = await d.select({ id: messages.id }).from(messages).where(and(
        eq(messages.conversationId, conv.id), eq(messages.direction, "out"), isNull(messages.externalId),
        eq(messages.body, sk.noiDung.trim().slice(0, 4000)), gte(messages.createdAt, new Date(sk.luc.getTime() - 15 * 60_000)),
      )).orderBy(desc(messages.createdAt)).limit(1);
      if (cuaMinh) {
        await d.update(messages).set({ externalId: `zalo_ca_nhan:${tinId}`, status: "sent" }).where(eq(messages.id, cuaMinh.id));
        await d.update(channelAccounts).set(chung2).where(eq(channelAccounts.id, acc.id));
        return { ok: true, status: "duplicate", loai: sk.loai, conversationId: conv.id };
      }
    }
    r = await ingestExternalOutbound(db, {
      channel: "zalo_ca_nhan", senderId: khoa, text: sk.noiDung, messageId: tinId, at: sk.luc,
      attachments: sk.tepDinhKem.length ? sk.tepDinhKem : null, subject: tieuDe, centerId: acc.centerId, channelAccountId: acc.id,
    });
    const homNay = ngayVN(now);
    await d.update(channelAccounts).set({
      ...chung2,
      sentDay: homNay,
      sentToday: acc.sentDay === homNay ? sql`${channelAccounts.sentToday} + 1` : 1,
    }).where(eq(channelAccounts.id, acc.id));
  }
  if (!r.ok) return { ok: false, status: "rejected", httpStatus: 400, error: r.error };

  // Ghi thông tin để trả lời được + gắn hồ sơ có sẵn theo SĐT
  const vua = conv ?? (await d.query.conversations.findFirst({ where: eq(conversations.id, r.conversationId) }));
  if (vua) {
    const patch: Partial<typeof conversations.$inferInsert> = {};
    if (threadId && vua.extThreadId !== threadId) patch.extThreadId = threadId;
    if (nickId && vua.extNickId !== nickId) patch.extNickId = nickId;
    if (loaiLuong && vua.extThreadType !== loaiLuong) patch.extThreadType = loaiLuong;
    if (info?.ten && !vua.displayName) patch.displayName = info.ten.slice(0, 120);
    if (Object.keys(patch).length) await d.update(conversations).set(patch).where(eq(conversations.id, vua.id));
    if (info?.sdt && !vua.parentId && !vua.leadId) await ganTheoSdt(d, vua.id, info.sdt, acc.centerId);
  }
  return { ok: true, status: r.duplicate ? "duplicate" : "processed", loai: sk.loai, conversationId: r.conversationId };
}

/* ------------------------------------------------------------------ */
/* Cho màn Zalo CRM                                                     */
/* ------------------------------------------------------------------ */

export interface NickCaNhan {
  id: string; label: string; status: string; imLang: boolean;
  sentToday: number; dailyCap: number; conLai: number;
  lastSeenAt: Date | null; lastEventAt: Date | null; lastError: string | null;
}

/** Trạng thái các nick Zalo cá nhân — dùng ở khối "Zalo cá nhân" của màn Zalo CRM */
export async function nickCaNhan(db: Db, now: Date = new Date()): Promise<NickCaNhan[]> {
  const rows = await db.query.channelAccounts.findMany({
    where: and(eq(channelAccounts.channel, "zalo_ca_nhan"), eq(channelAccounts.active, true)),
    orderBy: (t, { asc }) => [asc(t.label)],
  });
  const homNay = ngayVN(now);
  return rows.map((r) => {
    const daGui = r.sentDay === homNay ? r.sentToday : 0;
    return {
      id: r.id, label: r.label, status: r.status, imLang: nickImLang(r.lastSeenAt ?? r.lastEventAt, now),
      sentToday: daGui, dailyCap: r.dailyCap, conLai: Math.max(0, r.dailyCap - daGui),
      lastSeenAt: r.lastSeenAt, lastEventAt: r.lastEventAt, lastError: r.lastError,
    };
  });
}

export type { SuKienKenh };

/* ------------------------------------------------------------------ */
/* Gửi ra qua công cụ ngoài                                             */
/* ------------------------------------------------------------------ */

/**
 * Thân yêu cầu gửi tin: mỗi bản ZCRM đặt tên trường một khác, nên gửi kèm vài tên đồng nghĩa.
 * Trường thừa bị bỏ qua ở phía nhận; thiếu tên đúng thì tin không đi, nên rộng còn hơn hụt.
 * Nếu bản của trung tâm dùng tên khác nữa thì thêm ở ĐÚNG MỘT CHỖ này.
 */
/** Hội thoại cần gì để trả lời qua ZCRM v3.4: mã nick (zaloAccountId) + mã luồng Zalo */
export interface DichGui {
  nickId: string | null;
  threadId: string | null;
  nhom: boolean;
}

export type KetQuaGui = { status: "sent" | "skipped" | "failed"; externalId?: string; error?: string };

/**
 * Gửi tin ra nick Zalo cá nhân qua API của công cụ ngoài.
 *
 * Hai cửa chặn trước khi gọi ra ngoài, theo đúng thứ tự:
 *  1. **Trần tin/ngày của nick** — tăng bộ đếm bằng MỘT câu UPDATE có điều kiện (`sent_today < daily_cap`),
 *     nên hai người cùng bấm gửi cũng không vượt trần. Chạm trần thì trả `skipped`, không gọi ra ngoài.
 *  2. Thiếu khai báo (địa chỉ API / khoá) → `skipped` kèm lý do rõ, tin vẫn lưu nội bộ.
 * Gọi ra ngoài hỏng thì **hoàn lại** bộ đếm — tin không đi mà vẫn trừ hạn mức là mất chỗ gửi oan.
 */
export async function guiQuaKenh(db: Database, input: { channelAccountId: string | null; nguoiId: string; body: string; dich?: DichGui }): Promise<KetQuaGui> {
  const d = asDb(db);
  const acc = input.channelAccountId
    ? await d.query.channelAccounts.findFirst({ where: eq(channelAccounts.id, input.channelAccountId) })
    : await d.query.channelAccounts.findFirst({ where: and(eq(channelAccounts.channel, "zalo_ca_nhan"), eq(channelAccounts.active, true)) });
  if (!acc) return { status: "skipped", error: "Hội thoại chưa gắn nick nào — khai báo ở Tích hợp → Zalo cá nhân" };
  if (!acc.active) return { status: "skipped", error: `Nick “${acc.label}” đã bị ngắt khỏi hệ thống` };
  const baseUrl = acc.baseUrl?.replace(/\/+$/, "") ?? null;
  const apiKey = openWith(NHAN, acc.apiKey);
  if (!baseUrl || !apiKey) return { status: "skipped", error: `Nick “${acc.label}” chưa có địa chỉ API / khoá — tin chỉ lưu nội bộ` };
  // ZCRM đòi đúng nick + đúng luồng: uid của một khách KHÁC NHAU giữa các nick, gửi nhầm nick là
  // tin không đi (hoặc tệ hơn, tới nhầm người). Không đủ thông tin thì KHÔNG đoán.
  const nickId = input.dich?.nickId ?? acc.externalId;
  const threadId = input.dich?.threadId ?? (/^\d{5,30}$/.test(input.nguoiId) ? input.nguoiId : null);
  if (input.dich?.nhom) return { status: "skipped", error: "Không trả lời hội thoại nhóm từ hệ thống" };
  if (!nickId) return { status: "skipped", error: `Chưa biết nick ZCRM để gửi — khai “Mã nick trong ZCRM” cho “${acc.label}” ở Tích hợp` };
  if (!threadId) return { status: "skipped", error: "Chưa biết mã luồng Zalo của khách — chờ khách nhắn thêm một tin rồi trả lời" };

  const homNay = ngayVN();
  const [giu] = await d
    .update(channelAccounts)
    .set({
      sentDay: homNay,
      sentToday: sql`case when ${channelAccounts.sentDay} = ${homNay} then ${channelAccounts.sentToday} + 1 else 1 end`,
    })
    .where(and(
      eq(channelAccounts.id, acc.id),
      sql`(${channelAccounts.sentDay} is distinct from ${homNay} or ${channelAccounts.sentToday} < ${channelAccounts.dailyCap})`,
    ))
    .returning({ sentToday: channelAccounts.sentToday, dailyCap: channelAccounts.dailyCap });
  if (!giu) return { status: "skipped", error: `Nick “${acc.label}” đã chạm trần ${acc.dailyCap} tin hôm nay — gửi tiếp dễ bị Zalo khoá nick` };

  const hoanLai = async (loi: string): Promise<KetQuaGui> => {
    await d.update(channelAccounts)
      .set({ sentToday: sql`greatest(0, ${channelAccounts.sentToday} - 1)`, lastError: loi.slice(0, 300), lastErrorAt: new Date() })
      .where(eq(channelAccounts.id, acc.id));
    return { status: "failed", error: loi };
  };

  try {
    // Kiểm lại lúc GỬI (dòng cũ lưu trước khi có luật) và không theo chuyển hướng
    const loiGui = loiUrlCongNoi(baseUrl);
    if (loiGui) return await hoanLai(loiGui);
    const r = await fetch(`${baseUrl}/api/public/messages/send`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(thanGuiZcrm({ nickId, threadId, noiDung: input.body })),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as { messageId?: string; message_id?: string; id?: string; data?: { messageId?: string; id?: string }; error?: string; message?: string };
    if (!r.ok) return hoanLai(j.error ?? j.message ?? `Công cụ trả lỗi HTTP ${r.status}`);
    await d.update(channelAccounts).set({ lastError: null, lastErrorAt: null, lastSeenAt: new Date() }).where(eq(channelAccounts.id, acc.id));
    return { status: "sent", externalId: j.messageId ?? j.message_id ?? j.data?.messageId ?? j.data?.id ?? j.id };
  } catch (e) {
    return hoanLai(e instanceof Error ? `Không gọi được công cụ: ${e.message}`.slice(0, 300) : "Không gọi được công cụ");
  }
}

/* ------------------------------------------------------------------ */
/* Đồng bộ lịch hẹn ZCRM → LMS (worker, mỗi 15 phút)                   */
/* ------------------------------------------------------------------ */

/**
 * Kéo lịch hẹn từ `GET /api/public/appointments` của ZCRM (từ hôm qua tới 30 ngày tới) về bảng
 * `appointments`, khoá chống trùng `external_ref = "zcrm:<id>"`.
 *
 * Chỉ nhận lịch hẹn của khách **đã có hồ sơ** (lead hoặc phụ huynh, khớp theo SĐT) — không tự tạo
 * lead từ danh bạ Zalo của nhân viên. Lịch hẹn đổi giờ / đổi trạng thái bên ZCRM thì cập nhật theo;
 * lịch hẹn đã chốt trong LMS (xong / không đến / huỷ) thì LMS là nguồn đúng, không bị ghi đè.
 */
export async function dongBoLichHenZcrm(db: Database, now: Date = new Date()): Promise<{ nhan: number; boQua: number }> {
  const d = asDb(db);
  const ds = await d.select().from(channelAccounts).where(and(eq(channelAccounts.channel, "zalo_ca_nhan"), eq(channelAccounts.active, true)));
  let nhan = 0, boQua = 0;
  const tu = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const den = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  for (const acc of ds) {
    const json = await goiZcrm(acc, `/api/public/appointments?from=${tu}&to=${den}`);
    const hen = json && typeof json === "object" && Array.isArray((json as { appointments?: unknown }).appointments) ? (json as { appointments: unknown[] }).appointments : [];
    for (const raw of hen) {
      const h = docLichHenZcrm(raw);
      if (!h || !h.sdt) { boQua++; continue; }
      const [ph] = await d.select({ id: parents.id }).from(parents).where(and(eq(parents.phoneNormalized, h.sdt), isNull(parents.deletedAt))).limit(1);
      const [ld] = ph ? [] : await d.select({ id: leads.id, centerId: leads.centerId, owner: leads.assignedToId }).from(leads)
        .where(and(eq(leads.phoneNormalized, h.sdt), acc.centerId ? eq(leads.centerId, acc.centerId) : sql`true`)).orderBy(desc(leads.createdAt)).limit(1);
      if (!ph && !ld) { boQua++; continue; }
      const ref = `zcrm:${h.id}`;
      const cu = await d.query.appointments.findFirst({ where: eq(appointments.externalRef, ref) });
      if (cu && cu.status !== "dat") { continue; }
      const giaTri = {
        title: h.tieuDe, kind: h.loai, at: h.luc, durationMin: h.thoiLuongPhut, status: h.trangThai, note: h.ghiChu,
        leadId: ld?.id ?? null, parentId: ph?.id ?? null, centerId: ld?.centerId ?? acc.centerId, assignedTo: ld?.owner ?? null,
        externalRef: ref,
      };
      if (cu) {
        await d.update(appointments).set({ ...giaTri, remindedAt: cu.at.getTime() !== h.luc.getTime() ? null : cu.remindedAt }).where(eq(appointments.id, cu.id));
      } else {
        await d.insert(appointments).values(giaTri).onConflictDoNothing();
      }
      nhan++;
    }
  }
  return { nhan, boQua };
}

/** Nút "Đồng bộ lịch hẹn ngay" ở Tích hợp — chỉ quản trị hệ thống */
export async function dongBoLichHenNgay(ctx: ProtectedContext) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống được đồng bộ");
  const r = await dongBoLichHenZcrm(ctx.db as unknown as Database);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "message", entity: "appointments", entityId: null, after: r, reason: "Đồng bộ lịch hẹn từ Zalo CRM", ip: ctx.ip });
  return r;
}

/* ------------------------------------------------------------------ */
/* Giao diện ZCRM nhúng trong màn Zalo CRM                              */
/* ------------------------------------------------------------------ */

function nguonCua(url: string | null | undefined): string | null {
  try { return url ? new URL(url).origin : null; } catch { return null; }
}

/**
 * Các ZCRM đã khai (địa chỉ API = địa chỉ web: ZCRM v3.4 phục vụ giao diện và API trên cùng một gốc)
 * kèm kết quả kiểm tra "trình duyệt có cho nhúng không". Kiểm ở MÁY CHỦ vì trang không đọc được header
 * của một miền khác — nếu để trình duyệt tự thử, khung chỉ trắng trơn mà không ai biết vì sao.
 */
export async function giaoDienZcrm(ctx: ProtectedContext) {
  requirePermission(ctx, "message:read");
  requirePermission(ctx, "lead:read");
  const ds = await ctx.db.select().from(channelAccounts).where(and(eq(channelAccounts.channel, "zalo_ca_nhan"), eq(channelAccounts.active, true)));
  const nguonLms = nguonCua(process.env.NEXT_PUBLIC_APP_URL) ?? "http://localhost:3000";
  const choPhep = [process.env.ZCRM_ORIGINS, process.env.CSP_FRAME_SRC_EXTRA].filter(Boolean).join(" ").split(/[\s,]+/).map((x) => x.trim().replace(/\/+$/, "")).filter(Boolean);
  const out: { id: string; label: string; url: string; nguon: string; nhungDuoc: boolean; lyDo: string[] }[] = [];
  for (const acc of ds) {
    const nguon = nguonCua(acc.baseUrl);
    if (!nguon) continue;
    const lyDo: string[] = [];
    let nhungDuoc = false;
    const loiUrl = loiUrlCongNoi(nguon);
    if (loiUrl) {
      lyDo.push(loiUrl);
    } else {
      try {
        const r = await fetch(`${nguon}/`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5_000) });
        const h: Record<string, string> = {};
        r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
        const kq = phanTichNhung(h, nguon, nguonLms);
        nhungDuoc = kq.nhungDuoc;
        lyDo.push(...kq.lyDo);
      } catch {
        lyDo.push("Máy chủ hệ thống không gọi được tới ZCRM — kiểm tra địa chỉ hoặc ZCRM có đang chạy");
      }
    }
    // Phía LMS: CSP `frame-src` phải liệt kê miền ZCRM, không thì chính trình duyệt chặn khung
    if (!choPhep.some((c) => c.toLowerCase() === nguon.toLowerCase())) {
      nhungDuoc = false;
      lyDo.push(`Hệ thống chưa cho phép nhúng ${nguon} — thêm vào biến ZCRM_ORIGINS rồi khởi động lại`);
    }
    out.push({ id: acc.id, label: acc.label, url: `${nguon}/`, nguon, nhungDuoc, lyDo });
  }
  return { nguonLms, ds: out };
}
