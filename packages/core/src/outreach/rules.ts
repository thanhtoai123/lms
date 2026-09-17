/**
 * Phase 5F — Tuyển dụng, hội thoại đa kênh (cổng PH / Messenger / Zalo OA), nguồn giới thiệu, đo pilot chat.
 * Quy tắc thuần, không phụ thuộc DB.
 */
export class OutreachRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutreachRuleError";
  }
}
const fail = (m: string): never => {
  throw new OutreachRuleError(m);
};
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ */
/* Tuyển dụng                                                           */
/* ------------------------------------------------------------------ */

export const JOB_STATUSES = ["draft", "open", "paused", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_VI: Record<JobStatus, string> = { draft: "Nháp", open: "Đang tuyển", paused: "Tạm dừng", closed: "Đã đóng" };

export function validateJob(x: { title: string; description: string; openings: number; salaryMin?: number | null; salaryMax?: number | null; deadline?: string | null; today: string }): string[] {
  const e: string[] = [];
  if (x.title.trim().length < 5) e.push("Tên vị trí tối thiểu 5 ký tự");
  if (x.description.trim().length < 30) e.push("Mô tả công việc tối thiểu 30 ký tự");
  if (!Number.isInteger(x.openings) || x.openings < 1 || x.openings > 100) e.push("Số lượng tuyển 1–100");
  if (x.salaryMin != null && x.salaryMin < 0) e.push("Lương tối thiểu không âm");
  if (x.salaryMin != null && x.salaryMax != null && x.salaryMax < x.salaryMin) e.push("Lương tối đa nhỏ hơn tối thiểu");
  if (x.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(x.deadline)) e.push("Hạn nộp không hợp lệ");
  if (x.deadline && x.deadline < x.today) e.push("Hạn nộp đã qua");
  return e;
}

export function jobTransition(from: JobStatus, to: JobStatus, opts: { deadline?: string | null; today: string }): JobStatus {
  const allowed: Record<JobStatus, JobStatus[]> = { draft: ["open", "closed"], open: ["paused", "closed"], paused: ["open", "closed"], closed: ["open"] };
  if (!allowed[from].includes(to)) fail(`Tin "${JOB_STATUS_VI[from]}" không chuyển sang "${JOB_STATUS_VI[to]}" được`);
  if (to === "open" && opts.deadline && opts.deadline < opts.today) fail("Hạn nộp đã qua — sửa hạn trước khi mở lại");
  return to;
}

export const CANDIDATE_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected", "withdrawn"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const CANDIDATE_STAGE_VI: Record<CandidateStage, string> = {
  applied: "Mới ứng tuyển", screening: "Sàng lọc", interview: "Phỏng vấn", offer: "Đề nghị nhận việc", hired: "Đã nhận việc", rejected: "Không phù hợp", withdrawn: "Ứng viên rút",
};
const STAGE_NEXT: Record<CandidateStage, CandidateStage[]> = {
  applied: ["screening", "interview", "rejected", "withdrawn"],
  screening: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "withdrawn", "screening"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: ["screening"],
  withdrawn: [],
};
export function candidateTransition(from: CandidateStage, to: CandidateStage, opts: { reason?: string | null; interviewsScored: number }): CandidateStage {
  if (!STAGE_NEXT[from].includes(to)) fail(`Không chuyển từ "${CANDIDATE_STAGE_VI[from]}" sang "${CANDIDATE_STAGE_VI[to]}"`);
  if ((to === "rejected" || to === "withdrawn" || (from === "rejected" && to === "screening")) && (opts.reason ?? "").trim().length < 5) fail("Ghi lý do (≥ 5 ký tự)");
  if (to === "offer" && opts.interviewsScored < 1) fail("Cần ít nhất 1 buổi phỏng vấn đã chấm điểm trước khi đề nghị nhận việc");
  return to;
}

export function validateApplication(x: { fullName: string; phone: string; email?: string | null; consent: boolean; note?: string | null }): string[] {
  const e: string[] = [];
  if (x.fullName.trim().length < 2 || x.fullName.length > 120) e.push("Họ tên 2–120 ký tự");
  if (!/^0\d{9,10}$/.test(x.phone.replace(/\D/g, ""))) e.push("Số điện thoại không hợp lệ");
  if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) e.push("Email không hợp lệ");
  if (!x.consent) e.push("Cần đồng ý cho phép xử lý dữ liệu ứng tuyển");
  if ((x.note ?? "").length > 2000) e.push("Thư giới thiệu tối đa 2000 ký tự");
  return e;
}

