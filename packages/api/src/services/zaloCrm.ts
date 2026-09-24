/**
 * ZALO CRM — một màn hình duy nhất trả lời bốn câu hỏi của người bán hàng:
 *
 *  1. Kênh Zalo còn sống không?      (token còn hạn, webhook còn nhận tin, ZNS đang ở chế độ nào)
 *  2. Có ai đang chờ trả lời không?  (hội thoại mở, ai chờ lâu nhất)
 *  3. Sắp mất khung miễn phí chưa?   (Zalo chỉ cho trả lời miễn phí trong 48 giờ kể từ tin của khách —
 *                                     quá khung là phải dùng tin theo mẫu, tốn phí và cứng nhắc)
 *  4. Khách từ Zalo ra tiền chưa?    (bao nhiêu hội thoại thành lead, bao nhiêu lead đã ghi danh)
 *
 * Trước đây các mảnh này nằm rải ở bốn màn khác nhau (Hộp thư, Giám sát hội thoại, Thông báo phụ
 * huynh, Tích hợp) nên không ai nhìn ra bức tranh Zalo. Màn này gom lại, không thay thế màn nào.
 */
import { and, eq, sql, desc, gte, isNotNull } from "drizzle-orm";
import { conversations, messages, leads, users, parentNotifications, webhookEvents } from "@satarobo/db";
import { ZALO_CS_WINDOW_HOURS, replyWindow, replyWindowLeft, LEAD_STATUS_VI, type LeadStatus } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { trangThaiTokenZalo } from "./zaloToken";
import { deliverySettings } from "./delivery";

/** Mốc "sắp hết khung" — dưới 6 giờ thì phải trả lời ngay hôm nay */
const SAP_HET_GIO = 6;

