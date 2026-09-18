/**
 * "Việc hôm nay" — hộp việc gộp của người đang đăng nhập.
 *
 * Nguyên tắc:
 *  - KHÔNG viết lại nghiệp vụ: mỗi nhóm việc đọc lại đúng service đang dùng cho
 *    màn hình riêng của nó, mỗi hành động gọi đúng mutation của service đó
 *    (service tự kiểm tra quyền, tự ghi audit, tự bắn thông báo).
 *  - Chỉ trả nhóm nào người dùng có quyền; mỗi nhóm bọc try/catch để một nhóm
 *    thiếu quyền không làm hỏng cả trang.
 *  - Mỗi dòng có đúng MỘT hành động chính: `kind: "mutate"` làm ngay tại chỗ,
 *    `kind: "open"` là việc cần nhập liệu (điểm danh, nhận xét, học bạ) nên mở
 *    thẳng đúng màn hình nhập — vẫn là một cú nhấp.
 */
import { and, inArray, isNull, sql } from "drizzle-orm";
import { leads } from "@satarobo/db";
import {
  OPEN_LEAD_STATUSES, addDays, authorize, computeSla, maskPhone, visibleCenterIds,
  REQUEST_KIND_VI, PARENT_REQUEST_TYPE_VI, type Permission,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { todayISO, listSessions } from "./sessions";
import { resolveAdmissionsPolicy } from "./admissionsAdmin";
import * as L from "./leads";
import * as Mk from "./makeup";
import * as MD from "./media";
import * as F from "./finance";
import * as HRR from "./hrRequests";
import * as CARE from "./care";
import * as EN from "./engagement";
import * as RC from "./reportCards";

export const INBOX_GROUP_KEYS = [
  "lead_task", "lead_sla", "session_attendance", "session_note", "report_card", "makeup",
  "media", "payment", "refund", "staff_request", "parent_request", "care_task", "completion", "notification",
] as const;
export type InboxGroupKey = (typeof INBOX_GROUP_KEYS)[number];

export interface InboxItem {
  /** Khoá dòng — cũng là id truyền vào inbox.act */
  id: string;
  title: string;
  /** Dòng phụ: lớp / cơ sở / người liên quan */
  sub: string;
  /** Mốc thời gian hoặc số tiền, hiển thị bên phải */
  meta: string;
  overdue: boolean;
  /** Liên kết "Mở chi tiết" */
  href: string;
}

export interface InboxGroup {
  key: InboxGroupKey;
  title: string;
  /** Tên icon lucide (kebab-case) — ánh xạ ở apps/web/src/components/admin-shell.tsx */
  icon: string;
  /** Nhãn nút hành động chính của từng dòng */
  actionLabel: string;
  /** "mutate" = chạy ngay tại chỗ; "open" = mở màn hình nhập liệu */
  actionKind: "mutate" | "open";
  /** Hành động hàng loạt có đảo ngược được không (để hiện nút Hoàn tác trong toast) */
  undoable: boolean;
  /** Trang đầy đủ của nhóm việc này */
  href: string;
  /** Câu gợi ý khi nhóm rỗng */
  emptyHint: string;
  total: number;
  overdue: number;
  items: InboxItem[];
}

const MAX_PER_GROUP = 25;

/** Gọn: dd/mm */
function dmy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function shortDate(d: Date) {
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
}
function hoursAgo(d: Date) {
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (h < 1) return "vừa xong";
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

/** Có quyền ở ít nhất một cơ sở đang giữ vai trò (kiểm tra lỏng — service vẫn kiểm chặt) */
function canAnywhere(ctx: ProtectedContext, perm: Permission) {
  if (authorize(ctx.actor, perm, {}).allowed) return true;
  return ctx.actor.assignments.some((a) => authorize(ctx.actor, perm, { centerId: a.centerId }).allowed);
}

/** Bọc một nhóm việc: lỗi quyền / lỗi truy vấn chỉ làm mất nhóm đó, không gãy cả trang */
async function safe(fn: () => Promise<InboxGroup | null>): Promise<InboxGroup | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Đọc: các nhóm việc
   ──────────────────────────────────────────────────────────────────────────── */

export async function inboxToday(ctx: ProtectedContext) {
  const today = todayISO();
  const groups = (
    await Promise.all([
      safe(() => leadTaskGroup(ctx)),
      safe(() => leadSlaGroup(ctx)),
      safe(() => sessionGroups(ctx, "attendance")),
      safe(() => sessionGroups(ctx, "note")),
      safe(() => reportCardGroup(ctx)),
      safe(() => makeupGroup(ctx)),
      safe(() => mediaGroup(ctx)),
      safe(() => paymentGroup(ctx)),
      safe(() => refundGroup(ctx)),
      safe(() => staffRequestGroup(ctx)),
      safe(() => parentRequestGroup(ctx)),
      safe(() => careTaskGroup(ctx)),
      safe(() => completionGroup(ctx)),
      safe(() => notificationGroup(ctx)),
    ])
  ).filter((g): g is InboxGroup => g !== null && g.total > 0);

  return {
    today,
    groups,
    totalTasks: groups.reduce((a, g) => a + g.total, 0),
    totalOverdue: groups.reduce((a, g) => a + g.overdue, 0),
  };
}

async function leadTaskGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "lead:read")) return null;
  const rows = await L.myLeadTasks(ctx);
  return {
    key: "lead_task", title: "Việc hẹn với khách hôm nay", icon: "alarm-clock",
    actionLabel: "Hoàn tất", actionKind: "mutate", undoable: false,
    href: "/leads", emptyHint: "Không còn việc hẹn nào tới hạn.",
    total: rows.length, overdue: rows.filter((r) => r.overdue).length,
    items: rows.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: r.title, sub: r.parentName,
      meta: r.dueAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      overdue: r.overdue, href: `/leads/${r.leadId}`,
    })),
  };
}

