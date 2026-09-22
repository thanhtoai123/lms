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
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { leads } from "@satarobo/db";
import {
  OPEN_LEAD_STATUSES, addDays, authorize, maskPhone, visibleCenterIds, fmtDeadlineVi,
  REQUEST_KIND_VI, PARENT_REQUEST_TYPE_VI, type Permission,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { todayISO, listSessions, countSessions } from "./sessions";
import { resolveAdmissionsPolicy } from "./admissionsAdmin";
import { slaOverdueMinutesSql, slaOverdueSql } from "./leadSlaSql";
import * as L from "./leads";
import * as Mk from "./makeup";
import * as MD from "./media";
import * as F from "./finance";
import * as HRR from "./hrRequests";
import * as CARE from "./care";
import * as EN from "./engagement";
import * as RC from "./reportCards";
import * as TR from "./trialReports";
import * as SE from "./sessionEvaluations";

export const INBOX_GROUP_KEYS = [
  "lead_task", "lead_sla", "session_attendance", "session_note", "report_card", "makeup",
  "media", "payment", "refund", "staff_request", "parent_request", "care_task", "completion", "notification",
  "trial_report", "session_evaluation",
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
      safe(() => trialReportGroup(ctx)),
      safe(() => sessionGroups(ctx, "attendance")),
      safe(() => sessionGroups(ctx, "note")),
      safe(() => sessionEvaluationGroup(ctx)),
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

/**
 * Lead quá hạn liên hệ.
 *
 * Trước: tải 400 lead đang mở (bất kể quá hạn hay không) rồi gọi `computeSla` cho từng dòng
 *        trong JavaScript và đếm bằng `.length` — vừa kéo dòng thừa, vừa cho ra con số SAI khi
 *        cơ sở có hơn 400 lead đang mở (trần 400 cắt mất phần còn lại).
 * Sau:  phép lọc SLA nằm trong SQL (`slaOverdueSql`, dịch đúng `computeSla`), tổng lấy bằng
 *        `count(*)` trên TOÀN BỘ tập, và chỉ tải 25 dòng để hiển thị.
 * Truy vấn: 2 (1 tải 400 dòng + 1 chính sách) → 3 (1 chính sách + 1 count + 1 tải 25 dòng).
 */
async function leadSlaGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "lead:read")) return null;
  const visible = visibleCenterIds(ctx.actor);
  const scope = visible === null ? sql`true` : visible.length ? inArray(leads.centerId, visible) : sql`false`;
  const policy = await resolveAdmissionsPolicy(ctx.db, null);
  const now = new Date();
  const overdueMinutes = slaOverdueMinutesSql(policy.sla, leads.status, leads.lastTouchAt, now);
  const base = and(
    isNull(leads.deletedAt),
    inArray(leads.status, [...OPEN_LEAD_STATUSES]),
    scope,
    tenantCond(ctx, leads),
    slaOverdueSql(policy.sla, leads.status, leads.lastTouchAt, now),
  );
  // Giữ nguyên nghiệp vụ: ưu tiên lead của chính mình (và lead chưa ai nhận); không có thì lấy tất
  const mineCond = or(eq(leads.assignedToId, ctx.user.id), isNull(leads.assignedToId))!;
  const [counts] = await ctx.db
    .select({ mine: sql<number>`count(*) filter (where ${mineCond})::int`, all: sql<number>`count(*)::int` })
    .from(leads)
    .where(base);
  const mineTotal = counts?.mine ?? 0;
  const total = mineTotal > 0 ? mineTotal : counts?.all ?? 0;
  if (total === 0) {
    return {
      key: "lead_sla", title: "Lead quá hạn liên hệ", icon: "users",
      actionLabel: "Đã liên hệ", actionKind: "mutate", undoable: false,
      href: "/leads", emptyHint: "Mọi lead đang mở đều còn trong hạn liên hệ.",
      total: 0, overdue: 0, items: [],
    };
  }
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, phone: leads.phoneNormalized, overdueMinutes })
    .from(leads)
    .where(mineTotal > 0 ? and(base, mineCond) : base)
    .orderBy(leads.lastTouchAt)
    .limit(MAX_PER_GROUP);
  return {
    key: "lead_sla", title: "Lead quá hạn liên hệ", icon: "users",
    actionLabel: "Đã liên hệ", actionKind: "mutate", undoable: false,
    href: "/leads", emptyHint: "Mọi lead đang mở đều còn trong hạn liên hệ.",
    total, overdue: total,
    items: rows.map((r) => ({
      id: r.id, title: r.parentName, sub: maskPhone(r.phone),
      meta: `Trễ ${Math.round((r.overdueMinutes ?? 0) / 60)} giờ`,
      overdue: true, href: `/leads/${r.id}`,
    })),
  };
}

