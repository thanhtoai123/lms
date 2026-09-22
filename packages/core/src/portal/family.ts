/**
 * CỔNG PHỤ HUYNH — luật thuần (docs/PHIA-NGUOI-DUNG.md).
 *
 *  - Phản hồi sau buổi một chạm (👍 Rất vui / 🙂 Ổn / 😟 Cần trao đổi) → quy ra điểm hài lòng 1–5 của
 *    bảng `parent_feedback` sẵn có; "Cần trao đổi" mở việc chăm sóc cho CSKH/QLL.
 *  - Chọn phiếu nhận xét gần nhất + tóm tắt nhanh cho trang chủ.
 *  - Lịch học tháng / tuần: lưới ngày Thứ Hai → Chủ nhật, trạng thái từng buổi.
 *  - Dòng thời gian lộ trình: khoá (đã / đang học, % buổi), học bạ mốc, giấy chứng nhận.
 * Không phụ thuộc thư viện / DOM.
 */
import type { ISODate } from "../types.js";
import { addDays, weekdayOf } from "../dates.js";

/* ------------------------------------------------------------------ */
/* Phản hồi sau buổi                                                    */
/* ------------------------------------------------------------------ */

export const SESSION_REACTIONS = ["happy", "ok", "concern"] as const;
export type SessionReaction = (typeof SESSION_REACTIONS)[number];
export const SESSION_REACTION_VI: Record<SessionReaction, { emoji: string; label: string }> = {
  happy: { emoji: "👍", label: "Rất vui" },
  ok: { emoji: "🙂", label: "Ổn" },
  concern: { emoji: "😟", label: "Cần trao đổi" },
};
/** Điểm hài lòng (thang 1–5 của parent_feedback) tương ứng mỗi cảm xúc */
export const REACTION_RATING: Record<SessionReaction, number> = { happy: 5, ok: 4, concern: 2 };
export const REACTION_NOTE_MAX = 300;
/** Phụ huynh phản hồi được buổi đã học trong vòng N ngày */
export const REACTION_WINDOW_DAYS = 14;
/** Mã việc chăm sóc khi phụ huynh chọn "Cần trao đổi" */
export const PARENT_CONCERN_TASK = "PARENT_CONCERN";

export function isSessionReaction(x: unknown): x is SessionReaction {
  return typeof x === "string" && (SESSION_REACTIONS as readonly string[]).includes(x);
}

/** Dòng cũ không có cột cảm xúc (CSKH ghi hộ bằng sao) → quy về cảm xúc gần nhất */
export function reactionOf(row: { reaction?: string | null; rating: number }): SessionReaction {
  if (isSessionReaction(row.reaction)) return row.reaction;
  return row.rating >= 5 ? "happy" : row.rating >= 3 ? "ok" : "concern";
}

export function validateReaction(input: { reaction: unknown; note?: string | null }, sessionDate: ISODate, today: ISODate): string[] {
  const e: string[] = [];
  if (!isSessionReaction(input.reaction)) e.push("Chọn một cảm xúc");
  if ((input.note ?? "").trim().length > REACTION_NOTE_MAX) e.push(`Ghi chú tối đa ${REACTION_NOTE_MAX} ký tự`);
  if (sessionDate > today) e.push("Buổi học chưa diễn ra");
  else if (sessionDate < addDays(today, -REACTION_WINDOW_DAYS)) e.push(`Chỉ phản hồi được buổi trong ${REACTION_WINDOW_DAYS} ngày gần nhất`);
  return e;
}

/**
 * Phụ huynh sửa được phản hồi khi: chưa có dòng nào, hoặc dòng do chính app phụ huynh tạo và CSKH chưa xử lý.
 * Dòng CSKH ghi hộ (điện thoại / Zalo) hoặc đã tiếp nhận thì chỉ hiển thị.
 */
export function reactionEditable(row: { channel: string; status: string } | null | undefined): boolean {
  return !row || (row.channel === "app" && row.status === "new");
}

export interface ReactionPlan {
  reaction: SessionReaction;
  rating: number;
  priority: "urgent" | "follow_up" | "normal";
  comment: string | null;
  /** Việc chăm sóc cần mở (chỉ khi "Cần trao đổi") */
  care: { code: string; title: string; hours: number } | null;
}