async function leadSlaGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "lead:read")) return null;
  const visible = visibleCenterIds(ctx.actor);
  const scope = visible === null ? sql`true` : visible.length ? inArray(leads.centerId, visible) : sql`false`;
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, phone: leads.phoneNormalized, status: leads.status, lastTouchAt: leads.lastTouchAt, assignedToId: leads.assignedToId })
    .from(leads)
    .where(and(isNull(leads.deletedAt), inArray(leads.status, [...OPEN_LEAD_STATUSES]), scope))
    .orderBy(leads.lastTouchAt)
    .limit(400);
  const policy = await resolveAdmissionsPolicy(ctx.db, null);
  const now = new Date().toISOString();
  // Ưu tiên lead của chính mình; người quản lý thấy cả lead chưa ai nhận
  const mine = rows.filter((r) => r.assignedToId === ctx.user.id || r.assignedToId === null);
  const pool = mine.length > 0 ? mine : rows;
  const late = pool
    .map((r) => ({ ...r, sla: computeSla(r.status, r.lastTouchAt.toISOString(), now, policy.sla) }))
    .filter((r) => r.sla.level === "overdue");
  return {
    key: "lead_sla", title: "Lead quá hạn liên hệ", icon: "users",
    actionLabel: "Đã liên hệ", actionKind: "mutate", undoable: false,
    href: "/leads", emptyHint: "Mọi lead đang mở đều còn trong hạn liên hệ.",
    total: late.length, overdue: late.length,
    items: late.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: r.parentName, sub: maskPhone(r.phone),
      meta: `Trễ ${Math.round(r.sla.overdueMinutes / 60)} giờ`,
      overdue: true, href: `/leads/${r.id}`,
    })),
  };
}

async function sessionGroups(ctx: ProtectedContext, mode: "attendance" | "note"): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, mode === "attendance" ? "attendance:read" : "session:read")) return null;
  const today = todayISO();
  const rows = await listSessions(ctx, { from: addDays(today, -45), to: today, onlyOpen: true });
  const pick = mode === "attendance"
    ? rows.filter((r) => r.status === "scheduled" || r.status === "in_progress")
    : rows.filter((r) => r.status === "attendance_done");
  const items = pick.map((r) => ({
    id: r.id,
    title: `${r.classCode} · ${r.label}`,
    sub: [r.centerCode, r.teacherName ?? "Chưa gán GV"].filter(Boolean).join(" · "),
    meta: `${dmy(r.date)} ${r.startTime.slice(0, 5)}`,
    overdue: r.date < today,
    href: mode === "attendance" ? `/attendance?class=${r.classId}` : `/classes/${r.classId}`,
  }));
  return mode === "attendance"
    ? {
      key: "session_attendance", title: "Buổi học chưa điểm danh", icon: "clipboard-check",
      actionLabel: "Điểm danh", actionKind: "open", undoable: false,
      href: "/attendance", emptyHint: "Mọi buổi đã qua đều đã chốt điểm danh.",
      total: items.length, overdue: items.filter((i) => i.overdue).length, items: items.slice(0, MAX_PER_GROUP),
    }
    : {
      key: "session_note", title: "Buổi chưa viết nhận xét", icon: "notebook-pen",
      actionLabel: "Viết nhận xét", actionKind: "open", undoable: false,
      href: "/sessions", emptyHint: "Không còn buổi nào chờ nhận xét.",
      total: items.length, overdue: items.filter((i) => i.overdue).length, items: items.slice(0, MAX_PER_GROUP),
    };
}