/**
 * Buổi chưa điểm danh / chưa viết nhận xét.
 *
 * Trước: tải MỌI buổi đang mở trong 45 ngày (kèm 2 truy vấn con đếm sĩ số cho từng dòng), rồi
 *        lọc theo trạng thái và đếm bằng `.length` trong JavaScript — cả hai nhóm chạy hai lượt
 *        tải giống hệt nhau. Ở quy mô chuỗi, đây là 2 trong 14 truy vấn nặng nhất của trang chủ.
 * Sau:  lọc trạng thái nằm trong SQL (`status`), `total`/`overdue` lấy bằng `count(*)`, và chỉ
 *        tải đúng 25 dòng để hiển thị.
 * Truy vấn mỗi nhóm: 1 (tải N dòng nặng) → 3 (2 count nhẹ + 1 tải 25 dòng).
 */
async function sessionGroups(ctx: ProtectedContext, mode: "attendance" | "note"): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, mode === "attendance" ? "attendance:read" : "session:read")) return null;
  const today = todayISO();
  const from = addDays(today, -45);
  const statuses = mode === "attendance" ? (["scheduled", "in_progress"] as const) : (["attendance_done"] as const);
  const filter = { from, to: today, statuses: [...statuses] };
  const [total, overdueCount, rows] = await Promise.all([
    countSessions(ctx, filter),
    // "Quá hạn" = buổi đã qua ngày hôm nay (đúng như phép so `r.date < today` cũ)
    countSessions(ctx, { ...filter, to: addDays(today, -1) }),
    listSessions(ctx, { ...filter, limit: MAX_PER_GROUP }),
  ]);
  const items = rows.map((r) => ({
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
      total, overdue: overdueCount, items,
    }
    : {
      key: "session_note", title: "Buổi chưa viết nhận xét", icon: "notebook-pen",
      actionLabel: "Viết nhận xét", actionKind: "open", undoable: false,
      href: "/sessions", emptyHint: "Không còn buổi nào chờ nhận xét.",
      total, overdue: overdueCount, items,
    };
}

/**
 * Phiếu đánh giá học thử chưa gửi: buổi thử đã diễn ra quá 24 giờ (đã ghi "đến học" / đã có mặt)
 * mà chưa có phiếu phát hành. Việc cần nhập liệu → "open" mở thẳng drawer điền phiếu.
 * Tổng lấy bằng `count(*)`, chỉ tải 25 dòng (xem `pendingTrialReports`).
 */
async function trialReportGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  const res = await TR.pendingTrialReports(ctx, { limit: MAX_PER_GROUP });
  if (!res) return null;
  return {
    key: "trial_report", title: "Phiếu đánh giá học thử chưa gửi", icon: "flask-conical",
    actionLabel: "Điền phiếu", actionKind: "open", undoable: false,
    href: "/lop-trial", emptyHint: "Mọi buổi học thử đã có phiếu đánh giá gửi phụ huynh.",
    total: res.total, overdue: res.overdue,
    items: res.items.map((r) => {
      const day = r.sessionAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
      return {
        id: `${r.kind}:${r.sourceId}`,
        title: r.childName,
        sub: [r.classLabel, r.centerCode, r.hasDraft ? "có bản nháp" : null].filter(Boolean).join(" · "),
        meta: hoursAgo(r.sessionAt),
        overdue: Date.now() - r.sessionAt.getTime() > 48 * 3600e3,
        href: r.kind === "booking"
          ? `/lop-trial/buoi-le?from=${day}&to=${day}&pdg=${r.sourceId}`
          : `/lop-trial/${r.trialClassId ?? ""}?pdg=${r.sourceId}`,
      };
    }),
  };
}