/** Phân loại phản hồi → điểm, mức ưu tiên, việc chăm sóc (nếu có) */
export function reactionPlan(reaction: SessionReaction, note: string | null | undefined, ctx: { studentName: string; sessionLabel: string }): ReactionPlan {
  const comment = (note ?? "").trim().slice(0, REACTION_NOTE_MAX) || null;
  const rating = REACTION_RATING[reaction];
  const priority = reaction === "concern" ? "urgent" : "normal";
  const care = reaction === "concern"
    ? { code: PARENT_CONCERN_TASK, title: `PH cần trao đổi sau ${ctx.sessionLabel} của ${ctx.studentName} — gọi lại trong 24h`.slice(0, 200), hours: 24 }
    : null;
  return { reaction, rating, priority, comment, care };
}

/** Đếm phản hồi theo cảm xúc (thẻ GV) */
export function reactionCounts(rows: readonly { reaction: SessionReaction }[]): Record<SessionReaction, number> {
  const out: Record<SessionReaction, number> = { happy: 0, ok: 0, concern: 0 };
  for (const r of rows) out[r.reaction] += 1;
  return out;
}

/* ------------------------------------------------------------------ */
/* Phiếu nhận xét gần nhất                                              */
/* ------------------------------------------------------------------ */

export interface SheetLike {
  date: ISODate;
  sequenceNo: number;
  publishedAt?: string | null;
}

/** Phiếu mới nhất theo ngày buổi học → số buổi → lúc phát hành */
export function pickLatestSheet<T extends SheetLike>(items: readonly T[]): T | null {
  let best: T | null = null;
  for (const it of items) {
    if (!best) { best = it; continue; }
    if (it.date !== best.date) { if (it.date > best.date) best = it; continue; }
    if (it.sequenceNo !== best.sequenceNo) { if (it.sequenceNo > best.sequenceNo) best = it; continue; }
    if ((it.publishedAt ?? "") > (best.publishedAt ?? "")) best = it;
  }
  return best;
}

export interface SheetGlance {
  average: number | null;
  /** Số tiêu chí đạt mức 3 trở lên */
  reached: number;
  rated: number;
  /** Tiêu chí mạnh nhất (mức cao nhất, ≥ 3) */
  best: string | null;
  /** Tiêu chí cần luyện thêm (mức thấp nhất, < 3) */
  practice: string | null;
}

/** Tóm tắt nhanh một phiếu cho thẻ trang chủ phụ huynh */
export function sheetGlance(criteria: readonly { label: string; value: number | null }[]): SheetGlance {
  const rated = criteria.filter((c): c is { label: string; value: number } => typeof c.value === "number" && c.value >= 1 && c.value <= 4);
  if (!rated.length) return { average: null, reached: 0, rated: 0, best: null, practice: null };
  const avg = Math.round((rated.reduce((s, c) => s + c.value, 0) / rated.length) * 10) / 10;
  let hi = rated[0]!;
  let lo = rated[0]!;
  for (const c of rated) {
    if (c.value > hi.value) hi = c;
    if (c.value < lo.value) lo = c;
  }
  return { average: avg, reached: rated.filter((c) => c.value >= 3).length, rated: rated.length, best: hi.value >= 3 ? hi.label : null, practice: lo.value < 3 ? lo.label : null };
}

/* ------------------------------------------------------------------ */
/* Lịch học tháng / tuần                                                */
/* ------------------------------------------------------------------ */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

export function monthRange(month: string): { from: ISODate; to: ISODate } {
  const from = `${month}-01`;
  const to = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return { from, to };
}