async function reportCardGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "report_card:read")) return null;
  const today = todayISO();
  const rows = await RC.dueReportCards(ctx, { limit: 200 });
  return {
    key: "report_card", title: "Học bạ kỳ chưa viết", icon: "scroll-text",
    actionLabel: "Viết học bạ", actionKind: "open", undoable: false,
    href: "/report-cards", emptyHint: "Học bạ các mốc đã viết đủ.",
    total: rows.length, overdue: rows.filter((r) => r.date < addDays(today, -3)).length,
    items: rows.slice(0, MAX_PER_GROUP).map((r) => ({
      id: `${r.enrollmentId}:${r.seq}`,
      title: r.studentName, sub: `${r.classCode} · buổi ${r.seq}`, meta: dmy(r.date),
      overdue: r.date < addDays(today, -3),
      href: `/report-cards/${r.enrollmentId}/${r.seq}`,
    })),
  };
}

async function makeupGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "makeup:update")) return null;
  const { items } = await Mk.listMakeup(ctx, { status: "requested" });
  // Duyệt học bù bắt buộc chọn buổi bù (nghiệp vụ cũ) → mở thẳng bảng học bù đã lọc
  return {
    key: "makeup", title: "Học bù chờ xếp buổi", icon: "refresh-cw",
    actionLabel: "Xếp buổi bù", actionKind: "open", undoable: false,
    href: "/hoc-bu", emptyHint: "Không có yêu cầu học bù nào đang chờ.",
    total: items.length, overdue: items.filter((r) => Date.now() - r.createdAt.getTime() > 48 * 3600e3).length,
    items: items.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: r.studentName, sub: `${r.classCode} · vắng buổi ${r.missedSeq} (${dmy(r.missedDate)})`,
      meta: hoursAgo(r.createdAt), overdue: Date.now() - r.createdAt.getTime() > 48 * 3600e3,
      href: "/hoc-bu?status=requested",
    })),
  };
}

async function mediaGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "media:update")) return null;
  const list = await MD.listMedia(ctx, { status: "pending", limit: 120 });
  return {
    key: "media", title: "Ảnh lớp chờ duyệt", icon: "check-check",
    actionLabel: "Duyệt ảnh", actionKind: "mutate", undoable: false,
    href: "/duyet-media", emptyHint: "Không còn ảnh nào chờ duyệt.",
    total: list.length,
    overdue: list.filter((r) => r.overdue).length,
    items: list.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: `${r.classCode} · buổi ${r.sequenceNo}`,
      sub: r.uploaderName ?? "Không rõ người tải", meta: hoursAgo(r.submittedAt ?? r.createdAt),
      overdue: r.overdue,
      href: `/duyet-media?session=${r.sessionId}`,
    })),
  };
}

async function paymentGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "finance:confirm")) return null;
  const res = await F.listPayments(ctx, { status: "recorded" });
  const list = res.items.filter((p) => p.canDecide);
  return {
    key: "payment", title: "Phiếu thu chờ xác nhận", icon: "credit-card",
    actionLabel: "Xác nhận", actionKind: "mutate", undoable: false,
    href: "/payments?status=recorded", emptyHint: "Không còn phiếu thu nào chờ kế toán.",
    total: list.length,
    overdue: list.filter((p) => Date.now() - p.recordedAt.getTime() > 24 * 3600e3).length,
    items: list.slice(0, MAX_PER_GROUP).map((p) => ({
      id: p.id, title: `${p.orderCode} · ${vnd(p.amount)}`,
      sub: [p.studentName ?? p.customerName, p.recorderName ?? null].filter(Boolean).join(" · "),
      meta: hoursAgo(p.recordedAt),
      overdue: Date.now() - p.recordedAt.getTime() > 24 * 3600e3,
      href: `/orders/${p.orderId}`,
    })),
  };
}

async function refundGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "finance:approve")) return null;
  const res = await F.listRefunds(ctx, { status: "pending" });
  const list = res.items.filter((r) => r.canApprove);
  return {
    key: "refund", title: "Hoàn tiền chờ duyệt", icon: "undo-2",
    actionLabel: "Duyệt", actionKind: "mutate", undoable: false,
    href: "/hoan-tien?status=pending", emptyHint: "Không có yêu cầu hoàn tiền nào chờ duyệt.",
    total: list.length,
    overdue: list.filter((r) => Date.now() - r.createdAt.getTime() > 48 * 3600e3).length,
    items: list.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: `${r.orderCode} · ${vnd(r.amount)}`,
      sub: [r.studentName ?? r.customerName, r.requesterName ?? null].filter(Boolean).join(" · "),
      meta: hoursAgo(r.createdAt), overdue: Date.now() - r.createdAt.getTime() > 48 * 3600e3,
      href: `/hoan-tien?status=pending`,
    })),
  };
}