export async function zaloCrm(ctx: ProtectedContext, input: { days?: number } = {}) {
  requirePermission(ctx, "message:read");
  const days = Math.min(180, Math.max(7, input.days ?? 30));
  const tuNgay = new Date(Date.now() - days * 86_400_000);
  const now = new Date();

  const [token, delivery] = await Promise.all([
    trangThaiTokenZalo(ctx.db as never),
    deliverySettings(ctx.db),
  ]);

  /* --- Hội thoại Zalo: đếm theo trạng thái + gắn lead ------------------ */
  const [dem] = await ctx.db
    .select({
      tong: sql<number>`count(*)::int`,
      dangMo: sql<number>`count(*) filter (where ${conversations.status} <> 'closed')::int`,
      chuaGanLead: sql<number>`count(*) filter (where ${conversations.leadId} is null and ${conversations.status} <> 'closed')::int`,
      daGanLead: sql<number>`count(*) filter (where ${conversations.leadId} is not null)::int`,
    })
    .from(conversations)
    .where(and(eq(conversations.channel, "zalo"), gte(conversations.createdAt, tuNgay)));

  /* --- Lead sinh ra từ Zalo và đã ghi danh bao nhiêu ------------------- */
  const [leadDem] = await ctx.db
    .select({
      tong: sql<number>`count(distinct ${leads.id})::int`,
      daGhiDanh: sql<number>`count(distinct ${leads.id}) filter (where ${leads.status} = 'enrolled')::int`,
    })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .where(and(eq(conversations.channel, "zalo"), gte(conversations.createdAt, tuNgay)));

  /* --- Tin đến / tin đi trong kỳ --------------------------------------- */
  const [tin] = await ctx.db
    .select({
      den: sql<number>`count(*) filter (where ${messages.direction} = 'in')::int`,
      di: sql<number>`count(*) filter (where ${messages.direction} = 'out')::int`,
      loi: sql<number>`count(*) filter (where ${messages.status} in ('failed','skipped'))::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(conversations.channel, "zalo"), gte(messages.createdAt, tuNgay)));

  /* --- Hội thoại đang mở + còn bao lâu hết khung 48 giờ ---------------- */
  const moRa = await ctx.db
    .select({
      id: conversations.id,
      ten: conversations.displayName,
      preview: conversations.lastPreview,
      lastInboundAt: conversations.lastInboundAt,
      lastMessageAt: conversations.lastMessageAt,
      waitingSince: conversations.waitingSince,
      leadId: conversations.leadId,
      leadStatus: leads.status,
      nguoiPhuTrach: users.fullName,
    })
    .from(conversations)
    .leftJoin(leads, eq(leads.id, conversations.leadId))
    .leftJoin(users, eq(users.id, conversations.assignedTo))
    .where(and(eq(conversations.channel, "zalo"), sql`${conversations.status} <> 'closed'`))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  const hoiThoai = moRa.map((c) => {
    const win = replyWindow("zalo", c.lastInboundAt, now);
    const con = win.allowed ? replyWindowLeft(win.expiresAt, now) : null;
    const gioCon = con ? con.ms / 3_600_000 : 0;
    return {
      id: c.id,
      ten: c.ten ?? "Khách Zalo",
      preview: c.preview,
      lastMessageAt: c.lastMessageAt,
      cho: c.waitingSince ? Math.round((now.getTime() - c.waitingSince.getTime()) / 60000) : null,
      leadId: c.leadId,
      leadStatusLabel: c.leadStatus ? (LEAD_STATUS_VI[c.leadStatus as LeadStatus] ?? c.leadStatus) : null,
      nguoiPhuTrach: c.nguoiPhuTrach,
      /** Còn trong khung 48 giờ không, và còn bao lâu */
      trongKhung: win.allowed,
      conLai: con?.label ?? null,
      sapHet: win.allowed && gioCon > 0 && gioCon <= SAP_HET_GIO,
    };
  });

  /* --- ZNS trong kỳ ----------------------------------------------------- */
  const [zns] = await ctx.db
    .select({
      daGui: sql<number>`count(*) filter (where ${parentNotifications.status} = 'sent')::int`,
      cho: sql<number>`count(*) filter (where ${parentNotifications.status} = 'queued')::int`,
      loi: sql<number>`count(*) filter (where ${parentNotifications.status} = 'failed')::int`,
    })
    .from(parentNotifications)
    .where(and(eq(parentNotifications.channel, "zns"), gte(parentNotifications.createdAt, tuNgay)));

  const znsTheoMau = await ctx.db
    .select({ mau: parentNotifications.template, n: sql<number>`count(*)::int`, loi: sql<number>`count(*) filter (where ${parentNotifications.status} = 'failed')::int` })
    .from(parentNotifications)
    .where(and(eq(parentNotifications.channel, "zns"), gte(parentNotifications.createdAt, tuNgay)))
    .groupBy(parentNotifications.template)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  /* --- Webhook: kênh còn nhận tin không -------------------------------- */
  const [wh] = await ctx.db
    .select({
      nhanGanNhat: sql<Date | null>`max(${webhookEvents.receivedAt})`,
      trong24h: sql<number>`count(*) filter (where ${webhookEvents.receivedAt} > now() - interval '24 hours')::int`,
      tuChoi24h: sql<number>`count(*) filter (where ${webhookEvents.status} = 'rejected' and ${webhookEvents.receivedAt} > now() - interval '24 hours')::int`,
      loi24h: sql<number>`count(*) filter (where ${webhookEvents.status} = 'failed' and ${webhookEvents.receivedAt} > now() - interval '24 hours')::int`,
    })
    .from(webhookEvents)
    .where(eq(webhookEvents.source, "zalo"));

  /* --- Cảnh báo: những thứ khiến kênh Zalo ngừng chạy ------------------ */
  const canhBao: { muc: "chan" | "luu_y"; text: string; href?: string }[] = [];
  if (!token.configured && !token.fromEnv) canhBao.push({ muc: "chan", text: "Chưa khai báo ứng dụng Zalo OA — không gửi được tin nào ra ngoài.", href: "/tich-hop" });
  else if (token.fromEnv) canhBao.push({ muc: "luu_y", text: "Đang dùng token đặt trong biến môi trường: token Zalo chỉ sống 25 giờ và hệ thống KHÔNG tự làm mới được kiểu này.", href: "/tich-hop" });
  else if (!token.usable) canhBao.push({ muc: "chan", text: `Token Zalo đã hết hạn${token.lastError ? ` (${token.lastError})` : ""} — tin Zalo đang không gửi được.`, href: "/tich-hop" });
  else if ((token.minutesLeft ?? 0) < 120) canhBao.push({ muc: "luu_y", text: "Token Zalo sắp hết hạn, hệ thống sẽ tự làm mới ở nhịp tới.", href: "/tich-hop" });
  if ((wh?.trong24h ?? 0) === 0) canhBao.push({ muc: "luu_y", text: "24 giờ qua không nhận được sự kiện nào từ Zalo — kiểm tra webhook nếu trung tâm vẫn có khách nhắn.", href: "/crm/webhook-replay?source=zalo" });
  if ((wh?.tuChoi24h ?? 0) > 0) canhBao.push({ muc: "chan", text: `${wh!.tuChoi24h} sự kiện Zalo bị từ chối trong 24 giờ (sai chữ ký hoặc quá hạn) — tin của khách có thể đã rơi.`, href: "/crm/webhook-replay?source=zalo" });
  if (delivery.zns.mode === "off") canhBao.push({ muc: "luu_y", text: "ZNS đang TẮT: hết khung 48 giờ thì không có cách nào nhắn lại khách.", href: "/cau-hinh-van-hanh?tab=zalo" });
  else if (delivery.zns.mode === "sandbox") canhBao.push({ muc: "luu_y", text: "ZNS đang ở chế độ GIẢ LẬP — tin không thực sự rời hệ thống.", href: "/cau-hinh-van-hanh?tab=zalo" });
  const sapHetN = hoiThoai.filter((c) => c.sapHet).length;
  if (sapHetN) canhBao.push({ muc: "luu_y", text: `${sapHetN} hội thoại sắp hết khung trả lời miễn phí (dưới ${SAP_HET_GIO} giờ).` });

  return {
    days,
    windowHours: ZALO_CS_WINDOW_HOURS,
    token: {
      configured: token.configured, usable: token.usable, fromEnv: token.fromEnv,
      minutesLeft: token.minutesLeft, expiresAt: token.expiresAt, lastError: token.lastError, oaId: token.oaId,
    },
    zns: {
      mode: delivery.zns.mode,
      soMau: Object.values(delivery.zns.templates ?? {}).filter(Boolean).length,
      ...(zns ?? { daGui: 0, cho: 0, loi: 0 }),
      theoMau: znsTheoMau,
    },
    webhook: {
      nhanGanNhat: wh?.nhanGanNhat ?? null,
      trong24h: wh?.trong24h ?? 0,
      tuChoi24h: wh?.tuChoi24h ?? 0,
      loi24h: wh?.loi24h ?? 0,
    },
    hoiThoaiDem: dem ?? { tong: 0, dangMo: 0, chuaGanLead: 0, daGanLead: 0 },
    lead: leadDem ?? { tong: 0, daGhiDanh: 0 },
    tin: tin ?? { den: 0, di: 0, loi: 0 },
    hoiThoai,
    canhBao,
  };
}

/** Hội thoại Zalo sắp hết khung trả lời — dùng cho thẻ nhắc việc ở màn chính */
export async function zaloSapHetKhung(ctx: ProtectedContext) {
  requirePermission(ctx, "message:read");
  const rows = await ctx.db
    .select({ id: conversations.id, ten: conversations.displayName, lastInboundAt: conversations.lastInboundAt })
    .from(conversations)
    .where(and(eq(conversations.channel, "zalo"), sql`${conversations.status} <> 'closed'`, isNotNull(conversations.lastInboundAt)))
    .limit(200);
  const now = new Date();
  return rows
    .map((c) => ({ ...c, left: replyWindowLeft(replyWindow("zalo", c.lastInboundAt, now).allowed ? new Date(c.lastInboundAt!.getTime() + ZALO_CS_WINDOW_HOURS * 3600_000) : null, now) }))
    .filter((c) => c.left && c.left.ms <= SAP_HET_GIO * 3600_000)
    .map((c) => ({ id: c.id, ten: c.ten ?? "Khách Zalo", conLai: c.left!.label }));
}
