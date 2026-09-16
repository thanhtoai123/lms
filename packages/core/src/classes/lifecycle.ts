/**
 * Vòng đời lớp: Nháp → Chờ duyệt → Tuyển sinh (tự sinh buổi) → Đang chạy → Kết thúc.
 * Gửi duyệt cần đủ dữ liệu; từ chối / huỷ bắt buộc lý do.
 */
import type { ClassStatus } from "../types.js";

export const CLASS_STATUS_VI: Record<ClassStatus, string> = {
  draft: "Nháp",
  pending_approval: "Chờ duyệt",
  recruiting: "Tuyển sinh",
  running: "Đang chạy",
  finished: "Kết thúc",
  cancelled: "Đã huỷ",
};

export type ClassEvent = "submit" | "approve" | "reject" | "start" | "finish" | "cancel";

export const CLASS_EVENT_VI: Record<ClassEvent, string> = {
  submit: "Gửi duyệt",
  approve: "Duyệt mở lớp",
  reject: "Trả về nháp",
  start: "Bắt đầu học",
  finish: "Kết thúc lớp",
  cancel: "Huỷ lớp",
};

const T: Record<ClassStatus, Partial<Record<ClassEvent, ClassStatus>>> = {
  draft: { submit: "pending_approval", cancel: "cancelled" },
  pending_approval: { approve: "recruiting", reject: "draft", cancel: "cancelled" },
  recruiting: { start: "running", cancel: "cancelled" },
  running: { finish: "finished" },
  finished: {},
  cancelled: {},
};

export class ClassTransitionError extends Error {
  constructor(public readonly from: ClassStatus, public readonly event: ClassEvent) {
    super(`Không thể "${CLASS_EVENT_VI[event]}" khi lớp đang ở trạng thái "${CLASS_STATUS_VI[from]}"`);
    this.name = "ClassTransitionError";
  }
}

export function classTransition(from: ClassStatus, event: ClassEvent): ClassStatus {
  const to = T[from]?.[event];
  if (!to) throw new ClassTransitionError(from, event);
  return to;
}

export function classEventsFor(status: ClassStatus): ClassEvent[] {
  return Object.keys(T[status] ?? {}) as ClassEvent[];
}

/** Sự kiện cần quyền duyệt (class:approve) thay vì chỉ class:update */
export const CLASS_APPROVAL_EVENTS: readonly ClassEvent[] = ["approve", "reject"];
export const CLASS_REASON_EVENTS: readonly ClassEvent[] = ["reject", "cancel"];

export interface ClassReadiness {
  scheduleCount: number;
  startDate: string | null;
  leadTeacherId: string | null;
  capacity: number;
  minCapacity: number;
  totalSessions: number;
}

/** Điều kiện gửi duyệt / duyệt: lỗi rỗng = sẵn sàng */
export function classReadiness(c: ClassReadiness): string[] {
  const errs: string[] = [];
  if (!c.startDate) errs.push("Chưa có ngày khai giảng");
  if (c.scheduleCount === 0) errs.push("Chưa có kế hoạch lịch học");
  if (!c.leadTeacherId) errs.push("Chưa phân giáo viên chính");
  if (c.minCapacity < 1) errs.push("Sĩ số tối thiểu phải ≥ 1");
  if (c.capacity < c.minCapacity) errs.push("Sĩ số tối đa phải ≥ sĩ số tối thiểu");
  if (c.totalSessions < 1) errs.push("Số buổi của khoá phải ≥ 1");
  return errs;
}

/** Kết thúc lớp: không còn buổi chính thức chưa hoàn tất */
export function canFinishClass(openRegularSessions: number): string | null {
  return openRegularSessions > 0 ? `Còn ${openRegularSessions} buổi chưa hoàn tất/huỷ` : null;
}

/* ------------------------------------------------------------------ */
/* Loại buổi & checklist                                               */
/* ------------------------------------------------------------------ */

export const SESSION_KINDS = ["regular", "coach_1_1", "coach_1_2", "coach_1_4", "makeup", "advance", "extra"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_KIND_VI: Record<SessionKind, string> = {
  regular: "Học chính thức",
  coach_1_1: "Coach 1-1",
  coach_1_2: "Coach 1-2",
  coach_1_4: "Coach 1-4",
  makeup: "Học bù",
  advance: "Học vượt",
  extra: "Buổi bổ sung",
};

/** Buổi ngoài lộ trình đánh số từ 1001 để không xô lệch số buổi chính thức (mốc học bạ, gói học) */
export const EXTRA_SEQUENCE_BASE = 1000;

export function nextExtraSequence(existing: readonly number[]): number {
  const extras = existing.filter((n) => n > EXTRA_SEQUENCE_BASE);
  return (extras.length ? Math.max(...extras) : EXTRA_SEQUENCE_BASE) + 1;
}

export function sessionLabel(seq: number, kind: SessionKind): string {
  if (kind === "regular" && seq <= EXTRA_SEQUENCE_BASE) return `Buổi ${seq}`;
  return `${SESSION_KIND_VI[kind]} #${seq > EXTRA_SEQUENCE_BASE ? seq - EXTRA_SEQUENCE_BASE : seq}`;
}

export interface ChecklistItem { key: string; label: string; required: boolean }

export const SESSION_CHECKLIST: { pre: ChecklistItem[]; post: ChecklistItem[] } = {
  pre: [
    { key: "kit", label: "Kiểm tra bộ kit / pin / thiết bị đủ cho lớp", required: false },
    { key: "lesson", label: "Xem trước bài học và mục tiêu buổi", required: false },
    { key: "room", label: "Phòng học, máy chiếu, mạng sẵn sàng", required: false },
  ],
  post: [
    { key: "cleanup", label: "Thu dọn, kiểm đếm kit sau buổi", required: true },
    { key: "photos", label: "Tải ảnh lớp (nếu có) để duyệt", required: false },
    { key: "handover", label: "Bàn giao HV cho phụ huynh đầy đủ", required: true },
  ],
};

export type ChecklistState = { pre?: Record<string, boolean>; post?: Record<string, boolean> };

/** Các mục bắt buộc sau buổi chưa tick — chặn "Hoàn tất" */
export function missingRequiredChecklist(state: ChecklistState | null | undefined): ChecklistItem[] {
  return SESSION_CHECKLIST.post.filter((i) => i.required && !state?.post?.[i.key]);
}
