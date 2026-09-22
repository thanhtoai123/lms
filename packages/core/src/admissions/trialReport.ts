/**
 * PHIẾU ĐÁNH GIÁ BUỔI HỌC THỬ — quy tắc thuần (không chạm CSDL, không dùng kiểu DOM).
 *
 * Sau buổi học thử, giáo viên / tư vấn điền nhanh một phiếu nhận xét; hệ thống phát hành phiếu
 * thành một đường link riêng cho phụ huynh (xem docs/PHIEU-DANH-GIA-HOC-THU.md).
 *
 * Mẫu tiêu chí khai báo ở MỘT chỗ (`TRIAL_REPORT_TEMPLATE`): nhóm → tiêu chí → các mức có thứ tự
 * TĂNG DẦN (mức 1 thấp nhất, mức cuối cao nhất). Khi lưu phiếu, cả mẫu lẫn giá trị được chụp lại
 * (`snapshotAnswers`) vào cột JSONB — sau này đổi mẫu thì phiếu đã gửi phụ huynh không bị đổi nội dung.
 */

export const TRIAL_REPORT_STATUSES = ["draft", "published", "revoked"] as const;
export type TrialReportStatus = (typeof TRIAL_REPORT_STATUSES)[number];
export const TRIAL_REPORT_STATUS_VI: Record<TrialReportStatus, string> = {
  draft: "Bản nháp",
  published: "Đã phát hành",
  revoked: "Đã thu hồi",
};

/** Kết quả 3 mức — mỗi mức là một hành động cụ thể cho tư vấn, không còn "có / không" */
export const TRIAL_READINESS = ["ready", "one_more_trial", "not_yet"] as const;
export type TrialReadiness = (typeof TRIAL_READINESS)[number];
export const TRIAL_READINESS_VI: Record<TrialReadiness, string> = {
  ready: "Sẵn sàng vào học chính thức",
  one_more_trial: "Nên học thêm một buổi trải nghiệm",
  not_yet: "Chưa phù hợp ở thời điểm này",
};
/** Câu giải thích ngắn cho phụ huynh, in dưới kết quả */
export const TRIAL_READINESS_HINT: Record<TrialReadiness, string> = {
  ready: "Bé đã đủ nền tảng để vào lớp chính thức theo lộ trình đề xuất bên dưới.",
  one_more_trial: "Trung tâm mời bé học thêm một buổi để thầy cô đánh giá chính xác hơn.",
  not_yet: "Trung tâm sẽ tư vấn thời điểm và hình thức phù hợp hơn cho bé.",
};

export const TRIAL_PARENT_RESPONSES = ["consult_requested"] as const;
export type TrialParentResponse = (typeof TRIAL_PARENT_RESPONSES)[number];

/** Hạn link mặc định và giới hạn khi gia hạn (ngày) */
export const TRIAL_REPORT_SHARE_DAYS_DEFAULT = 90;
export const TRIAL_REPORT_SHARE_DAYS_MIN = 1;
export const TRIAL_REPORT_SHARE_DAYS_MAX = 365;
/** Ô nhận xét: tối thiểu một ô đạt độ dài này khi phát hành; trần độ dài mỗi ô */
export const TRIAL_REPORT_COMMENT_MIN = 20;
export const TRIAL_REPORT_COMMENT_MAX = 1000;
export const TRIAL_REPORT_NOTE_MAX = 300;
export const TRIAL_REPORT_LEVEL_MAX = 60;
/** Token chia sẻ: base64url, ≥ 32 byte ngẫu nhiên → 43 ký tự; nhận 32–80 để còn dùng token mẫu dễ nhớ */
export const TRIAL_REPORT_TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;

/* ------------------------------------------------------------------ */
/* Mẫu tiêu chí                                                        */
/* ------------------------------------------------------------------ */

export interface TrialReportLevel {
  /** 1 = thấp nhất … n = cao nhất */
  value: number;
  label: string;
}
export interface TrialReportCriterion {
  key: string;
  label: string;
  /** Gợi ý ngắn cho người chấm (không in cho phụ huynh) */
  hint?: string;
  levels: readonly TrialReportLevel[];
}
export interface TrialReportGroup {
  key: string;
  title: string;
  /** "skill" = được tính vào dòng tóm tắt; "interest" = mức độ yêu thích, hiển thị riêng */
  kind: "skill" | "interest";
  criteria: readonly TrialReportCriterion[];
}
export interface TrialReportTemplate {
  version: string;
  groups: readonly TrialReportGroup[];
}