async function staffRequestGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "timesheet:approve")) return null;
  const res = await HRR.listRequests(ctx, { status: "pending" });
  const list = res.items.filter((r) => r.canDecide);
  return {
    key: "staff_request", title: "Đơn nghỉ / đơn công chờ duyệt", icon: "clipboard-list",
    actionLabel: "Duyệt", actionKind: "mutate", undoable: false,
    href: "/don-tu?status=pending", emptyHint: "Không còn đơn từ nào chờ bạn duyệt.",
    total: list.length, overdue: list.filter((r) => r.overdue).length,
    items: list.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: `${r.staffName} · ${REQUEST_KIND_VI[r.kind]}`,
      sub: `${r.centerCode} · ${dmy(r.dateFrom)}${r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}`,
      meta: `${r.ageDays} ngày`, overdue: r.overdue, href: `/don-tu?status=pending`,
    })),
  };
}

async function parentRequestGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "care:update")) return null;
  const res = await CARE.listParentRequests(ctx, { status: "open" });
  const list = res.items;
  return {
    key: "parent_request", title: "Yêu cầu phụ huynh chưa xử lý", icon: "message-square-plus",
    actionLabel: "Duyệt", actionKind: "mutate", undoable: false,
    href: "/parent-requests?status=open", emptyHint: "Không có yêu cầu nào của phụ huynh đang chờ.",
    total: list.length,
    overdue: list.filter((r) => r.dueAt.getTime() < Date.now()).length,
    items: list.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: `${r.code} · ${PARENT_REQUEST_TYPE_VI[r.type]}`,
      sub: [r.studentName, r.centerCode].filter(Boolean).join(" · "),
      meta: shortDate(r.dueAt),
      overdue: r.dueAt.getTime() < Date.now(),
      href: `/parent-requests/${r.id}`,
    })),
  };
}

async function careTaskGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "care:update")) return null;
  const rows = (await EN.listCareTasks(ctx, {})).filter((r) => r.overdue || r.status === "escalated");
  return {
    key: "care_task", title: "Việc chăm sóc học viên tới hạn", icon: "heart-handshake",
    actionLabel: "Đã xử lý", actionKind: "mutate", undoable: true,
    href: "/cham-soc-hv", emptyHint: "Không có việc chăm sóc nào quá hạn.",
    total: rows.length, overdue: rows.filter((r) => r.overdue).length,
    items: rows.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: r.title, sub: [r.studentName, r.className ?? null].filter(Boolean).join(" · "),
      meta: shortDate(r.dueAt), overdue: r.overdue, href: `/cham-soc-hv`,
    })),
  };
}

async function completionGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "completion:approve")) return null;
  const rows = await RC.pendingCompletions(ctx);
  return {
    key: "completion", title: "Chứng chỉ chờ cấp", icon: "award",
    actionLabel: "Duyệt cấp", actionKind: "mutate", undoable: false,
    href: "/hoan-thanh-khoa", emptyHint: "Không có đề xuất hoàn thành khoá nào đang chờ.",
    total: rows.length,
    overdue: rows.filter((r) => r.proposedAt !== null && Date.now() - r.proposedAt.getTime() > 72 * 3600e3).length,
    items: rows.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: r.studentName, sub: `${r.classCode} · ${r.courseCode}`,
      meta: r.proposedAt ? hoursAgo(r.proposedAt) : "—",
      overdue: r.proposedAt !== null && Date.now() - r.proposedAt.getTime() > 72 * 3600e3,
      href: `/hoan-thanh-khoa`,
    })),
  };
}

