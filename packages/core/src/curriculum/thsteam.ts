/**
 * KHUNG CHƯƠNG TRÌNH CHUẨN TH STEAM ACADEMY — quy tắc thuần (không chạm CSDL).
 *
 * Cấu trúc (theo bộ slide chương trình đã duyệt, docs/KHUNG-CHUONG-TRINH.md):
 *   Chuyên ngành (4) → Chương trình theo cấp học (9) → Năm học (khoá học, 45 buổi) → Học phần (3 × 15 buổi) → Buổi (90 phút)
 *   + Khoá luyện thi tự chọn, học thêm sau năm học tương ứng (15 hoặc 30 buổi tuỳ chuyên ngành).
 * Mỗi học phần: buổi 1–4 và 6–12 học + làm dự án; buổi 5 ôn tập; buổi 13–14 dự án cuối học phần (lên ý tưởng, demo);
 * buổi 15 báo cáo trước phụ huynh — buổi 15 là MỐC HỌC BẠ (6 năng lực + 3 phẩm chất, 3 mức Tốt / Đạt / Cần cố gắng).
 *
 * Dữ liệu chữ lấy nguyên văn từ slide (./thsteam-data.ts). Trong CSDL, khoá học khớp với danh mục qua MÃ KHOÁ
 * (`ROBO-TH-N1`, `CODE-THCS1-THI-KHKT` …) nên không cần thêm cột liên kết.
 */
import type { CriterionTemplate } from "../portfolio/standard.js";
import { TH_CATALOG_DATA } from "./thsteam-data.js";
import type { ThContest, ThDifficulty, ThProgram, ThSchoolLevel, ThTrack, ThTrackCode, ThYear } from "./thsteam-types.js";

export type { ThCatalogData, ThCompetency, ThContest, ThDifficulty, ThGrowthRow, ThModule, ThProgram, ThSchoolLevel, ThTrack, ThTrackCode, ThYear } from "./thsteam-types.js";

/* ------------------------------------------------------------------ */
/* Chuẩn chung                                                         */
/* ------------------------------------------------------------------ */

export const TH_SESSION_MINUTES = 90;
export const TH_SESSIONS_PER_MODULE = 15;
export const TH_MODULES_PER_YEAR = 3;
export const TH_SESSIONS_PER_YEAR = TH_SESSIONS_PER_MODULE * TH_MODULES_PER_YEAR;
export const TH_CLASS_SIZE = "6–8 học sinh";
export const TH_PLATFORM = "ClassIn";
/** Mọi chương trình học online, 1 buổi/tuần */
export const TH_DELIVERY = `Học online qua ${TH_PLATFORM} · lớp nhóm ${TH_CLASS_SIZE} · ${TH_SESSION_MINUTES} phút/buổi · 1 buổi/tuần`;

export const TH_LEVEL_VI: Record<ThSchoolLevel, string> = { "tieu-hoc": "Tiểu học", thcs: "THCS", thpt: "THPT" };
/** Màu theo cấp học (bộ nhận diện): chữ / nền */
export const TH_LEVEL_COLOR: Record<ThSchoolLevel, { fg: string; bg: string }> = {
  "tieu-hoc": { fg: "#047857", bg: "#D1FAE5" },
  thcs: { fg: "#1D4ED8", bg: "#DBEAFE" },
  thpt: { fg: "#0F172A", bg: "#E2E8F0" },
};
export const TH_DIFFICULTY_VI: Record<ThDifficulty, string> = { basic: "Basic (Nền tảng)", advanced: "Advanced (Nâng cao)", expert: "Expert (Chuyên sâu)" };
export const TH_DIFFICULTY_SHORT: Record<ThDifficulty, string> = { basic: "Basic", advanced: "Advanced", expert: "Expert" };
/** Tên ngắn của chuyên ngành (nhãn, chip) */
export const TH_TRACK_SHORT: Record<ThTrackCode, string> = { ROBO: "Robotics AI", AI: "Trí tuệ nhân tạo AI", DOHOA: "Đồ họa AI", CODE: "Lập trình AI" };