/**
 * Buổi chưa có phiếu nhận xét học viên (hồ sơ học tập): buổi đã diễn ra, có học viên có mặt nhưng
 * chưa có phiếu phát hành. Tính từ mốc bật tính năng, trong 30 ngày gần nhất; GV chỉ thấy buổi mình dạy.
 * Quá hạn = qua hạn hoàn thiện phiếu của chuẩn hồ sơ (`sheetDeadlineHours` sau giờ kết thúc buổi, theo cơ sở).
 * Việc cần nhập liệu → "open" mở thẳng màn buổi học (khối phiếu nằm ngay dưới điểm danh).
 */
async function sessionEvaluationGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  const res = await SE.pendingEvaluationSessions(ctx, { limit: MAX_PER_GROUP });
  if (!res) return null;
  return {
    key: "session_evaluation", title: "Buổi chưa có phiếu nhận xét học viên", icon: "book-open-check",
    actionLabel: "Chấm phiếu", actionKind: "open", undoable: false,
    href: "/sessions", emptyHint: "Mọi học viên có mặt đều đã có phiếu nhận xét buổi học.",
    total: res.total, overdue: res.overdue,
    items: res.items.map((r) => ({
      id: r.sessionId,
      title: `${r.classCode} · ${r.label}`,
      sub: [r.centerCode, r.teacherName ?? "Chưa gán GV", `${r.missing} học viên chưa có phiếu`].join(" · "),
      meta: `${dmy(r.date)} ${r.startTime.slice(0, 5)} · hạn ${fmtDeadlineVi(new Date(r.deadline))}`,
      overdue: r.overdue,
      href: `/teacher/sessions/${r.sessionId}#phieu-nhan-xet`,
    })),
  };
}

async function reportCardGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "report_card:read")) return null;
  const today = todayISO();
  // Trước: tải 200 dòng rồi đếm bằng `.length` (số hiển thị bị cắt ở 200).
  // Sau: 1 count(*) cho hai con số + 1 truy vấn lấy đúng 25 dòng hiển thị.
  const [c, rows] = await Promise.all([
    RC.countDueReportCards(ctx),
    RC.dueReportCards(ctx, { limit: MAX_PER_GROUP }),
  ]);
  return {
    key: "report_card", title: "Học bạ kỳ chưa viết", icon: "scroll-text",
    actionLabel: "Viết học bạ", actionKind: "open", undoable: false,
    href: "/report-cards", emptyHint: "Học bạ các mốc đã viết đủ.",
    total: c.total, overdue: c.overdue,
    items: rows.map((r) => ({
      id: `${r.enrollmentId}:${r.seq}`,
      // Hạn học bạ mốc theo chuẩn hồ sơ của cơ sở (`milestoneDeadlineDays` sau buổi mốc)
      title: r.studentName, sub: `${r.classCode} · buổi ${r.seq}`, meta: `${dmy(r.date)} · hạn ${dmy(r.dueDate)}`,
      overdue: r.dueDate < today,
      href: `/report-cards/${r.enrollmentId}/${r.seq}`,
    })),
  };
}