async function notificationGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  const res = await EN.myNotifications(ctx, { unreadOnly: true, limit: 60 });
  const rows = res.items.filter((n) => n.priority <= 2);
  return {
    key: "notification", title: "Thông báo cần xác nhận", icon: "bell-ring",
    actionLabel: "Đã xem", actionKind: "mutate", undoable: false,
    href: "/thong-bao", emptyHint: "Không có thông báo quan trọng nào chưa đọc.",
    total: rows.length, overdue: rows.filter((n) => n.priority === 1).length,
    items: rows.slice(0, MAX_PER_GROUP).map((n) => ({
      id: n.id, title: n.title, sub: n.body ?? "—", meta: hoursAgo(n.createdAt),
      overdue: n.priority === 1, href: n.link ?? "/thong-bao",
    })),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Ghi: một hành động chính cho mỗi nhóm
   ──────────────────────────────────────────────────────────────────────────── */

export interface InboxActInput {
  group: InboxGroupKey;
  ids: string[];
  /** Ghi chú kèm theo (tuỳ nhóm); để trống thì dùng câu mặc định */
  note?: string | null;
}

const NOTE_DEFAULT: Record<string, string> = {
  makeup: "Duyệt nhanh từ màn hình Việc hôm nay",
  payment: "Xác nhận nhanh từ màn hình Việc hôm nay",
  refund: "Duyệt nhanh từ màn hình Việc hôm nay",
  staff_request: "Duyệt nhanh từ màn hình Việc hôm nay",
  parent_request: "Duyệt nhanh từ màn hình Việc hôm nay",
  care_task: "Đã xử lý từ màn hình Việc hôm nay",
  completion: "Duyệt nhanh từ màn hình Việc hôm nay",
  lead_sla: "Đã liên hệ phụ huynh (ghi nhận từ Việc hôm nay)",
  lead_task: "Hoàn tất từ màn hình Việc hôm nay",
};

/**
 * Chạy hành động chính của một nhóm cho 1..n dòng.
 * Mỗi dòng chạy độc lập: dòng lỗi được trả về kèm lý do, dòng còn lại vẫn chạy.
 */
export async function inboxAct(ctx: ProtectedContext, input: InboxActInput) {
  const note = (input.note ?? "").trim() || NOTE_DEFAULT[input.group] || "Xử lý từ màn hình Việc hôm nay";
  const ids = [...new Set(input.ids)].slice(0, 50);
  const failed: { id: string; message: string }[] = [];
  let done = 0;

  // Duyệt ảnh nhận cả mảng một lần — giữ đúng ngữ nghĩa của service
  if (input.group === "media") {
    await MD.reviewMedia(ctx, { ids, action: "approve" });
    return { done: ids.length, failed };
  }
  if (input.group === "notification") {
    await EN.markRead(ctx, { ids });
    return { done: ids.length, failed };
  }

  for (const id of ids) {
    try {
      switch (input.group) {
        case "lead_task":
          await L.completeTask(ctx, { taskId: id, note });
          break;
        case "lead_sla":
          await L.addActivity(ctx, { leadId: id, type: "call", content: note });
          break;
        case "payment":
          await F.decidePayment(ctx, { paymentId: id, decision: "confirm", reason: note });
          break;
        case "refund":
          await F.decideRefund(ctx, { id, action: "approve", note });
          break;
        case "staff_request":
          await HRR.decideRequest(ctx, { id, action: "approve", note });
          break;
        case "parent_request":
          await CARE.actOnParentRequest(ctx, { id, action: "approve", note });
          break;
        case "care_task":
          await EN.resolveCareTask(ctx, { id, status: "done", outcome: note });
          break;
        case "completion":
          await RC.decideCompletion(ctx, { id, action: "approve" });
          break;
        default:
          throw new Error("Nhóm việc này không có hành động chạy ngay");
      }
      done += 1;
    } catch (e) {
      failed.push({ id, message: e instanceof Error ? e.message : "Lỗi không xác định" });
    }
  }
  return { done, failed };
}

/**
 * Hoàn tác — chỉ mở cho hành động thật sự đảo ngược được.
 * Hiện chỉ có "Việc chăm sóc học viên": đưa việc đã đóng về lại "đang xử lý".
 * Các nhóm khác (duyệt tiền, duyệt đơn, cấp chứng chỉ) là quyết định có ghi sổ,
 * muốn đảo phải đi đúng luồng nghiệp vụ của màn hình gốc.
 */
export async function inboxUndo(ctx: ProtectedContext, input: { group: InboxGroupKey; ids: string[] }) {
  if (input.group !== "care_task") {
    throw new Error("Hành động này không hoàn tác được từ màn hình Việc hôm nay");
  }
  const failed: { id: string; message: string }[] = [];
  let done = 0;
  for (const id of [...new Set(input.ids)].slice(0, 50)) {
    try {
      await EN.resolveCareTask(ctx, { id, status: "in_progress", outcome: "Hoàn tác từ màn hình Việc hôm nay" });
      done += 1;
    } catch (e) {
      failed.push({ id, message: e instanceof Error ? e.message : "Lỗi không xác định" });
    }
  }
  return { done, failed };
}