/** Vai trò từng buổi trong một học phần 15 buổi */
export type ThSessionRole = "learn" | "review" | "project" | "demo" | "report";
export const TH_SESSION_ROLE_VI: Record<ThSessionRole, string> = {
  learn: "Học và làm dự án",
  review: "Ôn tập",
  project: "Dự án cuối học phần",
  demo: "Dự án cuối học phần · demo",
  report: "Báo cáo học phần",
};
/** Buổi thứ `k` (1–15) của học phần làm gì */
export function sessionRole(k: number): ThSessionRole {
  if (k === 5) return "review";
  if (k === 13) return "project";
  if (k === 14) return "demo";
  if (k === 15) return "report";
  return "learn";
}

/** Học phí năm học 2026–2027 (giống nhau ở 4 chuyên ngành). Khoá luyện thi chưa gồm lệ phí dự thi */
export const TH_PRICING = {
  schoolYear: "2026–2027",
  year: { sessions: TH_SESSIONS_PER_YEAR, group: { list: 7_500_000, discountPct: 25, price: 5_625_000 }, oneToOne: { list: 22_500_000, discountPct: 15, price: 19_125_000 } },
  combo: { sessions: TH_SESSIONS_PER_YEAR * 2, group: { list: 15_000_000, discountPct: 35, price: 9_750_000 }, oneToOne: { list: 45_000_000, discountPct: 15, price: 38_250_000 } },
  /** Theo số buổi của khoá luyện thi */
  exam: { 15: { group: 3_000_000, oneToOne: 9_000_000 }, 30: { group: 6_000_000, oneToOne: 18_000_000 } } as Record<number, { group: number; oneToOne: number }>,
  note: "Học phí khóa luyện thi chưa gồm lệ phí dự thi (do ban tổ chức cuộc thi thu riêng). Lớp kèm 1:1: giá niêm yết bằng 3 lần lớp nhóm.",
} as const;

/* ------------------------------------------------------------------ */
/* Danh mục                                                            */
/* ------------------------------------------------------------------ */

export const TH_TRACKS: readonly ThTrack[] = TH_CATALOG_DATA.tracks;
export const TH_PROGRAMS: readonly ThProgram[] = TH_CATALOG_DATA.programs;
/** Các đoạn chuẩn chung (chuẩn đào tạo, học online, cấu trúc học phần, buổi học, đồng hành phụ huynh, buổi báo cáo, giảng viên, điều khoản) */
export const TH_STANDARD_TEXT: Readonly<Record<string, string>> = TH_CATALOG_DATA.standard;

export function thTrack(code: string): ThTrack | null {
  return TH_TRACKS.find((t) => t.code === code) ?? null;
}
export function thProgram(code: string): ThProgram | null {
  return TH_PROGRAMS.find((p) => p.code === code) ?? null;
}
export function thProgramsOfTrack(code: string): ThProgram[] {
  return TH_PROGRAMS.filter((p) => p.track === code);
}

export const ageRange = (a: number, b: number) => `${a}–${b} tuổi`;
/** Lớp ở trường theo tuổi (6 tuổi = lớp 1), giới hạn 1–12 */
export function gradeOfAge(age: number): number {
  return Math.min(12, Math.max(1, age - 5));
}

export function yearCourseCode(p: ThProgram, yearNo: number): string {
  return `${p.code}-N${yearNo}`;
}
export function examCourseCode(p: ThProgram, c: ThContest): string {
  return `${p.code}-THI-${c.key}`;
}
/** Tên khoá luyện thi: "Luyện thi: <tên cuộc thi>" — trùng cuộc thi ở hai cấp học thì thêm cấp học */
export function examCourseName(p: ThProgram, c: ThContest): string {
  const dup = TH_PROGRAMS.some((o) => o.code !== p.code && o.contests.some((x) => x.key === c.key));
  return dup ? `Luyện thi: ${c.short} (${TH_LEVEL_VI[p.level]} ${p.ageFrom}–${p.ageTo})` : `Luyện thi: ${c.short}`;
}
/** Chương trình học: "Lập trình Robotics AI · Tiểu học 8–10 tuổi" */
export function programTitle(p: ThProgram): string {
  return `${thTrack(p.track)?.name ?? p.track} · ${TH_LEVEL_VI[p.level]} ${ageRange(p.ageFrom, p.ageTo)}`;
}
export function programSummary(p: ThProgram): string {
  const n = p.years.length;
  return `${n} năm học · ${n * TH_SESSIONS_PER_YEAR} buổi · ${p.years.map((y) => y.software).join(" → ")}`;
}