async function makeupGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "makeup:update")) return null;
  // `counts.requested` đã là `count(*)` trên toàn bộ phạm vi — dùng thẳng thay cho `.length`
  // của danh sách bị cắt ở 300 dòng; `limit: MAX_PER_GROUP` để chỉ tải đúng số dòng hiển thị.
  const { items, counts } = await Mk.listMakeup(ctx, { status: "requested", limit: MAX_PER_GROUP });
  // Duyệt học bù bắt buộc chọn buổi bù (nghiệp vụ cũ) → mở thẳng bảng học bù đã lọc
  return {
    key: "makeup", title: "Học bù chờ xếp buổi", icon: "refresh-cw",
    actionLabel: "Xếp buổi bù", actionKind: "open", undoable: false,
    href: "/hoc-bu", emptyHint: "Không có yêu cầu học bù nào đang chờ.",
    total: counts?.requested ?? items.length,
    overdue: counts?.requestedOverdue ?? items.filter((r) => Date.now() - r.createdAt.getTime() > 48 * 3600e3).length,
    items: items.map((r) => ({
      id: r.id, title: r.studentName, sub: `${r.classCode} · vắng buổi ${r.missedSeq} (${dmy(r.missedDate)})`,
      meta: hoursAgo(r.createdAt), overdue: Date.now() - r.createdAt.getTime() > 48 * 3600e3,
      href: "/hoc-bu?status=requested",
    })),
  };
}