export const INTERVIEW_RESULTS = ["pass", "fail", "hold"] as const;
export type InterviewResult = (typeof INTERVIEW_RESULTS)[number];
export const INTERVIEW_RESULT_VI: Record<InterviewResult, string> = { pass: "Đạt", fail: "Không đạt", hold: "Cân nhắc" };
export function validateInterview(x: { scheduledAt: Date; durationMin: number; now: Date }): string[] {
  const e: string[] = [];
  if (x.scheduledAt.getTime() < x.now.getTime() - 5 * 60_000) e.push("Giờ phỏng vấn đã qua");
  if (!Number.isInteger(x.durationMin) || x.durationMin < 15 || x.durationMin > 240) e.push("Thời lượng 15–240 phút");
  return e;
}
export function validateScore(x: { score: number; result: InterviewResult; feedback: string }): string[] {
  const e: string[] = [];
  if (!Number.isInteger(x.score) || x.score < 1 || x.score > 5) e.push("Điểm 1–5");
  if (!INTERVIEW_RESULTS.includes(x.result)) e.push("Kết quả không hợp lệ");
  if (x.feedback.trim().length < 10) e.push("Nhận xét tối thiểu 10 ký tự");
  return e;
}
/** Hồ sơ ứng viên không trúng tuyển: ẩn danh sau 12 tháng (đã nêu trong điều khoản ứng tuyển) */
export const CANDIDATE_RETENTION_MONTHS = 12;
export const RECRUIT_CONSENT_TEXT =
  "Tôi đồng ý để Sata Robo xử lý thông tin và CV của tôi cho mục đích tuyển dụng; hồ sơ không trúng tuyển được lưu tối đa 12 tháng rồi xoá / ẩn danh.";