/* ------------------------------------------------------------------ */
/* Kế hoạch buổi học                                                   */
/* ------------------------------------------------------------------ */

export interface ThLessonSpec {
  seq: number;
  title: string;
  objectives: string;
  materials: string | null;
  /** Mốc học bạ (buổi báo cáo) */
  milestone: boolean;
  /** Học phần thứ mấy (1–3) — khoá luyện thi: giai đoạn 15 buổi */
  module: number;
  role: ThSessionRole | "exam";
}

/** 45 buổi của một năm học: 3 học phần × 15 buổi theo cấu trúc chuẩn */
export function yearLessonPlan(y: ThYear): ThLessonSpec[] {
  const out: ThLessonSpec[] = [];
  for (const m of y.modules) {
    let lessonNo = 0;
    for (let k = 1; k <= TH_SESSIONS_PER_MODULE; k += 1) {
      const role = sessionRole(k);
      const seq = (m.no - 1) * TH_SESSIONS_PER_MODULE + k;
      const head = `HP${m.no} · ${TH_DIFFICULTY_SHORT[m.difficulty]} — `;
      let title: string;
      let objectives: string;
      if (role === "learn") {
        lessonNo += 1;
        title = `${head}${m.name} · bài ${lessonNo}`;
        objectives = `Con học: ${m.learn}. Mỗi buổi học một kiến thức mới và làm một sản phẩm.`;
      } else if (role === "review") {
        title = `${head}Ôn tập`;
        objectives = "Củng cố kiến thức, hoàn thiện sản phẩm cùng giáo viên.";
      } else if (role === "project") {
        title = `${head}Dự án cuối học phần: lên ý tưởng`;
        objectives = `Con tự lên ý tưởng và bắt đầu xây dựng dự án. Gợi ý sản phẩm: ${m.product}.`;
      } else if (role === "demo") {
        title = `${head}Dự án cuối học phần: hoàn thiện và demo`;
        objectives = `Con hoàn thiện và trình diễn (demo) dự án. Mục tiêu: ${m.canDo}.`;
      } else {
        title = `${head}Báo cáo học phần trước phụ huynh`;
        objectives = "Con trình bày ý tưởng, vận hành sản phẩm, trả lời câu hỏi; giáo viên nhận xét. Phụ huynh nhận phiếu đánh giá 6 năng lực + 3 phẩm chất.";
      }
      out.push({ seq, title, objectives, materials: y.software, milestone: role === "report", module: m.no, role });
    }
  }
  return out;
}

/** Đọc "Buổi 1–8: nội dung" → khoảng buổi + nội dung */
export function parseSyllabus(lines: readonly string[]): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  for (const l of lines) {
    const m = /^Buổi\s+(\d+)\s*[–-]\s*(\d+)\s*:\s*(.+)$/.exec(l.trim());
    if (m) out.push({ from: Number(m[1]), to: Number(m[2]), text: m[3]!.trim().replace(/\.$/, "") });
  }
  return out;
}

