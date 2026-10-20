/**
 * HỒ SƠ CÔNG NGHỆ — lớp "đọc theo khung TH STEAM" phủ lên dữ liệu hồ sơ (`PortfolioView`).
 *
 * Không đọc CSDL: chỉ ghép dữ liệu đã có (phiếu buổi, học bạ mốc, chứng nhận) với khung chương trình chuẩn
 * (`curriculum/thsteam.ts`) để phụ huynh đọc được:
 *   - Con đang ở chương trình nào, năm học thứ mấy, đã qua mấy học phần (mỗi học phần 15 buổi, buổi 15 là buổi báo cáo).
 *   - Bức tranh 6 năng lực + 3 phẩm chất theo thang Tốt / Đạt / Cần cố gắng, kèm mô tả "con làm được gì" của đúng
 *     chương trình đó (bảng "Con thay đổi gì sau mỗi năm học").
 *   - Sản phẩm / dự án con đã làm (ghi chú sản phẩm của phiếu buổi) và sản phẩm dự kiến của từng học phần.
 */
import { TH_CRITERIA_ORDER, TH_DIFFICULTY_VI, TH_LEVEL_VI, TH_SESSIONS_PER_MODULE, TH_TRACK_SHORT, ageRange, programTitle, thCourseSpecs, thProgram, type ThCourseSpec } from "../curriculum/thsteam.js";
import type { ThProgram } from "../curriculum/thsteam-types.js";
import { RUBRIC_LABEL, RUBRIC_SCALE, convertScore, rubricLevelsFor } from "./rubric.js";
import type { MilestoneCardView, PortfolioCourseView, PortfolioView } from "./view.js";

let SPECS: Map<string, ThCourseSpec> | null = null;
function specOf(code: string): ThCourseSpec | null {
  SPECS ??= new Map(thCourseSpecs().map((s) => [s.code, s]));
  return SPECS.get(code) ?? null;
}

/** done = đã có học bạ buổi báo cáo · waiting = học đủ 15 buổi, chờ thầy cô phát hành học bạ · in_progress · upcoming */
export type TechModuleStatus = "done" | "waiting" | "in_progress" | "upcoming";
export const TECH_MODULE_STATUS_VI: Record<TechModuleStatus, string> = { done: "Đã báo cáo", waiting: "Chờ học bạ", in_progress: "Đang học", upcoming: "Sắp học" };

export interface TechModuleView {
  no: number;
  name: string;
  difficulty: string;
  learn: string;
  /** Sản phẩm dự kiến của học phần (theo chương trình) */
  product: string;
  canDo: string;
  fromSeq: number;
  toSeq: number;
  /** Số buổi đã có phiếu nhận xét trong học phần */
  sessionsDone: number;
  sessionsTotal: number;
  status: TechModuleStatus;
  /** Mức chung của học bạ buổi báo cáo (1–3) */
  level: number | null;
  levelLabel: string | null;
  reportDate: string | null;
}

export interface TechCourseView {
  enrollmentId: string;
  courseCode: string;
  courseName: string;
  kind: "year" | "exam" | "other";
  programCode: string | null;
  programTitle: string | null;
  trackShort: string | null;
  /** "Tiểu học · 8–10 tuổi" */
  levelLabel: string | null;
  yearNo: number | null;
  yearsTotal: number | null;
  software: string | null;
  statusLabel: string;
  sessionsDone: number;
  sessionsTotal: number | null;
  modules: TechModuleView[];
  certificateNo: string | null;
}

export interface CompetencyItem {
  name: string;
  group: string;
  /** Điểm trung bình trên thang RUBRIC_SCALE (một chữ số thập phân) */
  score: number | null;
  level: number | null;
  levelLabel: string | null;
  /** "Con làm được": mô tả của mức đạt được (theo chương trình) */
  hint: string | null;
  /** Năng lực này nghĩa là gì */
  desc: string | null;
}

export interface CompetencyGroup {
  name: string;
  kind: "nang-luc" | "pham-chat";
  items: CompetencyItem[];
}

export interface CompetencyProfile {
  /** Nguồn số liệu: "Học bạ buổi 30 · Lập trình robot ảo với RoboSim" hoặc "Trung bình các phiếu buổi" */
  source: string | null;
  sourceDate: string | null;
  groups: CompetencyGroup[];
  counts: { tot: number; dat: number; canCoGang: number; chuaCo: number };
}