const STANDARD: readonly TrialReportLevel[] = [
  { value: 1, label: "Cần hỗ trợ thêm" },
  { value: 2, label: "Khá" },
  { value: 3, label: "Tốt" },
];
const SPEED: readonly TrialReportLevel[] = [
  { value: 1, label: "Cần thêm thời gian" },
  { value: 2, label: "Vừa" },
  { value: 3, label: "Nhanh" },
];
const INTEREST: readonly TrialReportLevel[] = [
  { value: 1, label: "Đang làm quen" },
  { value: 2, label: "Thích" },
  { value: 3, label: "Rất thích" },
];

/**
 * Mẫu mặc định. Đổi mẫu = tăng `version`; phiếu cũ vẫn giữ bản chụp của mẫu cũ.
 * Mọi thang đều xếp tăng dần và dùng ngôn từ tích cực (không có "Chưa tốt").
 */
export const TRIAL_REPORT_TEMPLATE: TrialReportTemplate = {
  version: "2026.09",
  groups: [
    {
      key: "tech",
      title: "Khả năng công nghệ",
      kind: "skill",
      criteria: [
        { key: "grasp", label: "Khả năng nắm bắt kiến thức", hint: "Hiểu hướng dẫn, làm theo được mà không cần nhắc lại nhiều", levels: STANDARD },
        { key: "speed", label: "Tốc độ thực hành", hint: "Lắp ráp / lập trình xong trong thời gian của buổi", levels: SPEED },
        { key: "computer", label: "Khả năng sử dụng máy tính", hint: "Dùng chuột, bàn phím, mở và lưu bài", levels: STANDARD },
      ],
    },
    {
      key: "soft",
      title: "Kỹ năng mềm",
      kind: "skill",
      criteria: [
        { key: "focus", label: "Mức độ tập trung", levels: STANDARD },
        { key: "communication", label: "Giao tiếp, phát biểu ý kiến", levels: STANDARD },
        { key: "presentation", label: "Trình bày ý tưởng", levels: STANDARD },
      ],
    },
    {
      key: "interest",
      title: "Mức độ yêu thích",
      kind: "interest",
      criteria: [{ key: "interest", label: "Bé yêu thích môn học", levels: INTEREST }],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Bản chụp mẫu + giá trị                                              */
/* ------------------------------------------------------------------ */

export interface TrialReportAnswerCriterion {
  key: string;
  label: string;
  levels: TrialReportLevel[];
  /** Mức đã chọn; null = chưa chấm */
  value: number | null;
}
export interface TrialReportAnswerGroup {
  key: string;
  title: string;
  kind: "skill" | "interest";
  criteria: TrialReportAnswerCriterion[];
}
/** Nội dung cột `trial_reports.answers` */
export interface TrialReportAnswers {
  templateVersion: string;
  groups: TrialReportAnswerGroup[];
}

export type TrialReportValues = Record<string, number | null | undefined>;

/** Chụp lại mẫu kèm giá trị; giá trị không thuộc thang của tiêu chí bị bỏ (về null) */
export function snapshotAnswers(template: TrialReportTemplate, values: TrialReportValues): TrialReportAnswers {
  return {
    templateVersion: template.version,
    groups: template.groups.map((g) => ({
      key: g.key,
      title: g.title,
      kind: g.kind,
      criteria: g.criteria.map((c) => {
        const raw = values[c.key];
        const ok = typeof raw === "number" && c.levels.some((l) => l.value === raw);
        return { key: c.key, label: c.label, levels: c.levels.map((l) => ({ value: l.value, label: l.label })), value: ok ? raw : null };
      }),
    })),
  };
}

/**
 * Cập nhật giá trị trên một bản chụp CŨ (giữ nguyên mẫu đã chụp).
 * Dùng khi sửa phiếu: phiếu tạo theo mẫu cũ vẫn chấm theo thang cũ.
 */
export function applyValues(answers: TrialReportAnswers, values: TrialReportValues): TrialReportAnswers {
  return {
    templateVersion: answers.templateVersion,
    groups: answers.groups.map((g) => ({
      ...g,
      criteria: g.criteria.map((c) => {
        if (!(c.key in values)) return { ...c, levels: c.levels.map((l) => ({ ...l })) };
        const raw = values[c.key];
        const ok = typeof raw === "number" && c.levels.some((l) => l.value === raw);
        return { ...c, levels: c.levels.map((l) => ({ ...l })), value: ok ? raw : null };
      }),
    })),
  };
}

/** Đọc lại giá trị từ bản chụp (để nạp vào biểu mẫu sửa phiếu) */
export function answerValues(answers: TrialReportAnswers | null | undefined): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const g of answers?.groups ?? []) for (const c of g.criteria) out[c.key] = c.value ?? null;
  return out;
}

/** Tiêu chí chưa chấm */
export function missingCriteria(answers: TrialReportAnswers | null | undefined): string[] {
  const out: string[] = [];
  for (const g of answers?.groups ?? []) for (const c of g.criteria) if (c.value == null) out.push(c.label);
  return out;
}

/** Kiểm tra JSONB đọc từ CSDL có đúng hình dạng không (phòng dữ liệu hỏng) */
export function isTrialReportAnswers(x: unknown): x is TrialReportAnswers {
  if (!x || typeof x !== "object") return false;
  const a = x as { templateVersion?: unknown; groups?: unknown };
  if (typeof a.templateVersion !== "string" || !Array.isArray(a.groups)) return false;
  return a.groups.every((g: unknown) => {
    const gg = g as { key?: unknown; title?: unknown; criteria?: unknown };
    return typeof gg?.key === "string" && typeof gg.title === "string" && Array.isArray(gg.criteria)
      && gg.criteria.every((c: unknown) => {
        const cc = c as { key?: unknown; label?: unknown; levels?: unknown; value?: unknown };
        return typeof cc?.key === "string" && typeof cc.label === "string" && Array.isArray(cc.levels) && (cc.value === null || typeof cc.value === "number");
      });
  });
}

/* ------------------------------------------------------------------ */
/* Tóm tắt                                                             */
/* ------------------------------------------------------------------ */

export interface TrialReportSummary {
  /** Số tiêu chí kỹ năng (không tính "mức độ yêu thích") */
  total: number;
  answered: number;
  /** byLevel[0] = số tiêu chí ở mức 1 … byLevel[n-1] = mức cao nhất */
  byLevel: number[];
  /** Số tiêu chí ở mức cao nhất của thang */
  top: number;
  /** Câu tóm tắt cho phụ huynh, vd "5/6 tiêu chí đạt mức Tốt"; rỗng khi chưa chấm gì */
  headline: string;
}

/** Đếm số tiêu chí kỹ năng ở từng mức để hiển thị tóm tắt nhanh */
export function summarizeLevels(answers: TrialReportAnswers | null | undefined): TrialReportSummary {
  const skill = (answers?.groups ?? []).filter((g) => g.kind === "skill").flatMap((g) => g.criteria);
  const depth = Math.max(3, ...skill.map((c) => c.levels.length));
  const byLevel = Array.from({ length: depth }, () => 0);
  let answered = 0;
  let top = 0;
  for (const c of skill) {
    if (c.value == null) continue;
    const idx = c.levels.findIndex((l) => l.value === c.value);
    if (idx < 0) continue;
    answered += 1;
    // Quy về thang chung: mức cao nhất của tiêu chí luôn là ô cuối
    const pos = idx + (depth - c.levels.length);
    byLevel[pos] = (byLevel[pos] ?? 0) + 1;
    if (idx === c.levels.length - 1) top += 1;
  }
  const headline = answered === 0 ? "" : `${top}/${skill.length} tiêu chí đạt mức Tốt`;
  return { total: skill.length, answered, byLevel, top, headline };
}

/** Vị trí mức đã chọn trên thang (0-based) — dùng để tô thanh 3 nấc; -1 khi chưa chấm */
export function levelIndex(c: Pick<TrialReportAnswerCriterion, "levels" | "value">): number {
  if (c.value == null) return -1;
  return c.levels.findIndex((l) => l.value === c.value);
}

/* ------------------------------------------------------------------ */
/* Kiểm tra trước khi lưu / phát hành                                   */
/* ------------------------------------------------------------------ */

export interface TrialReportValidateInput {
  /** "draft" = lưu nháp (cho thiếu); "publish" = phát hành (đủ mọi thứ) */
  mode: "draft" | "publish";
  answers: TrialReportAnswers;
  strengths?: string | null;
  growth?: string | null;
  productNote?: string | null;
  readiness?: TrialReadiness | null;
  recommendedCourseId?: string | null;
  recommendedLevel?: string | null;
  recommendationNote?: string | null;
}

const len = (s: string | null | undefined) => (s ?? "").trim().length;

/** Trả danh sách lỗi tiếng Việt; rỗng = hợp lệ */
export function validateTrialReport(input: TrialReportValidateInput): string[] {
  const errs: string[] = [];
  const comments: [string, string | null | undefined][] = [
    ["Điểm nổi bật của bé", input.strengths],
    ["Bé có thể phát triển thêm", input.growth],
    ["Sản phẩm bé làm được trong buổi", input.productNote],
  ];
  for (const [label, v] of comments) {
    if (len(v) > TRIAL_REPORT_COMMENT_MAX) errs.push(`Ô "${label}" tối đa ${TRIAL_REPORT_COMMENT_MAX} ký tự`);
  }
  if (len(input.recommendationNote) > TRIAL_REPORT_NOTE_MAX) errs.push(`Lý do đề xuất tối đa ${TRIAL_REPORT_NOTE_MAX} ký tự`);
  if (len(input.recommendedLevel) > TRIAL_REPORT_LEVEL_MAX) errs.push(`Cấp độ bắt đầu tối đa ${TRIAL_REPORT_LEVEL_MAX} ký tự`);
  if (input.readiness != null && !(TRIAL_READINESS as readonly string[]).includes(input.readiness)) errs.push("Kết quả đánh giá không hợp lệ");
  if (input.mode === "draft") return errs;

  const missing = missingCriteria(input.answers);
  if (missing.length) errs.push(`Chưa chấm ${missing.length} tiêu chí: ${missing.join(", ")}`);
  if (!comments.some(([, v]) => len(v) >= TRIAL_REPORT_COMMENT_MIN)) {
    errs.push(`Cần ít nhất một ô nhận xét của giáo viên dài từ ${TRIAL_REPORT_COMMENT_MIN} ký tự`);
  }
  if (!input.readiness) errs.push("Chọn kết quả đánh giá");
  if (input.readiness === "ready" && !input.recommendedCourseId) errs.push("Bé sẵn sàng vào học chính thức — hãy chọn khoá học đề xuất");
  return errs;
}

/* ------------------------------------------------------------------ */
/* Mã phiếu, link chia sẻ                                              */
/* ------------------------------------------------------------------ */

/** Mã phiếu: `PDG-<mã cơ sở>-<yy>-<số 6 chữ số>`, vd `PDG-CS1-26-000123` */
export function trialReportCode(centerCode: string, year: number, seq: number): string {
  const cc = centerCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "") || "CS";
  return `PDG-${cc}-${String(year).slice(-2)}-${String(Math.max(0, Math.floor(seq))).padStart(6, "0")}`;
}

