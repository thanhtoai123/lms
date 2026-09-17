/**
 * Học liệu: tài liệu giảng dạy, gói SCORM, bài tập về nhà, đề xuất sửa giáo án — quy tắc thuần.
 */
export class ContentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentRuleError";
  }
}
const fail = (m: string): never => { throw new ContentRuleError(m); };

/* ------------------------------------------------------------------ */
/* Tài liệu                                                            */
/* ------------------------------------------------------------------ */

export const DOC_KINDS = ["file", "link", "scorm"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_VI: Record<DocKind, string> = { file: "Tệp", link: "Liên kết", scorm: "SCORM / bài giảng tương tác" };

export const DOC_AUDIENCES = ["teacher", "student"] as const;
export type DocAudience = (typeof DOC_AUDIENCES)[number];
export const DOC_AUDIENCE_VI: Record<DocAudience, string> = { teacher: "Chỉ giáo viên", student: "Giáo viên + học viên / phụ huynh" };

export const DOC_STATUSES = ["draft", "published", "archived"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_STATUS_VI: Record<DocStatus, string> = { draft: "Nháp", published: "Đang dùng", archived: "Lưu trữ" };

export const DOC_CATEGORIES = ["lesson_plan", "slides", "worksheet", "video", "guide", "program", "other"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export const DOC_CATEGORY_VI: Record<DocCategory, string> = {
  lesson_plan: "Giáo án", slides: "Bài trình chiếu", worksheet: "Phiếu bài tập", video: "Video", guide: "Hướng dẫn lắp / lập trình", program: "Mã chương trình mẫu", other: "Khác",
};

/** Phần mở rộng → MIME cho phép */
export const DOC_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  mp4: "video/mp4", zip: "application/zip", sb3: "application/octet-stream", txt: "text/plain",
};
export const DOC_MAX_BYTES = 50 * 1024 * 1024;
export const SCORM_MAX_BYTES = 200 * 1024 * 1024;
export const SCORM_MAX_FILES = 3000;

export function fileExt(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

export function validateDocFile(name: string, size: number, kind: DocKind): string | null {
  const ext = fileExt(name);
  if (kind === "scorm") {
    if (ext !== "zip") return "Gói SCORM phải là tệp .zip";
    if (size > SCORM_MAX_BYTES) return "Gói SCORM tối đa 200MB";
    return size > 0 ? null : "Tệp rỗng";
  }
  if (!DOC_FILE_TYPES[ext]) return `Không nhận tệp .${ext || "?"} — cho phép: ${Object.keys(DOC_FILE_TYPES).join(", ")}`;
  if (size <= 0) return "Tệp rỗng";
  if (size > DOC_MAX_BYTES) return "Tệp tối đa 50MB";
  return null;
}

export function safeFileName(name: string): string {
  const ext = fileExt(name);
  const base = name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "tai-lieu";
  return ext ? `${base}.${ext}` : base;
}

export function validateDocument(x: { title: string; kind: DocKind; url?: string | null; courseId?: string | null; description?: string | null }): string[] {
  const e: string[] = [];
  if (x.title.trim().length < 3) e.push("Tiêu đề tối thiểu 3 ký tự");
  if (x.title.length > 200) e.push("Tiêu đề tối đa 200 ký tự");
  if (!x.courseId) e.push("Chọn khoá học");
  if (x.kind === "link") {
    if (!x.url || !/^https:\/\/[^\s]+$/i.test(x.url)) e.push("Liên kết phải bắt đầu bằng https://");
  }
  if ((x.description ?? "").length > 2000) e.push("Mô tả tối đa 2000 ký tự");
  return e;
}

export function docTransition(from: DocStatus, to: DocStatus, hasContent: boolean): DocStatus {
  if (from === to) fail("Tài liệu đã ở trạng thái này");
  if (to === "published" && !hasContent) fail("Tài liệu chưa có tệp / liên kết — không thể phát hành");
  if (from === "archived" && to === "draft") fail("Tài liệu lưu trữ chỉ có thể phát hành lại");
  return to;
}

/** Video YouTube / Drive → link nhúng (nếu nhận ra) */
export function embedUrl(url: string): string | null {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const gd = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(url);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;
  return null;
}

/* ------------------------------------------------------------------ */
/* SCORM                                                               */
/* ------------------------------------------------------------------ */

export type ScormVersion = "1.2" | "2004";
export interface ScormManifest { version: ScormVersion; title: string; launch: string; identifier: string }

const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? null;
const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Đọc imsmanifest.xml (đủ cho gói SCORM 1.2 / 2004 thông dụng) */
export function parseScormManifest(xml: string): ScormManifest {
  if (!/<manifest[\s>]/i.test(xml)) fail("imsmanifest.xml không hợp lệ");
  const schemaVersion = /<schemaversion>\s*([^<]+)\s*<\/schemaversion>/i.exec(xml)?.[1]?.trim() ?? "";
  const version: ScormVersion = /2004|CAM 1\.3/i.test(schemaVersion) || /adlcp_v1p3|imscp_v1p1.*2004/i.test(xml) ? "2004" : "1.2";
  const manifestTag = /<manifest\b[^>]*>/i.exec(xml)?.[0] ?? "";
  const identifier = attr(manifestTag, "identifier") ?? "manifest";
  const orgTitle = /<organization\b[^>]*>[\s\S]*?<title>\s*([^<]+?)\s*<\/title>/i.exec(xml)?.[1];
  const itemTag = /<item\b[^>]*identifierref\s*=\s*"[^"]*"[^>]*>/i.exec(xml)?.[0];
  const ref = itemTag ? attr(itemTag, "identifierref") : null;
  const resources = [...xml.matchAll(/<resource\b[^>]*>/gi)].map((m) => m[0]);
  const res = (ref ? resources.find((r) => attr(r, "identifier") === ref) : null)
    ?? resources.find((r) => /scormtype\s*=\s*"sco"/i.test(r) && attr(r, "href"))
    ?? resources.find((r) => attr(r, "href"));
  const href = res ? attr(res, "href") : null;
  if (!href) fail("Không tìm thấy trang khởi chạy (resource href) trong imsmanifest.xml");
  const base = res ? attr(res, "xml:base") ?? "" : "";
  const launch = normalizeZipPath(decodeXml(`${base}${href}`).split("#")[0]!);
  if (!launch) fail("Đường dẫn khởi chạy không hợp lệ");
  return { version, title: decodeXml(orgTitle ?? identifier).trim().slice(0, 200), launch, identifier };
}

/** Chuẩn hoá đường dẫn trong gói: chặn ../, đường dẫn tuyệt đối */
export function normalizeZipPath(p: string): string {
  const clean = p.replace(/\\/g, "/").split("?")[0]!.replace(/^\.\//, "");
  if (!clean || clean.startsWith("/") || /^[A-Za-z]:/.test(clean)) return "";
  const parts: string[] = [];
  for (const seg of clean.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return "";
    if (!/^[A-Za-z0-9 ._()+,@=&'!~-]+$/.test(seg)) return "";
    parts.push(seg);
  }
  return parts.join("/");
}

export const SCORM_CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json", xml: "application/xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm", ogg: "audio/ogg", wav: "audio/wav",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", pdf: "application/pdf", swf: "application/x-shockwave-flash", txt: "text/plain",
};

export const SCORM_STATUSES = ["not_attempted", "incomplete", "completed", "passed", "failed"] as const;
export type ScormStatus = (typeof SCORM_STATUSES)[number];
export const SCORM_STATUS_VI: Record<ScormStatus, string> = { not_attempted: "Chưa học", incomplete: "Đang học", completed: "Hoàn thành", passed: "Đạt", failed: "Chưa đạt" };

/** Gộp dữ liệu CMI từ runtime SCORM 1.2 / 2004 thành trạng thái chuẩn */
export function scormStatusFromCmi(cmi: Record<string, string>): { status: ScormStatus; score: number | null; location: string | null; suspend: string | null; seconds: number } {
  const lesson = (cmi["cmi.core.lesson_status"] ?? "").toLowerCase();
  const completion = (cmi["cmi.completion_status"] ?? "").toLowerCase();
  const success = (cmi["cmi.success_status"] ?? "").toLowerCase();
  let status: ScormStatus = "incomplete";
  if (success === "passed" || lesson === "passed") status = "passed";
  else if (success === "failed" || lesson === "failed") status = "failed";
  else if (completion === "completed" || lesson === "completed") status = "completed";
  else if (lesson === "not attempted" && !completion) status = "not_attempted";
  const rawScore = cmi["cmi.score.scaled"] != null && cmi["cmi.score.scaled"] !== ""
    ? Number(cmi["cmi.score.scaled"]) * 100
    : cmi["cmi.core.score.raw"] ?? cmi["cmi.score.raw"];
  const n = rawScore === undefined || rawScore === "" ? NaN : Number(rawScore);
  const score = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : null;
  const session = cmi["cmi.core.session_time"] ?? cmi["cmi.session_time"] ?? "";
  return {
    status, score,
    location: (cmi["cmi.core.lesson_location"] ?? cmi["cmi.location"] ?? "").slice(0, 1000) || null,
    suspend: (cmi["cmi.suspend_data"] ?? "").slice(0, 64000) || null,
    seconds: parseScormTime(session),
  };
}

/** "0012:34:56.78" (1.2) hoặc "PT1H2M3.5S" (2004) → giây */
export function parseScormTime(t: string): number {
  if (!t) return 0;
  const a = /^(\d{1,4}):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/.exec(t);
  if (a) return Number(a[1]) * 3600 + Number(a[2]) * 60 + Number(a[3]);
  const b = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(t);
  if (b) return Math.round(Number(b[1] ?? 0) * 86400 + Number(b[2] ?? 0) * 3600 + Number(b[3] ?? 0) * 60 + Number(b[4] ?? 0));
  return 0;
}

const STATUS_RANK: Record<ScormStatus, number> = { not_attempted: 0, incomplete: 1, failed: 2, completed: 3, passed: 4 };
/** Trạng thái không bị "lùi" (đã hoàn thành rồi mở lại vẫn giữ hoàn thành) */
export function mergeScormStatus(prev: ScormStatus, next: ScormStatus): ScormStatus {
  return STATUS_RANK[next] >= STATUS_RANK[prev] ? next : prev;
}

/* ------------------------------------------------------------------ */
/* Bài tập về nhà                                                       */
/* ------------------------------------------------------------------ */

export const SUBMISSION_TYPES = ["file", "link", "text", "offline"] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];
export const SUBMISSION_TYPE_VI: Record<SubmissionType, string> = { file: "Nộp ảnh / tệp", link: "Nộp đường link (Scratch, video…)", text: "Trả lời ngắn", offline: "Nộp tại lớp" };

export const ASSIGNMENT_STATUSES = ["draft", "published", "closed"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const ASSIGNMENT_STATUS_VI: Record<AssignmentStatus, string> = { draft: "Nháp", published: "Đã giao", closed: "Đã đóng" };

export const SUBMISSION_STATUSES = ["assigned", "submitted", "returned", "graded", "excused", "missing"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const SUBMISSION_STATUS_VI: Record<SubmissionStatus, string> = {
  assigned: "Chưa nộp", submitted: "Đã nộp – chờ chấm", returned: "Trả lại làm lại", graded: "Đã chấm", excused: "Miễn", missing: "Không nộp",
};

export const SUBMISSION_MAX_FILES = 5;
export const SUBMISSION_MAX_BYTES = 10 * 1024 * 1024;
export const SUBMISSION_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const COIN_REWARD_MAX = 20;

export function validateAssignment(x: { title: string; instructions: string; dueAt: Date; maxScore: number; submissionType: SubmissionType; coinReward: number; now: Date; isNew: boolean }): string[] {
  const e: string[] = [];
  if (x.title.trim().length < 3) e.push("Tiêu đề tối thiểu 3 ký tự");
  if (x.instructions.trim().length < 10) e.push("Hướng dẫn tối thiểu 10 ký tự");
  if (Number.isNaN(x.dueAt.getTime())) e.push("Hạn nộp không hợp lệ");
  else if (x.isNew && x.dueAt.getTime() < x.now.getTime() + 60 * 60_000) e.push("Hạn nộp phải sau hiện tại ít nhất 1 giờ");
  else if (x.dueAt.getTime() > x.now.getTime() + 60 * 86_400_000) e.push("Hạn nộp tối đa 60 ngày");
  if (![10, 100].includes(x.maxScore)) e.push("Thang điểm 10 hoặc 100");
  if (!Number.isInteger(x.coinReward) || x.coinReward < 0 || x.coinReward > COIN_REWARD_MAX) e.push(`Thưởng xu 0–${COIN_REWARD_MAX}`);
  return e;
}

export type SubmissionAction = "submit" | "grade" | "return" | "excuse" | "reopen" | "mark_missing";

/** Chuyển trạng thái bài nộp; ném lỗi nếu không hợp lệ */
export function submissionTransition(from: SubmissionStatus, action: SubmissionAction, ctx: { assignmentStatus: AssignmentStatus; allowLate: boolean; late: boolean }): SubmissionStatus {
  if (ctx.assignmentStatus === "draft") fail("Bài tập chưa giao");
  switch (action) {
    case "submit":
      if (ctx.assignmentStatus === "closed") fail("Bài tập đã đóng — không nhận bài");
      if (from !== "assigned" && from !== "returned") fail(from === "submitted" ? "Bài đã nộp, chờ giáo viên chấm" : `Không nộp được khi "${SUBMISSION_STATUS_VI[from]}"`);
      if (ctx.late && !ctx.allowLate) fail("Đã quá hạn nộp");
      return "submitted";
    case "grade":
      if (from !== "submitted" && from !== "graded" && from !== "assigned" && from !== "missing") fail(`Không chấm được khi "${SUBMISSION_STATUS_VI[from]}"`);
      return "graded";
    case "return":
      if (from !== "submitted" && from !== "graded") fail("Chỉ trả lại bài đã nộp / đã chấm");
      if (ctx.assignmentStatus === "closed") fail("Bài tập đã đóng — mở lại trước khi trả bài");
      return "returned";
    case "excuse":
      if (from === "graded") fail("Bài đã chấm — không miễn");
      return "excused";
    case "reopen":
      if (from !== "excused" && from !== "missing") fail("Chỉ mở lại bài đã miễn / không nộp");
      return "assigned";
    case "mark_missing":
      if (from !== "assigned" && from !== "returned") fail("Chỉ đánh dấu không nộp cho bài chưa nộp");
      return "missing";
  }
}

export function validateGrade(score: number, maxScore: number, feedback: string | null | undefined): string[] {
  const e: string[] = [];
  if (!Number.isFinite(score) || score < 0 || score > maxScore) e.push(`Điểm 0–${maxScore}`);
  if (Math.round(score * 10) !== score * 10) e.push("Điểm tối đa 1 chữ số thập phân");
  if (score < maxScore / 2 && (feedback ?? "").trim().length < 10) e.push("Điểm dưới trung bình cần nhận xét ≥ 10 ký tự");
  return e;
}

export function validateSubmission(x: { type: SubmissionType; text?: string | null; link?: string | null; files: { mime: string; size: number }[] }): string[] {
  const e: string[] = [];
  if (x.type === "offline") e.push("Bài này nộp trực tiếp tại lớp");
  if (x.type === "text" && (x.text ?? "").trim().length < 2) e.push("Nhập câu trả lời");
  if (x.type === "link" && !/^https?:\/\/[^\s]+$/i.test(x.link ?? "")) e.push("Nhập đường link hợp lệ (http/https)");
  if (x.type === "file" && x.files.length === 0) e.push("Chọn ít nhất 1 ảnh / tệp");
  if (x.files.length > SUBMISSION_MAX_FILES) e.push(`Tối đa ${SUBMISSION_MAX_FILES} tệp`);
  if (x.files.some((f) => !(SUBMISSION_MIME as readonly string[]).includes(f.mime))) e.push("Chỉ nhận ảnh JPG / PNG / WEBP hoặc PDF");
  if (x.files.some((f) => f.size > SUBMISSION_MAX_BYTES)) e.push("Mỗi tệp tối đa 10MB");
  if ((x.text ?? "").length > 5000) e.push("Câu trả lời tối đa 5000 ký tự");
  return e;
}

/** Thống kê một bài tập */
export function assignmentStats(rows: { status: SubmissionStatus; score: number | null; late: boolean }[], maxScore: number) {
  const total = rows.filter((r) => r.status !== "excused").length;
  const turnedIn = rows.filter((r) => r.status === "submitted" || r.status === "graded").length;
  const graded = rows.filter((r) => r.status === "graded" && r.score !== null);
  const avg = graded.length ? Math.round((graded.reduce((a, r) => a + (r.score as number), 0) / graded.length) * 10) / 10 : null;
  return {
    total, turnedIn, graded: graded.length, late: rows.filter((r) => r.late).length,
    missing: rows.filter((r) => r.status === "missing").length, pending: rows.filter((r) => r.status === "submitted").length,
    rate: total ? Math.round((turnedIn / total) * 100) : 0,
    avg, avgPct: avg === null ? null : Math.round((avg / maxScore) * 100),
  };
}

/** Thưởng xu khi chấm: đạt ≥ 80% điểm */
export function earnsCoin(score: number, maxScore: number, coinReward: number): boolean {
  return coinReward > 0 && score >= maxScore * 0.8;
}

/* ------------------------------------------------------------------ */
/* Đề xuất sửa giáo án                                                 */
/* ------------------------------------------------------------------ */

export const PROPOSAL_TYPES = ["content", "objectives", "materials", "timing", "error", "other"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];
export const PROPOSAL_TYPE_VI: Record<ProposalType, string> = {
  content: "Nội dung bài", objectives: "Mục tiêu", materials: "Học cụ / chuẩn bị", timing: "Thời lượng / trình tự", error: "Sai sót trong giáo án", other: "Khác",
};
export const PROPOSAL_STATUSES = ["submitted", "in_review", "approved", "rejected", "applied", "withdrawn"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_VI: Record<ProposalStatus, string> = {
  submitted: "Mới gửi", in_review: "Đang xem xét", approved: "Đã duyệt – chờ áp dụng", rejected: "Không duyệt", applied: "Đã áp dụng", withdrawn: "Đã rút",
};
export type ProposalAction = "review" | "approve" | "reject" | "apply" | "withdraw";

export function proposalTransition(from: ProposalStatus, action: ProposalAction): ProposalStatus {
  const map: Record<ProposalStatus, Partial<Record<ProposalAction, ProposalStatus>>> = {
    submitted: { review: "in_review", approve: "approved", reject: "rejected", withdraw: "withdrawn" },
    in_review: { approve: "approved", reject: "rejected", withdraw: "withdrawn" },
    approved: { apply: "applied", reject: "rejected" },
    rejected: {},
    applied: {},
    withdrawn: {},
  };
  return map[from][action] ?? fail(`Đề xuất "${PROPOSAL_STATUS_VI[from]}" không thể ${action}`);
}

export interface LessonPatch { title?: string | null; objectives?: string | null; materials?: string | null }

export function validateProposal(x: { type: ProposalType; reason: string; patch: LessonPatch; current: { title: string; objectives: string | null; materials: string | null } }): string[] {
  const e: string[] = [];
  if (x.reason.trim().length < 20) e.push("Lý do / mô tả đề xuất tối thiểu 20 ký tự");
  const changed = changedFields(x.patch, x.current);
  if (x.type !== "timing" && x.type !== "other" && x.type !== "error" && changed.length === 0) e.push("Chưa có nội dung đề xuất thay đổi (tên bài / mục tiêu / học cụ)");
  if (x.patch.title !== undefined && x.patch.title !== null && x.patch.title.trim().length < 3) e.push("Tên bài tối thiểu 3 ký tự");
  return e;
}

export function changedFields(patch: LessonPatch, current: { title: string; objectives: string | null; materials: string | null }): ("title" | "objectives" | "materials")[] {
  const out: ("title" | "objectives" | "materials")[] = [];
  const norm = (s: string | null | undefined) => (s ?? "").trim();
  for (const k of ["title", "objectives", "materials"] as const) {
    if (patch[k] !== undefined && patch[k] !== null && norm(patch[k]) !== norm(current[k])) out.push(k);
  }
  return out;
}

/** Giáo án đã đổi kể từ lúc gửi đề xuất → cần xem lại trước khi áp dụng */
export function proposalConflict(snapshot: { title: string; objectives: string | null; materials: string | null }, current: { title: string; objectives: string | null; materials: string | null }, fields: ("title" | "objectives" | "materials")[]): string[] {
  const norm = (s: string | null | undefined) => (s ?? "").trim();
  return fields.filter((f) => norm(snapshot[f]) !== norm(current[f]));
}