export function jobCode(year: number, seq: number): string {
  return `TD${String(year).slice(-2)}-${String(seq).padStart(3, "0")}`;
}
export function jobSlug(title: string, code: string): string {
  const base = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base}-${code.toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Hội thoại đa kênh                                                    */
/* ------------------------------------------------------------------ */

export const MSG_CHANNELS = ["portal", "messenger", "zalo"] as const;
export type MsgChannel = (typeof MSG_CHANNELS)[number];
export const MSG_CHANNEL_VI: Record<MsgChannel, string> = { portal: "Cổng phụ huynh", messenger: "Facebook Messenger", zalo: "Zalo OA" };
export const CONV_STATUSES = ["open", "pending", "closed"] as const;
export type ConvStatus = (typeof CONV_STATUSES)[number];
export const CONV_STATUS_VI: Record<ConvStatus, string> = { open: "Cần trả lời", pending: "Chờ khách", closed: "Đã xong" };
/** Chỉ tiêu phản hồi đầu tiên (phút) */
export const FIRST_RESPONSE_SLA_MIN = 60;
export const MSG_MAX_LEN = 2000;

export type ReplyDecision = { allowed: true; tag: null | "HUMAN_AGENT"; expiresAt: Date | null } | { allowed: false; reason: string };
/**
 * Cửa sổ được phép nhắn:
 * - Messenger: 24 giờ kể từ tin cuối của khách; 24h–7 ngày chỉ khi người thật trả lời (thẻ HUMAN_AGENT); quá 7 ngày không gửi.
 * - Zalo OA (tin tư vấn): 7 ngày kể từ tương tác cuối; quá hạn phải dùng ZNS có mẫu duyệt.
 * - Cổng phụ huynh: luôn được gửi.
 */
export function replyWindow(channel: MsgChannel, lastInboundAt: Date | null, now: Date): ReplyDecision {
  if (channel === "portal") return { allowed: true, tag: null, expiresAt: null };
  if (!lastInboundAt) return { allowed: false, reason: "Khách chưa nhắn tới — không được chủ động nhắn trên kênh này" };
  const age = now.getTime() - lastInboundAt.getTime();
  if (channel === "messenger") {
    if (age <= DAY) return { allowed: true, tag: null, expiresAt: new Date(lastInboundAt.getTime() + DAY) };
    if (age <= 7 * DAY) return { allowed: true, tag: "HUMAN_AGENT", expiresAt: new Date(lastInboundAt.getTime() + 7 * DAY) };
    return { allowed: false, reason: "Quá 7 ngày từ tin cuối của khách — Messenger không cho gửi; hãy gọi điện hoặc chờ khách nhắn lại" };
  }
  if (age <= 7 * DAY) return { allowed: true, tag: null, expiresAt: new Date(lastInboundAt.getTime() + 7 * DAY) };
  return { allowed: false, reason: "Quá 7 ngày từ tương tác cuối — Zalo OA chỉ cho gửi tin ZNS theo mẫu đã duyệt" };
}

export function validateMessage(body: string): string[] {
  const t = body.trim();
  if (!t) return ["Nội dung trống"];
  if (t.length > MSG_MAX_LEN) return [`Tin nhắn tối đa ${MSG_MAX_LEN} ký tự`];
  return [];
}

/** Gắn cờ để quản lý chú ý — khiếu nại, hoàn tiền, nghỉ học, lời lẽ không phù hợp, chia sẻ số tài khoản cá nhân */
const FLAG_RULES: { key: string; label: string; re: RegExp }[] = [
  { key: "complaint", label: "Khiếu nại", re: /khiếu nại|bức xúc|không hài lòng|tệ quá|phản ánh/i },
  { key: "refund", label: "Hoàn tiền", re: /hoàn tiền|trả lại tiền|refund/i },
  { key: "churn", label: "Muốn nghỉ", re: /nghỉ học|cho con nghỉ|không học nữa|dừng học|bảo lưu/i },
  { key: "abuse", label: "Lời lẽ không phù hợp", re: /\b(đm|dm|vcl|đéo|ngu)\b/i },
  { key: "private_payment", label: "Chuyển khoản cá nhân", re: /(chuyển khoản|ck)[^.]{0,20}(stk|số tk|tài khoản)[^.]{0,15}(cá nhân|của em|của cô|của thầy)/i },
];
export const FLAG_VI: Record<string, string> = Object.fromEntries(FLAG_RULES.map((f) => [f.key, f.label]));
export function messageFlags(body: string): string[] {
  return FLAG_RULES.filter((f) => f.re.test(body)).map((f) => f.key);
}

/** Thống kê phản hồi: các cặp (tin khách đầu tiên chưa được trả lời → tin trả lời đầu tiên) */
export function responseStats(pairs: { inboundAt: Date; replyAt: Date | null }[], now: Date, slaMin = FIRST_RESPONSE_SLA_MIN) {
  const answered = pairs.filter((p) => p.replyAt).map((p) => (p.replyAt!.getTime() - p.inboundAt.getTime()) / 60_000).sort((a, b) => a - b);
  const waiting = pairs.filter((p) => !p.replyAt);
  const median = answered.length ? (answered.length % 2 ? answered[(answered.length - 1) / 2]! : (answered[answered.length / 2 - 1]! + answered[answered.length / 2]!) / 2) : null;
  return {
    total: pairs.length,
    answered: answered.length,
    medianMin: median === null ? null : Math.round(median),
    withinSla: answered.length ? Math.round((answered.filter((m) => m <= slaMin).length / answered.length) * 100) : null,
    waiting: waiting.length,
    waitingOverSla: waiting.filter((p) => now.getTime() - p.inboundAt.getTime() > slaMin * 60_000).length,
  };
}

/** Ghép tin theo thứ tự thời gian → các cặp chờ trả lời */
export function responsePairs(msgs: { direction: "in" | "out" | "note"; at: Date }[]): { inboundAt: Date; replyAt: Date | null }[] {
  const out: { inboundAt: Date; replyAt: Date | null }[] = [];
  let waitingSince: Date | null = null;
  for (const m of [...msgs].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (m.direction === "in" && !waitingSince) waitingSince = m.at;
    else if (m.direction === "out" && waitingSince) {
      out.push({ inboundAt: waitingSince, replyAt: m.at });
      waitingSince = null;
    }
  }
  if (waitingSince) out.push({ inboundAt: waitingSince, replyAt: null });
  return out;
}

export function maskExternalId(id: string): string {
  return id.length <= 6 ? "***" : `${id.slice(0, 3)}…${id.slice(-3)}`;
}

/* ------------------------------------------------------------------ */
/* Nguồn giới thiệu (affiliate)                                         */
/* ------------------------------------------------------------------ */

export const AFFILIATE_TYPES = ["parent", "partner", "staff", "other"] as const;
export type AffiliateType = (typeof AFFILIATE_TYPES)[number];
export const AFFILIATE_TYPE_VI: Record<AffiliateType, string> = { parent: "Phụ huynh", partner: "Đối tác / trường học", staff: "Nhân viên", other: "Khác" };
export type RewardRule = { kind: "fixed" | "percent"; value: number; cap?: number | null };
export const REWARD_STATUSES = ["pending", "approved", "paid", "cancelled"] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];
export const REWARD_STATUS_VI: Record<RewardStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt — chờ chi", paid: "Đã chi", cancelled: "Huỷ" };