/** Phần đầu cố định của mã (để tìm số lớn nhất bằng `like`) */
export function trialReportCodePrefix(centerCode: string, year: number): string {
  return trialReportCode(centerCode, year, 0).slice(0, -6);
}

/** Số thứ tự kế tiếp theo (cơ sở, năm) = max + 1 trong các mã đã có */
export function nextTrialReportSeq(codes: readonly (string | null | undefined)[], centerCode: string, year: number): number {
  const prefix = trialReportCodePrefix(centerCode, year);
  let max = 0;
  for (const c of codes) {
    const t = (c ?? "").trim().toUpperCase();
    if (!t.startsWith(prefix)) continue;
    const rest = t.slice(prefix.length);
    if (/^\d{1,9}$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max + 1;
}

/** Số ngày hiệu lực của link (kẹp trong khoảng cho phép; sai định dạng → mặc định) */
export function clampShareDays(days: number | null | undefined): number {
  if (typeof days !== "number" || !Number.isFinite(days)) return TRIAL_REPORT_SHARE_DAYS_DEFAULT;
  return Math.min(TRIAL_REPORT_SHARE_DAYS_MAX, Math.max(TRIAL_REPORT_SHARE_DAYS_MIN, Math.floor(days)));
}

/** Hạn link tính từ một mốc */
export function shareExpiresAt(from: Date, days?: number | null): Date {
  return new Date(from.getTime() + clampShareDays(days) * 86_400_000);
}

export type TrialReportLinkState = "not_published" | "revoked" | "expired" | "ok";

export interface ShareLinkRow {
  status: TrialReportStatus;
  shareToken?: string | null;
  shareExpiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
}

/** Trạng thái link của một phiếu tại thời điểm `now` */
export function shareLinkState(report: ShareLinkRow, now: Date): TrialReportLinkState {
  if (report.status === "revoked" || report.revokedAt) return "revoked";
  if (report.status !== "published" || !report.shareToken) return "not_published";
  if (report.shareExpiresAt) {
    const exp = report.shareExpiresAt instanceof Date ? report.shareExpiresAt : new Date(report.shareExpiresAt);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) return "expired";
  }
  return "ok";
}

/** Link còn dùng được: đã phát hành + chưa hết hạn + chưa thu hồi */
export function isShareLinkUsable(report: ShareLinkRow, now: Date): boolean {
  return shareLinkState(report, now) === "ok";
}

/** Đường dẫn công khai của phiếu (ghép với địa chỉ gốc của trang) */
export function trialReportPath(token: string): string {
  return `/pdg/${token}`;
}

/** Tin nhắn soạn sẵn để dán vào Zalo */
export function trialReportShareMessage(childName: string | null | undefined, link: string): string {
  const name = (childName ?? "").trim().replace(/^bé\s+/i, "");
  return `Sata Robo gửi anh/chị kết quả buổi học thử của bé ${name || "nhà mình"}: ${link}`;
}