async function mediaGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "media:update")) return null;
  // Trước: tải 120 ảnh — mỗi ảnh kéo theo sĩ số lớp và đồng ý hình ảnh của từng HV — chỉ để đếm.
  // Sau: 1 count(*) cho hai con số + 1 truy vấn lấy đúng 25 ảnh hiển thị.
  const [c, list] = await Promise.all([
    MD.countMedia(ctx, { status: "pending" }),
    MD.listMedia(ctx, { status: "pending", limit: MAX_PER_GROUP }),
  ]);
  return {
    key: "media", title: "Ảnh lớp chờ duyệt", icon: "check-check",
    actionLabel: "Duyệt ảnh", actionKind: "mutate", undoable: false,
    href: "/duyet-media", emptyHint: "Không còn ảnh nào chờ duyệt.",
    total: c.total,
    overdue: c.overdue,
    items: list.map((r) => ({
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
    // `counts.recorded` là `count(*)` trên toàn bộ phạm vi người dùng thấy; trước đây `total`
    // lấy `.length` của TRANG ĐẦU (30 dòng) nên kế toán có 500 phiếu chờ vẫn chỉ thấy "30".
    total: res.counts?.recorded ?? list.length,
    overdue: res.counts?.recordedOverdue ?? list.filter((p) => Date.now() - p.recordedAt.getTime() > 24 * 3600e3).length,
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
  const res = await F.listRefunds(ctx, { status: "pending", limit: 100 });
  const list = res.items.filter((r) => r.canApprove);
  return {
    key: "refund", title: "Hoàn tiền chờ duyệt", icon: "undo-2",
    actionLabel: "Duyệt", actionKind: "mutate", undoable: false,
    href: "/hoan-tien?status=pending", emptyHint: "Không có yêu cầu hoàn tiền nào chờ duyệt.",
    // count(*) thay cho `.length` của danh sách bị cắt ở 300 dòng
    total: res.counts?.pending ?? list.length,
    overdue: res.counts?.pendingOverdue ?? list.filter((r) => Date.now() - r.createdAt.getTime() > 48 * 3600e3).length,
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
  const res = await HRR.listRequests(ctx, { status: "pending", limit: 100 });
  const list = res.items.filter((r) => r.canDecide);
  return {
    key: "staff_request", title: "Đơn nghỉ / đơn công chờ duyệt", icon: "clipboard-list",
    actionLabel: "Duyệt", actionKind: "mutate", undoable: false,
    href: "/don-tu?status=pending", emptyHint: "Không còn đơn từ nào chờ bạn duyệt.",
    // count(*) thay cho `.length` của danh sách bị cắt ở 500 dòng
    total: res.counts?.pending ?? list.length,
    overdue: res.counts?.overdue ?? list.filter((r) => r.overdue).length,
    items: list.slice(0, MAX_PER_GROUP).map((r) => ({
      id: r.id, title: `${r.staffName} · ${REQUEST_KIND_VI[r.kind]}`,
      sub: `${r.centerCode} · ${dmy(r.dateFrom)}${r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}`,
      meta: `${r.ageDays} ngày`, overdue: r.overdue, href: `/don-tu?status=pending`,
    })),
  };
}

async function parentRequestGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "care:update")) return null;
  const res = await CARE.listParentRequests(ctx, { status: "open", limit: MAX_PER_GROUP });
  const list = res.items;
  return {
    key: "parent_request", title: "Yêu cầu phụ huynh chưa xử lý", icon: "message-square-plus",
    actionLabel: "Duyệt", actionKind: "mutate", undoable: false,
    href: "/parent-requests?status=open", emptyHint: "Không có yêu cầu nào của phụ huynh đang chờ.",
    // count(*) thay cho `.length` của danh sách bị cắt ở 300 dòng
    total: res.counts?.open ?? list.length,
    overdue: res.counts?.overdue ?? list.filter((r) => r.dueAt.getTime() < Date.now()).length,
    items: list.map((r) => ({
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
  // Trước: `listCareTasks` KHÔNG có `limit` — tải mọi việc đang mở của toàn chuỗi rồi lọc
  // "quá hạn hoặc đã leo thang" và đếm `.length` trong JS.
  // Sau: phép lọc + hai con số nằm trong SQL, chỉ tải 25 dòng hiển thị.
  const { total, overdue, items } = await EN.careTaskInbox(ctx, { limit: MAX_PER_GROUP });
  return {
    key: "care_task", title: "Việc chăm sóc học viên tới hạn", icon: "heart-handshake",
    actionLabel: "Đã xử lý", actionKind: "mutate", undoable: true,
    href: "/cham-soc-hv", emptyHint: "Không có việc chăm sóc nào quá hạn.",
    total, overdue,
    items: items.map((r) => ({
      id: r.id, title: r.title, sub: [r.studentName, r.className ?? null].filter(Boolean).join(" · "),
      meta: shortDate(r.dueAt), overdue: r.overdue, href: `/cham-soc-hv`,
    })),
  };
}

async function completionGroup(ctx: ProtectedContext): Promise<InboxGroup | null> {
  if (!canAnywhere(ctx, "completion:approve")) return null;
  // `pendingCompletions` nay có trần cứng; hộp việc chỉ cần đủ dòng cho danh sách rút gọn.
  const rows = await RC.pendingCompletions(ctx, { limit: 100 });
  return {
    key: "completion", title: "Chứng nhận chờ cấp", icon: "award",
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
  // Trước: tải 60 thông báo chưa đọc rồi lọc `priority <= 2` trong JS và đếm `.length`
  // (số hiển thị sai khi có nhiều hơn 60 thông báo chưa đọc).
  // Sau: lọc mức ưu tiên trong SQL, tổng lấy bằng `count(*)`, tải 25 dòng.
  const { total, urgent, items } = await EN.urgentNotifications(ctx, { limit: MAX_PER_GROUP });
  return {
    key: "notification", title: "Thông báo cần xác nhận", icon: "bell-ring",
    actionLabel: "Đã xem", actionKind: "mutate", undoable: false,
    href: "/thong-bao", emptyHint: "Không có thông báo quan trọng nào chưa đọc.",
    total, overdue: urgent,
    items: items.map((n) => ({
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
 * Các nhóm khác (duyệt tiền, duyệt đơn, cấp chứng nhận) là quyết định có ghi sổ,
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