export function normalizeRefCode(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{4,12}$/.test(s) ? s : null;
}
export function suggestRefCode(name: string, seq: number): string {
  const letters = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
  const initials = (letters.length > 1 ? letters.map((w) => w[0]).join("") : (letters[0] ?? "REF").slice(0, 4)).slice(0, 6);
  return `${initials.padEnd(3, "X")}${String(seq).padStart(3, "0")}`;
}
export function validateAffiliate(x: { name: string; phone?: string | null; code: string; type: AffiliateType; rule: RewardRule }): string[] {
  const e: string[] = [];
  if (x.name.trim().length < 2) e.push("Tên tối thiểu 2 ký tự");
  if (x.phone && !/^0\d{9,10}$/.test(x.phone.replace(/\D/g, ""))) e.push("Số điện thoại không hợp lệ");
  if (!normalizeRefCode(x.code)) e.push("Mã giới thiệu 4–12 ký tự chữ/số");
  if (!AFFILIATE_TYPES.includes(x.type)) e.push("Loại nguồn không hợp lệ");
  if (x.rule.kind === "fixed" && (!Number.isInteger(x.rule.value) || x.rule.value < 0 || x.rule.value > 20_000_000)) e.push("Thưởng cố định 0–20.000.000đ");
  if (x.rule.kind === "percent" && (x.rule.value < 0 || x.rule.value > 30)) e.push("Thưởng theo % tối đa 30%");
  if (x.rule.cap != null && x.rule.cap < 0) e.push("Mức trần không âm");
  return e;
}
/** Thưởng khi đơn học phí đầu tiên của lead được giới thiệu đã thu đủ */
export function rewardAmount(rule: RewardRule, orderPaid: number): number {
  const raw = rule.kind === "fixed" ? rule.value : Math.round((orderPaid * rule.value) / 100 / 1000) * 1000;
  return Math.max(0, rule.cap != null ? Math.min(raw, rule.cap) : raw);
}
export function rewardTransition(from: RewardStatus, action: "approve" | "pay" | "cancel", opts: { reason?: string | null; paymentRef?: string | null; sameUserAsApprover?: boolean }): RewardStatus {
  if (action === "approve") {
    if (from !== "pending") fail("Chỉ duyệt khoản đang chờ");
    return "approved";
  }
  if (action === "pay") {
    if (from !== "approved") fail("Chỉ chi khoản đã duyệt");
    if ((opts.paymentRef ?? "").trim().length < 3) fail("Ghi số chứng từ / mã giao dịch chi");
    if (opts.sameUserAsApprover) fail("Người duyệt không tự chi khoản mình duyệt");
    return "paid";
  }
  if (from === "paid" || from === "cancelled") fail("Khoản đã chi / đã huỷ");
  if ((opts.reason ?? "").trim().length < 5) fail("Ghi lý do huỷ (≥ 5 ký tự)");
  return "cancelled";
}

/* ------------------------------------------------------------------ */
/* Đo pilot chat                                                        */
/* ------------------------------------------------------------------ */

export const READ_TARGET_HOURS = 48;
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
export function readWithin(createdAt: Date, readAt: Date | null, hours = READ_TARGET_HOURS): boolean {
  return !!readAt && readAt.getTime() - createdAt.getTime() <= hours * HOUR;
}
/** Tiêu chí “đạt” của pilot — dùng để quyết định mở rộng */
export const PILOT_TARGETS = { activation: 70, engaged: 50, read48h: 80, withinSla: 80 } as const;
export function pilotVerdict(m: { activation: number; engaged: number; read48h: number; withinSla: number | null }): { pass: boolean; misses: string[] } {
  const misses: string[] = [];
  if (m.activation < PILOT_TARGETS.activation) misses.push(`Kích hoạt ${m.activation}% < ${PILOT_TARGETS.activation}%`);
  if (m.engaged < PILOT_TARGETS.engaged) misses.push(`PH có tương tác ${m.engaged}% < ${PILOT_TARGETS.engaged}%`);
  if (m.read48h < PILOT_TARGETS.read48h) misses.push(`Đọc trong 48h ${m.read48h}% < ${PILOT_TARGETS.read48h}%`);
  if (m.withinSla !== null && m.withinSla < PILOT_TARGETS.withinSla) misses.push(`Trả lời đúng hạn ${m.withinSla}% < ${PILOT_TARGETS.withinSla}%`);
  return { pass: misses.length === 0, misses };
}