/** Buổi của khoá luyện thi theo đề cương; mốc học bạ mỗi 15 buổi và buổi cuối */
export function examLessonPlan(c: ThContest): ThLessonSpec[] {
  const ranges = parseSyllabus(c.syllabus);
  const out: ThLessonSpec[] = [];
  for (let seq = 1; seq <= c.sessions; seq += 1) {
    const r = ranges.find((x) => seq >= x.from && seq <= x.to);
    const text = r ? r.text.charAt(0).toUpperCase() + r.text.slice(1) : "Luyện tập theo đề mùa thi";
    out.push({
      seq, title: `Luyện thi ${c.short} · buổi ${seq}: ${text}`, objectives: text + ".", materials: null,
      milestone: seq % TH_SESSIONS_PER_MODULE === 0 || seq === c.sessions, module: Math.ceil(seq / TH_SESSIONS_PER_MODULE), role: "exam",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tiêu chí học bạ: 6 năng lực + 3 phẩm chất                           */
/* ------------------------------------------------------------------ */

/** Thứ tự và nhóm chuẩn của 9 tiêu chí */
export const TH_CRITERIA_ORDER: readonly { name: string; group: string }[] = [
  { name: "Tư duy công nghệ", group: "Tư duy" },
  { name: "Tư duy phản biện", group: "Tư duy" },
  { name: "Kỹ năng vi tính", group: "Kỹ năng số" },
  { name: "Tiếng Anh chuyên ngành", group: "Kỹ năng số" },
  { name: "Tự tin, trình bày", group: "Bản lĩnh" },
  { name: "Tự chủ, hành vi số", group: "Bản lĩnh" },
  { name: "Chăm chỉ", group: "Phẩm chất" },
  { name: "Trách nhiệm", group: "Phẩm chất" },
  { name: "Trung thực", group: "Phẩm chất" },
];
export const TH_CRITERION_GROUPS: readonly string[] = ["Tư duy", "Kỹ năng số", "Bản lĩnh", "Phẩm chất"];

/**
 * Bộ tiêu chí học bạ của một chương trình. Mô tả 3 mức lấy từ bảng "Con thay đổi gì sau mỗi năm học" của chính
 * chương trình đó: Cần cố gắng = trước khi học · Đạt = sau năm 1 · Tốt = sau năm 2.
 */
export function programCriteria(p: ThProgram): CriterionTemplate[] {
  return TH_CRITERIA_ORDER.map(({ name, group }) => {
    const g = p.growth.find((r) => r.criterion === name);
    const c = p.competencies.find((x) => x.name === name);
    if (!g) throw new Error(`Chương trình ${p.code} thiếu tiêu chí "${name}" trong bảng thay đổi`);
    return { name, groupName: group, description: c?.desc ?? "", levelDescriptors: [g.before, g.after1, g.after2] };
  });
}

/* ------------------------------------------------------------------ */
/* Khoá học để nạp vào hệ thống                                        */
/* ------------------------------------------------------------------ */

export interface ThPackageSpec {
  code: string;
  name: string;
  level: string;
  sessions: number;
  listPrice: number;
  salePrice: number | null;
  description: string;
  isFeatured: boolean;
  sortOrder: number;
}

export interface ThCourseSpec {
  code: string;
  slug: string;
  name: string;
  kind: "year" | "exam";
  programCode: string;
  trackCode: ThTrackCode;
  yearNo: number | null;
  contestKey: string | null;
  totalSessions: number;
  sessionMinutes: number;
  gradeFrom: number;
  gradeTo: number;
  level: string;
  description: string;
  listPrice: number;
  /** Mã khoá gợi ý học tiếp */
  nextCode: string | null;
  packages: ThPackageSpec[];
  lessons: ThLessonSpec[];
  criteria: CriterionTemplate[];
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

function yearPackages(code: string): ThPackageSpec[] {
  const g = TH_PRICING.year.group;
  const o = TH_PRICING.year.oneToOne;
  return [
    { code: `${code}-NHOM`, name: "Lớp nhóm 6–8 học sinh · 1 năm học", level: "3 học phần · 45 buổi", sessions: TH_SESSIONS_PER_YEAR, listPrice: g.list, salePrice: g.price, description: `Niêm yết ${vnd(g.list)}, ưu đãi −${g.discountPct}% còn ${vnd(g.price)} (năm học ${TH_PRICING.schoolYear}).`, isFeatured: true, sortOrder: 1 },
    { code: `${code}-1KEM1`, name: "Lớp kèm 1:1 · 1 năm học", level: "3 học phần · 45 buổi", sessions: TH_SESSIONS_PER_YEAR, listPrice: o.list, salePrice: o.price, description: `Niêm yết ${vnd(o.list)}, ưu đãi −${o.discountPct}% còn ${vnd(o.price)} (năm học ${TH_PRICING.schoolYear}).`, isFeatured: false, sortOrder: 2 },
  ];
}

function examPackages(code: string, sessions: number): ThPackageSpec[] {
  const pr = TH_PRICING.exam[sessions] ?? { group: 0, oneToOne: 0 };
  return [
    { code: `${code}-NHOM`, name: `Lớp nhóm · trọn khóa ${sessions} buổi`, level: "Luyện thi · tự chọn", sessions, listPrice: pr.group, salePrice: null, description: "Chưa gồm lệ phí dự thi (ban tổ chức thu riêng).", isFeatured: true, sortOrder: 1 },
    { code: `${code}-1KEM1`, name: `Lớp kèm 1:1 · trọn khóa ${sessions} buổi`, level: "Luyện thi · tự chọn", sessions, listPrice: pr.oneToOne, salePrice: null, description: "Chưa gồm lệ phí dự thi (ban tổ chức thu riêng).", isFeatured: false, sortOrder: 2 },
  ];
}

const slugOf = (code: string) => code.toLowerCase();

/** Toàn bộ khoá học chuẩn: mỗi năm học một khoá 45 buổi + mỗi cuộc thi một khoá luyện thi */
export function thCourseSpecs(): ThCourseSpec[] {
  const out: ThCourseSpec[] = [];
  for (const p of TH_PROGRAMS) {
    const criteria = programCriteria(p);
    p.years.forEach((y, i) => {
      const code = yearCourseCode(p, y.no);
      const next = p.years[i + 1] ? yearCourseCode(p, p.years[i + 1]!.no) : null;
      out.push({
        code, slug: slugOf(code), name: y.title, kind: "year", programCode: p.code, trackCode: p.track, yearNo: y.no, contestKey: null,
        totalSessions: TH_SESSIONS_PER_YEAR, sessionMinutes: TH_SESSION_MINUTES,
        gradeFrom: gradeOfAge(y.ageFrom), gradeTo: gradeOfAge(y.ageTo),
        level: `${TH_LEVEL_VI[p.level]} · ${ageRange(y.ageFrom, y.ageTo)} · Năm ${y.no}/${p.years.length}`,
        description: [
          `${programTitle(p)} — năm học ${y.no}: ${y.software}.`,
          y.tools,
          y.modules.map((m) => `Học phần ${m.no} · ${TH_DIFFICULTY_VI[m.difficulty]}: ${m.name}.`).join(" "),
          y.featuredProjects.length ? `Dự án tiêu biểu: ${y.featuredProjects.join(", ")}.` : null,
          TH_DELIVERY + ".",
        ].filter(Boolean).join(" "),
        listPrice: TH_PRICING.year.group.list, nextCode: next, packages: yearPackages(code), lessons: yearLessonPlan(y), criteria,
      });
    });
    for (const c of p.contests) {
      const code = examCourseCode(p, c);
      const y = p.years.find((x) => x.no === c.afterYear) ?? p.years[p.years.length - 1]!;
      out.push({
        code, slug: slugOf(code), name: examCourseName(p, c), kind: "exam", programCode: p.code, trackCode: p.track, yearNo: c.afterYear, contestKey: c.key,
        totalSessions: c.sessions, sessionMinutes: TH_SESSION_MINUTES,
        gradeFrom: gradeOfAge(y.ageFrom), gradeTo: gradeOfAge(p.ageTo),
        level: `Luyện thi · tự chọn · sau năm ${c.afterYear}`,
        description: [`${c.full}.`, c.eligibility, c.syllabus.join(" "), c.reference ? `${c.reference}.` : null, "Khóa luyện thi là tự chọn, học thêm sau năm học tương ứng."].filter(Boolean).join(" "),
        listPrice: TH_PRICING.exam[c.sessions]?.group ?? 0, nextCode: null, packages: examPackages(code, c.sessions), lessons: examLessonPlan(c), criteria,
      });
    }
  }
  return out;
}

export interface ThPathSpec {
  code: string;
  name: string;
  description: string;
  criteriaText: string;
  courses: { code: string; required: boolean }[];
}

/** Lộ trình (để cấp chứng nhận): các năm học bắt buộc theo thứ tự + khoá luyện thi tự chọn */
export function thPathSpecs(): ThPathSpec[] {
  return TH_PROGRAMS.map((p) => ({
    code: p.code,
    name: programTitle(p),
    description: `${programSummary(p)}. ${TH_DELIVERY}.`,
    criteriaText: `Hoàn thành ${p.years.length} năm học (${p.years.length * TH_SESSIONS_PER_YEAR} buổi, ${p.years.length * TH_MODULES_PER_YEAR} học phần) của chương trình ${p.name}.`,
    courses: [
      ...p.years.map((y) => ({ code: yearCourseCode(p, y.no), required: true })),
      ...p.contests.map((c) => ({ code: examCourseCode(p, c), required: false })),
    ],
  }));
}

/** Khoá học đang có trong CSDL thuộc danh mục chuẩn không (theo mã) */
export function isThCourseCode(code: string): boolean {
  return thCourseSpecs().some((c) => c.code === code);
}