export interface TechProduct {
  text: string;
  date: string;
  label: string;
  courseName: string;
}

export interface TechProfile {
  courses: TechCourseView[];
  current: TechCourseView | null;
  competency: CompetencyProfile;
  products: TechProduct[];
  teacherNote: { comment: string | null; strengths: string | null; improvements: string | null; authorName: string | null; label: string; date: string | null } | null;
  stats: { yearsDone: number; modulesDone: number; products: number; certificates: number };
}

const levelOf = (score: number | null): number | null => (score == null ? null : Math.min(RUBRIC_SCALE, Math.max(1, Math.round(score))));
const round1 = (n: number) => Math.round(n * 10) / 10;

function onScale(v: number | null | undefined, scale: number): number | null {
  if (v == null) return null;
  const c = scale === RUBRIC_SCALE ? v : convertScore(v, scale, RUBRIC_SCALE);
  return c == null ? null : round1(c);
}

function moduleViews(c: PortfolioCourseView, spec: ThCourseSpec, program: ThProgram | null): TechModuleView[] {
  if (spec.kind !== "year" || !program || spec.yearNo == null) return [];
  const year = program.years.find((y) => y.no === spec.yearNo);
  if (!year) return [];
  const seqs = new Set(c.sheets.map((s) => s.snapshot.context.sequenceNo));
  const finished = c.status === "completed" || !!c.certificate;
  return year.modules.map((m) => {
    const fromSeq = (m.no - 1) * TH_SESSIONS_PER_MODULE + 1;
    const toSeq = m.no * TH_SESSIONS_PER_MODULE;
    let done = 0;
    for (let k = fromSeq; k <= toSeq; k++) if (seqs.has(k)) done += 1;
    const card = c.milestones.find((x) => x.milestoneSeq === toSeq && x.publishedAt) ?? null;
    const status: TechModuleStatus = card || finished ? "done" : done >= TH_SESSIONS_PER_MODULE ? "waiting" : done > 0 ? "in_progress" : "upcoming";
    const level = card ? levelOf(onScale(card.average, card.scale)) : null;
    return {
      no: m.no, name: m.name, difficulty: TH_DIFFICULTY_VI[m.difficulty], learn: m.learn, product: m.product, canDo: m.canDo,
      fromSeq, toSeq, sessionsDone: done, sessionsTotal: TH_SESSIONS_PER_MODULE, status,
      level, levelLabel: level ? RUBRIC_LABEL[level] ?? null : null, reportDate: card?.publishedAt ?? null,
    };
  });
}

export function techCourseView(c: PortfolioCourseView): TechCourseView {
  const spec = specOf(c.courseCode);
  const program = spec ? thProgram(spec.programCode) : null;
  const year = spec?.yearNo != null && program ? program.years.find((y) => y.no === spec.yearNo) ?? null : null;
  const modules = spec ? moduleViews(c, spec, program) : [];
  return {
    enrollmentId: c.enrollmentId, courseCode: c.courseCode, courseName: c.courseName,
    kind: spec ? spec.kind : "other",
    programCode: program?.code ?? null,
    programTitle: program ? programTitle(program) : null,
    trackShort: program ? TH_TRACK_SHORT[program.track] : null,
    levelLabel: program ? `${TH_LEVEL_VI[program.level]} · ${year ? ageRange(year.ageFrom, year.ageTo) : ageRange(program.ageFrom, program.ageTo)}` : c.courseLevel,
    yearNo: spec?.yearNo ?? null,
    yearsTotal: program?.years.length ?? null,
    software: year?.software ?? null,
    statusLabel: c.statusLabel,
    sessionsDone: new Set(c.sheets.map((s) => s.snapshot.context.sequenceNo)).size,
    sessionsTotal: spec?.totalSessions ?? null,
    modules,
    certificateNo: c.certificate?.certificateNo ?? null,
  };
}