export function monthLabel(month: string): string {
  return `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;
}

/** Tháng hợp lệ trong khoảng ±24 tháng quanh hôm nay, không thì trả tháng hiện tại */
export function normalizeMonth(input: string | null | undefined, today: ISODate): string {
  const cur = monthOf(today);
  if (!input || !MONTH_RE.test(input)) return cur;
  if (input < shiftMonth(cur, -24) || input > shiftMonth(cur, 24)) return cur;
  return input;
}

export interface CalendarDay<T> {
  date: ISODate;
  inMonth: boolean;
  isToday: boolean;
  /** 1 = Thứ Hai … 7 = Chủ nhật */
  weekday: number;
  entries: T[];
  holiday: string | null;
}

function dayCell<T extends { date: ISODate; start?: string | null }>(date: ISODate, month: string | null, today: ISODate, entries: readonly T[], holidays: readonly { date: ISODate; name: string }[]): CalendarDay<T> {
  return {
    date,
    inMonth: month === null || date.startsWith(month),
    isToday: date === today,
    weekday: weekdayOf(date),
    entries: entries.filter((e) => e.date === date).sort((a, b) => ((a.start ?? "") < (b.start ?? "") ? -1 : (a.start ?? "") > (b.start ?? "") ? 1 : 0)),
    holiday: holidays.find((h) => h.date === date)?.name ?? null,
  };
}

/** Lưới tháng: các tuần Thứ Hai → Chủ nhật phủ trọn tháng (kèm vài ngày tháng trước / sau cho đủ tuần) */
export function monthGrid<T extends { date: ISODate; start?: string | null }>(
  month: string, entries: readonly T[], holidays: readonly { date: ISODate; name: string }[], today: ISODate,
): { month: string; label: string; weeks: CalendarDay<T>[][] } {
  const { from, to } = monthRange(month);
  const start = addDays(from, 1 - weekdayOf(from));
  const end = addDays(to, 7 - weekdayOf(to));
  const weeks: CalendarDay<T>[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => dayCell(addDays(d, i), month, today, entries, holidays)));
  }
  return { month, label: monthLabel(month), weeks };
}

/** Lưới tuần chứa ngày `anchor` */
export function weekGrid<T extends { date: ISODate; start?: string | null }>(
  anchor: ISODate, entries: readonly T[], holidays: readonly { date: ISODate; name: string }[], today: ISODate,
): CalendarDay<T>[] {
  const start = addDays(anchor, 1 - weekdayOf(anchor));
  return Array.from({ length: 7 }, (_, i) => dayCell(addDays(start, i), null, today, entries, holidays));
}

export type DayTone = "done" | "late" | "absent" | "excused" | "makeup" | "upcoming" | "requested" | "cancelled" | "pending";

/** Trạng thái một buổi trên lịch của con (điểm danh thắng trạng thái buổi) */
export function sessionTone(x: {
  date: ISODate; today: ISODate; sessionStatus: string; attendance: string | null | undefined; absenceRequested?: boolean;
}): { tone: DayTone; label: string } {
  switch (x.attendance) {
    case "present": return { tone: "done", label: "Có mặt" };
    case "late": return { tone: "late", label: "Đi muộn" };
    case "makeup": return { tone: "makeup", label: "Đã học bù" };
    case "absent_excused": return { tone: "excused", label: "Vắng có phép" };
    case "absent_unexcused": return { tone: "absent", label: "Vắng" };
    default: break;
  }
  if (x.sessionStatus === "cancelled" || x.sessionStatus === "rescheduled") return { tone: "cancelled", label: x.sessionStatus === "cancelled" ? "Buổi huỷ" : "Đã dời lịch" };
  if (x.absenceRequested) return { tone: "requested", label: "Đã xin nghỉ" };
  if (x.date >= x.today && x.sessionStatus !== "completed") return { tone: "upcoming", label: x.date === x.today ? "Hôm nay" : "Sắp học" };
  return { tone: "pending", label: "Chờ điểm danh" };
}

/* ------------------------------------------------------------------ */
/* Dòng thời gian lộ trình                                              */
/* ------------------------------------------------------------------ */

export function completionPercent(done: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((Math.max(0, done) / total) * 100)));
}

export interface JourneyCourseInput {
  enrollmentId: string;
  courseName: string;
  courseCode: string;
  className: string;
  status: string;
  statusLabel: string;
  from: ISODate | null;
  to: ISODate | null;
  sessionsDone: number;
  sessionsTotal: number;
  milestones: { id: string; label: string; date: ISODate | null; average: number | null }[];
  certificate: { number: string; issuedAt: ISODate | null; verifyPath: string | null; certificateId: string | null } | null;
}

export interface JourneyPathCertificate {
  number: string;
  title: string;
  issuedAt: ISODate | null;
  verifyPath: string | null;
  certificateId: string | null;
}

export type JourneyEntry =
  | { kind: "course"; key: string; date: ISODate | null; title: string; subtitle: string; state: "done" | "active" | "paused" | "other"; percent: number | null; sessionsDone: number; sessionsTotal: number; enrollmentId: string }
  | { kind: "milestone"; key: string; date: ISODate | null; title: string; subtitle: string; average: number | null }
  | { kind: "certificate"; key: string; date: ISODate | null; title: string; subtitle: string; number: string; verifyPath: string | null; certificateId: string | null; path: boolean };

const KIND_ORDER: Record<JourneyEntry["kind"], number> = { course: 0, milestone: 1, certificate: 2 };

export function courseState(status: string): "done" | "active" | "paused" | "other" {
  if (status === "completed") return "done";
  if (status === "active" || status === "trial") return "active";
  if (status === "paused") return "paused";
  return "other";
}

/**
 * Gộp dòng thời gian: mỗi khoá (ngày bắt đầu), học bạ mốc (ngày gửi PH), chứng nhận khoá / lộ trình (ngày cấp).
 * Xếp theo ngày tăng dần; mục chưa có ngày xếp cuối; cùng ngày thì khoá → học bạ → chứng nhận.
 */
export function buildJourney(courses: readonly JourneyCourseInput[], pathCerts: readonly JourneyPathCertificate[] = []): JourneyEntry[] {
  const out: JourneyEntry[] = [];
  for (const c of courses) {
    const percent = completionPercent(c.sessionsDone, c.sessionsTotal);
    out.push({
      kind: "course", key: `c:${c.enrollmentId}`, date: c.from, title: c.courseName,
      subtitle: `${c.className} · ${c.statusLabel}${c.sessionsTotal > 0 ? ` · ${Math.min(c.sessionsDone, c.sessionsTotal)}/${c.sessionsTotal} buổi` : ""}`,
      state: courseState(c.status), percent, sessionsDone: c.sessionsDone, sessionsTotal: c.sessionsTotal, enrollmentId: c.enrollmentId,
    });
    for (const m of c.milestones) {
      out.push({ kind: "milestone", key: `m:${m.id}`, date: m.date, title: `Học bạ ${m.label}`, subtitle: c.courseName, average: m.average });
    }
    if (c.certificate) {
      out.push({
        kind: "certificate", key: `cc:${c.certificate.number}`, date: c.certificate.issuedAt, title: `Chứng nhận hoàn thành ${c.courseName}`,
        subtitle: `Số ${c.certificate.number}`, number: c.certificate.number, verifyPath: c.certificate.verifyPath, certificateId: c.certificate.certificateId, path: false,
      });
    }
  }
  for (const p of pathCerts) {
    out.push({
      kind: "certificate", key: `cp:${p.number}`, date: p.issuedAt, title: `Chứng nhận hoàn thành lộ trình ${p.title}`,
      subtitle: `Số ${p.number}`, number: p.number, verifyPath: p.verifyPath, certificateId: p.certificateId, path: true,
    });
  }
  return out.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
}

/* ------------------------------------------------------------------ */
/* Nhiều con                                                            */
/* ------------------------------------------------------------------ */

/** Con đang chọn: đúng id nếu thuộc danh sách, không thì con đầu tiên */
export function pickChild<T extends { id: string }>(kids: readonly T[], wanted: string | null | undefined): T | null {
  return (wanted ? kids.find((k) => k.id === wanted) : undefined) ?? kids[0] ?? null;
}

/** Tên gọi ngắn trên chip: biệt danh; tên dài thì hai chữ cuối (Nguyễn Thị Minh Anh → Minh Anh) */
export function childShortName(k: { fullName: string; nickname?: string | null }): string {
  const nick = (k.nickname ?? "").trim();
  if (nick) return nick;
  const full = k.fullName.trim().replace(/\s+/g, " ");
  if (full.length <= 16) return full;
  return full.split(" ").slice(-2).join(" ");
}