/** Học bạ mốc mới nhất đã phát hành (trong mọi khoá) */
function latestMilestone(view: PortfolioView): { card: MilestoneCardView; course: PortfolioCourseView } | null {
  let best: { card: MilestoneCardView; course: PortfolioCourseView } | null = null;
  for (const course of view.courses) {
    for (const card of course.milestones) {
      if (!card.publishedAt) continue;
      if (!best || card.publishedAt > best.card.publishedAt!) best = { card, course };
    }
  }
  return best;
}

export function competencyProfile(view: PortfolioView): CompetencyProfile {
  const latest = latestMilestone(view);
  // Khoá dùng để lấy mô tả mức: khoá của học bạ mới nhất, không thì khoá mới nhất có phiếu buổi
  const course = latest?.course ?? [...view.courses].reverse().find((c) => c.radar.some((r) => r.value != null)) ?? view.courses[view.courses.length - 1] ?? null;
  const spec = course ? specOf(course.courseCode) : null;
  const program = spec ? thProgram(spec.programCode) : null;

  const scoreOf = new Map<string, number | null>();
  let source: string | null = null;
  let sourceDate: string | null = null;
  if (latest) {
    for (const s of latest.card.scores) scoreOf.set(s.label, onScale(s.score ?? s.average, latest.card.scale));
    source = `${latest.card.label}${latest.course.courseName ? ` · ${latest.course.courseName}` : ""}`;
    sourceDate = latest.card.publishedAt;
  } else if (course) {
    for (const r of course.radar) scoreOf.set(r.label, r.value == null ? null : round1(r.value));
    if (course.radar.some((r) => r.value != null)) source = `Trung bình các phiếu buổi · ${course.courseName}`;
  }

  const counts = { tot: 0, dat: 0, canCoGang: 0, chuaCo: 0 };
  const item = (name: string, group: string): CompetencyItem => {
    const score = scoreOf.get(name) ?? null;
    const level = levelOf(score);
    const growth = program?.growth.find((g) => g.criterion === name) ?? null;
    const hints = growth ? [growth.before, growth.after1, growth.after2] : rubricLevelsFor(name).map((l) => l.hint);
    if (level === 3) counts.tot += 1; else if (level === 2) counts.dat += 1; else if (level === 1) counts.canCoGang += 1; else counts.chuaCo += 1;
    return {
      name, group, score, level, levelLabel: level ? RUBRIC_LABEL[level] ?? null : null,
      hint: level ? hints[level - 1] ?? null : null,
      desc: program?.competencies.find((c) => c.name === name)?.desc ?? null,
    };
  };
  const groups: CompetencyGroup[] = [];
  for (const { name, group } of TH_CRITERIA_ORDER) {
    let g = groups.find((x) => x.name === group);
    if (!g) { g = { name: group, kind: group === "Phẩm chất" ? "pham-chat" : "nang-luc", items: [] }; groups.push(g); }
    g.items.push(item(name, group));
  }
  return { source, sourceDate, groups, counts };
}

export function buildTechProfile(view: PortfolioView): TechProfile {
  const courses = view.courses.map(techCourseView);
  const current = [...courses].reverse().find((c) => c.kind === "year" && !c.certificateNo) ?? courses[courses.length - 1] ?? null;
  const products: TechProduct[] = view.courses
    .flatMap((c) => c.sheets.filter((s) => s.productNote?.trim()).map((s) => ({
      text: s.productNote!.trim(), date: s.snapshot.context.date, label: s.snapshot.context.label, courseName: c.courseName,
    })))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 12);
  const latest = latestMilestone(view);
  const teacherNote = latest && (latest.card.teacherComment || latest.card.strengths || latest.card.improvements)
    ? { comment: latest.card.teacherComment, strengths: latest.card.strengths, improvements: latest.card.improvements, authorName: latest.card.authorName, label: latest.card.label, date: latest.card.publishedAt }
    : null;
  return {
    courses, current,
    competency: competencyProfile(view),
    products,
    teacherNote,
    stats: {
      yearsDone: courses.filter((c) => c.kind === "year" && (c.certificateNo || (c.modules.length > 0 && c.modules.every((m) => m.status === "done")))).length,
      modulesDone: courses.reduce((n, c) => n + c.modules.filter((m) => m.status === "done").length, 0),
      products: products.length + view.gallery.length,
      certificates: view.certificates.length,
    },
  };
}
