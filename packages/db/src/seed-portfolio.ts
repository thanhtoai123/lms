/**
 * DỮ LIỆU MẪU — HỒ SƠ HỌC TẬP (docs/HO-SO-HOC-TAP.md). Chạy ở CUỐI `seed.ts`, chỉ dùng dữ liệu giả đã có.
 *
 *  - Sinh phiếu nhận xét ĐÃ PHÁT HÀNH cho mọi học viên có mặt ở các buổi `completed`
 *    (điểm tăng nhẹ theo thời gian cho chân thực; học viên vắng không có phiếu; buổi học bù ghi "Học bù").
 *  - Học bạ mốc đã có của các ghi danh → chuyển sang thang 4, điểm = trung bình phiếu buổi của giai đoạn,
 *    kèm bản chụp số liệu tổng hợp (xu hướng, chuyên cần, tỷ lệ đạt mục tiêu bài, thẻ nổi bật).
 *  - Hai ảnh lớp đã duyệt gắn một học viên mẫu (phụ huynh đồng ý đăng ảnh) làm minh chứng trên phiếu.
 *  - MỘT link chia sẻ hồ sơ cố định để xem thử: /hs/<DEMO_PORTFOLIO_TOKEN>.
 *  - Chuẩn hồ sơ (sql/0013): mô tả 4 mức + nhóm cho tiêu chí các khoá mẫu (theo bộ mẫu robotics),
 *    tiêu chí trọng tâm cho vài bài Sata4; ~10% phiếu phát hành trễ hạn để màn "Quản lý hồ sơ học tập" có số liệu.
 * PRNG cố định → chạy lại ra cùng dữ liệu.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  sessions, classes, courses, centers, lessons, teachers, attendance, enrollments, students, competencyCriteria, sessionEvaluations,
  reportCards, reportCardScores, portfolioShares, sessionMedia, appSettings, users, userRoles, studentGuardians, parents, lessonFocusCriteria,
} from "./schema/index";
import {
  buildSessionSnapshot, sessionLabel, aggregateMilestone, milestonePeriod, reportCardMilestones, tallyAttendance, snapshotScores,
  DEFAULT_HIGHLIGHTS, addDays, toISODate, orderCriteriaWithFocus, CRITERIA_TEMPLATE_ROBOTICS,
  type ObjectiveResult, type EvalForAggregate, type CriterionSource, type AttendanceStatus,
} from "@satarobo/core";
import type { Database } from "./index";

/** Token CỐ ĐỊNH, dễ nhớ của link hồ sơ học tập mẫu — xem thử tại /hs/<token> (chỉ dữ liệu mẫu) */
export const DEMO_PORTFOLIO_TOKEN = "xem-thu-ho-so-hoc-tap-sata-robo-mau";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function inChunks<T>(rows: readonly T[], fn: (part: T[]) => PromiseLike<unknown>, size = 300): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

const PRODUCT = [
  "Lắp xong mô hình theo bài và cho robot chạy thử thành công",
  "Tự viết chương trình điều khiển robot đi thẳng, rẽ trái, rẽ phải",
  "Hoàn thành thử thách sa bàn trong thời gian của buổi",
  "Cùng nhóm lắp cánh tay robot gắp được vật nhỏ",
  "Sửa được lỗi chương trình để robot dừng trước vật cản",
];
const REMARK = [
  "Hôm nay con tập trung tốt, chủ động hỏi khi chưa hiểu.",
  "Con lắp ráp nhanh và biết giúp bạn cùng nhóm.",
  "Con tự tìm ra lỗi trong chương trình, cô rất khen tinh thần kiên trì của con.",
  "Con trình bày sản phẩm trước lớp rõ ràng, tự tin hơn buổi trước.",
  "Con cần luyện thêm thao tác kéo thả khối lệnh; ở nhà bố mẹ có thể cho con ôn lại bài.",
  "Con có nhiều ý tưởng sáng tạo khi trang trí và cải tiến mô hình.",
];

/** Tên tiêu chí trong seed → tiêu chí của bộ mẫu robotics (mô tả 4 mức + nhóm) */
const SEED_CRITERIA_TEMPLATE: Record<string, string> = {
  "Tư duy lập trình": "Tư duy lập trình",
  "Lắp ráp & cơ khí": "Lắp ráp mô hình",
  "Giải quyết vấn đề": "Gỡ lỗi & giải quyết vấn đề",
  "Làm việc nhóm": "Hợp tác nhóm",
  "Thuyết trình": "Trình bày sản phẩm",
};
/** Tiêu chí trọng tâm của vài bài Sata4 (tên bài, tên tiêu chí) */
const SEED_FOCUS: [string, string][] = [
  ["Cảm biến siêu âm & đo khoảng cách", "Tư duy lập trình"],
  ["Vòng lặp & rẽ nhánh", "Tư duy lập trình"],
  ["Robot tránh vật cản", "Giải quyết vấn đề"],
  ["Lắp ráp khung gầm nâng cao", "Lắp ráp & cơ khí"],
  ["Dự án nhóm: robot phân loại", "Làm việc nhóm"],
  ["Dự án nhóm: robot phân loại", "Giải quyết vấn đề"],
  ["Gỡ lỗi & tối ưu", "Giải quyết vấn đề"],
  ["Thử thách sa hình & thuyết trình", "Thuyết trình"],
];

/** Chuẩn hồ sơ: mô tả 4 mức + nhóm cho tiêu chí mẫu, tiêu chí trọng tâm theo bài. Chạy lại không nhân đôi */
export async function seedCriteriaStandard(db: Database) {
  let described = 0;
  for (const [name, tplName] of Object.entries(SEED_CRITERIA_TEMPLATE)) {
    const tpl = CRITERIA_TEMPLATE_ROBOTICS.find((t) => t.name === tplName);
    if (!tpl) continue;
    const rows = await db.update(competencyCriteria)
      .set({ groupName: tpl.groupName, levelDescriptors: [...tpl.levelDescriptors], description: tpl.description })
      .where(and(eq(competencyCriteria.name, name), sql`${competencyCriteria.levelDescriptors} is null`))
      .returning({ id: competencyCriteria.id });
    described += rows.length;
  }
  const pairs = sql.join(SEED_FOCUS.map(([l, c]) => sql`(${l}::text, ${c}::text)`), sql`, `);
  const focus = await db.execute(sql`
    insert into ${lessonFocusCriteria} (lesson_id, criterion_id)
    select l.id, cc.id
      from ${lessons} l
      join curricula cu on cu.id = l.curriculum_id
      join ${competencyCriteria} cc on cc.course_id = cu.course_id and cc.is_active
     where (l.title, cc.name) in (${pairs})
    on conflict (lesson_id, criterion_id) do nothing
    returning id`);
  return { described, focus: (focus as unknown as unknown[]).length };
}

export async function seedPortfolio(db: Database, opts: { today?: string } = {}) {
  const today = opts.today ?? toISODate(new Date(Date.now() + 7 * 3600e3));
  await seedCriteriaStandard(db);
  const sess = await db
    .select({
      id: sessions.id, tenantId: sessions.tenantId, classId: sessions.classId, lessonId: sessions.lessonId, seq: sessions.sequenceNo, kind: sessions.kind,
      originalSeq: sessions.originalSequenceNo, date: sessions.date, startTime: sessions.startTime, teacherId: sessions.teacherId, topic: sessions.topic,
      completedAt: sessions.completedAt, completedBy: sessions.completedBy,
      centerId: classes.centerId, courseId: classes.courseId, classCode: classes.code, className: classes.name, leadTeacherId: classes.leadTeacherId,
      courseName: courses.name, courseCode: courses.code, totalSessions: courses.totalSessions, centerName: centers.name,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .where(eq(sessions.status, "completed"));
  if (!sess.length) return { evaluations: 0, cards: 0, token: null as string | null };
  const sessById = new Map(sess.map((s) => [s.id, s]));

  const [lessonRows, teacherRows, critRows] = await Promise.all([
    db.select({ id: lessons.id, title: lessons.title, objectives: lessons.objectives }).from(lessons),
    db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers),
    db.select({
      id: competencyCriteria.id, courseId: competencyCriteria.courseId, name: competencyCriteria.name, description: competencyCriteria.description, sortOrder: competencyCriteria.sortOrder,
      groupName: competencyCriteria.groupName, levelDescriptors: competencyCriteria.levelDescriptors,
    })
      .from(competencyCriteria).where(eq(competencyCriteria.isActive, true)),
  ]);
  const focusRows = await db.select({ lessonId: lessonFocusCriteria.lessonId, criterionId: lessonFocusCriteria.criterionId }).from(lessonFocusCriteria);
  const focusByLesson = new Map<string, string[]>();
  for (const f of focusRows) focusByLesson.set(f.lessonId, [...(focusByLesson.get(f.lessonId) ?? []), f.criterionId]);
  const lessonById = new Map(lessonRows.map((l) => [l.id, l]));
  const teacherById = new Map(teacherRows.map((t) => [t.id, t.fullName]));
  const critByCourse = new Map<string, CriterionSource[]>();
  for (const c of [...critRows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = critByCourse.get(c.courseId) ?? [];
    list.push({ id: c.id, name: c.name, description: c.description, group: c.groupName, levelDescriptors: c.levelDescriptors });
    critByCourse.set(c.courseId, list);
  }

  // Điểm danh của các buổi đã hoàn tất (mọi trạng thái — để tính chuyên cần), kèm học viên
  const att: { sessionId: string; enrollmentId: string; status: AttendanceStatus; remark: string | null; studentId: string; fullName: string; code: string | null }[] = [];
  await inChunks(sess.map((s) => s.id), async (ids) => {
    const rows = await db
      .select({ sessionId: attendance.sessionId, enrollmentId: attendance.enrollmentId, status: attendance.status, remark: attendance.studentRemark, studentId: students.id, fullName: students.fullName, code: students.code })
      .from(attendance)
      .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(inArray(attendance.sessionId, ids));
    att.push(...rows);
  }, 500);

  // Thứ tự buổi của từng ghi danh → điểm tăng dần theo thời gian
  const orderByEnr = new Map<string, string[]>();
  for (const a of att) {
    if (a.status !== "present" && a.status !== "late" && a.status !== "makeup") continue;
    const list = orderByEnr.get(a.enrollmentId) ?? [];
    list.push(a.sessionId);
    orderByEnr.set(a.enrollmentId, list);
  }
  for (const [k, list] of orderByEnr) {
    list.sort((x, y) => {
      const a = sessById.get(x)!, b = sessById.get(y)!;
      return a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1;
    });
    orderByEnr.set(k, list);
  }

  const evIns: (typeof sessionEvaluations.$inferInsert)[] = [];
  const evalsByEnr = new Map<string, (EvalForAggregate & { sessionId: string })[]>();
  for (const a of att) {
    if (a.status !== "present" && a.status !== "late" && a.status !== "makeup") continue;
    const s = sessById.get(a.sessionId);
    if (!s) continue;
    const r = rng(hash(`${a.enrollmentId}|${a.sessionId}`));
    const base = 1.9 + (hash(a.enrollmentId) % 100) / 100; // năng lực nền 1,9–2,9
    const idx = (orderByEnr.get(a.enrollmentId) ?? []).indexOf(a.sessionId);
    const growth = Math.min(1.1, Math.max(0, idx) * 0.07); // tiến bộ dần theo số buổi
    const lesson = s.lessonId ? lessonById.get(s.lessonId) : undefined;
    const criteria = orderCriteriaWithFocus(critByCourse.get(s.courseId) ?? [], s.lessonId ? focusByLesson.get(s.lessonId) ?? [] : []);
    const snapshotBase = buildSessionSnapshot({
      criteria,
      context: {
        date: s.date, startTime: s.startTime, sequenceNo: s.seq, label: sessionLabel(s.seq, s.kind, s.originalSeq),
        makeup: s.kind === "makeup" || a.status === "makeup",
        lessonTitle: lesson?.title ?? s.topic ?? null,
        lessonObjectives: lesson?.objectives ?? (lesson?.title ? `Hiểu và thực hành được nội dung bài "${lesson.title}"` : null),
        teacherName: teacherById.get(s.teacherId ?? s.leadTeacherId ?? "") ?? null,
        className: s.className, classCode: s.classCode, courseName: s.courseName, courseCode: s.courseCode, centerName: s.centerName,
        studentName: a.fullName, studentCode: a.code,
      },
      now: s.completedAt ?? new Date(`${s.date}T21:00:00+07:00`),
    });
    const scores: Record<string, number> = {};
    for (const c of snapshotBase.criteria) {
      const offset = ((hash(`${a.enrollmentId}|${c.key}`) % 100) / 100 - 0.5) * 0.8; // thế mạnh / điểm yếu riêng từng tiêu chí
      const noise = (r() - 0.5) * 0.9;
      scores[c.key] = Math.min(4, Math.max(1, Math.round(base + growth + offset + noise)));
    }
    const snapshot = { ...snapshotBase, criteria: snapshotBase.criteria.map((c) => ({ ...c, value: scores[c.key] ?? null })) };
    const vals = Object.values(scores);
    const avg = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 2.5;
    const objectiveResult: ObjectiveResult = avg >= 2.9 || r() < 0.15 ? "achieved" : avg >= 2.1 ? "partial" : "not_yet";
    const highlights = DEFAULT_HIGHLIGHTS.filter(() => r() < 0.16).slice(0, 2);
    const remark = a.remark ?? REMARK[Math.floor(r() * REMARK.length)]!;
    const productNote = r() < 0.7 ? PRODUCT[Math.floor(r() * PRODUCT.length)]! : null;
    // Phần lớn phát hành tối ngày học (đúng hạn 24 giờ); ~10% trễ 2 ngày để màn quản lý có số liệu trễ hạn
    const onTimeAt = new Date(`${s.date}T21:00:00+07:00`);
    const publishedAt = hash(`${a.enrollmentId}|${s.id}|tre-han`) % 10 === 0 ? new Date(onTimeAt.getTime() + 2 * 86400e3) : onTimeAt;
    evIns.push({
      tenantId: s.tenantId, centerId: s.centerId, sessionId: s.id, enrollmentId: a.enrollmentId, studentId: a.studentId, classId: s.classId,
      courseId: s.courseId, lessonId: s.lessonId, teacherId: s.teacherId ?? s.leadTeacherId, status: "published", revision: 1, snapshot,
      objectiveResult, highlights, productNote, remark, mediaIds: [], publishedAt, publishedBy: s.completedBy, createdBy: s.completedBy, updatedBy: s.completedBy,
      createdAt: publishedAt, updatedAt: publishedAt,
    });
    const list = evalsByEnr.get(a.enrollmentId) ?? [];
    list.push({ sessionId: s.id, date: s.date, sequenceNo: s.seq, scores: snapshotScores(snapshot), objectiveResult, highlights, remark, productNote });
    evalsByEnr.set(a.enrollmentId, list);
  }
  await inChunks(evIns, (p) => db.insert(sessionEvaluations).values(p).onConflictDoNothing({ target: [sessionEvaluations.sessionId, sessionEvaluations.enrollmentId] }));
  // Nhận xét cho phụ huynh = nhận xét của buổi (đồng bộ hai chiều)
  await db.execute(sql`update attendance a set student_remark = se.remark from session_evaluations se where se.session_id = a.session_id and se.enrollment_id = a.enrollment_id and a.student_remark is null`);

  /* ---------------- Học bạ mốc tổng hợp từ phiếu buổi ---------------- */
  const cards = await db
    .select({ id: reportCards.id, enrollmentId: reportCards.enrollmentId, seq: reportCards.milestoneSeq, status: reportCards.status, classId: enrollments.classId, courseId: classes.courseId, totalSessions: courses.totalSessions })
    .from(reportCards)
    .innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId));
  const seqsByClass = new Map<string, number[]>();
  for (const c of cards) seqsByClass.set(c.classId, [...(seqsByClass.get(c.classId) ?? []), c.seq]);
  const attByEnr = new Map<string, { seq: number; status: AttendanceStatus }[]>();
  for (const a of att) {
    const s = sessById.get(a.sessionId);
    if (!s) continue;
    attByEnr.set(a.enrollmentId, [...(attByEnr.get(a.enrollmentId) ?? []), { seq: s.seq, status: a.status }]);
  }
  let cardCount = 0;
  const scoreIns: (typeof reportCardScores.$inferInsert)[] = [];
  const touched: string[] = [];
  for (const c of cards) {
    if (c.status === "draft") continue;
    const crit = critByCourse.get(c.courseId) ?? [];
    const evs = evalsByEnr.get(c.enrollmentId) ?? [];
    if (!crit.length || !evs.length) continue;
    const milestones = [...new Set([...reportCardMilestones(c.totalSessions), ...(seqsByClass.get(c.classId) ?? [])])];
    const period = milestonePeriod(milestones, c.seq);
    const current = evs.filter((e) => e.sequenceNo >= period.fromSeq && e.sequenceNo <= period.toSeq);
    if (!current.length) continue;
    const previous = period.previous ? evs.filter((e) => e.sequenceNo >= period.previous!.fromSeq && e.sequenceNo <= period.previous!.toSeq) : [];
    const t = tallyAttendance((attByEnr.get(c.enrollmentId) ?? []).filter((x) => x.seq >= period.fromSeq && x.seq <= period.toSeq).map((x) => x.status));
    const agg = aggregateMilestone({
      criteria: crit.map((k) => ({ key: k.id ?? k.name, criterionId: k.id, label: k.name })),
      current, previous,
      attendance: { attended: t.present + t.late + t.makeup, total: t.total, absent: t.absent, excused: t.excused, makeup: t.makeup },
      period: { fromSeq: period.fromSeq, toSeq: period.toSeq },
    });
    const suggested = agg.criteria.filter((k) => k.suggested != null && k.criterionId);
    if (!suggested.length) continue;
    const avg = Math.round((suggested.reduce((x, k) => x + (k.suggested ?? 0), 0) / suggested.length) * 10) / 10;
    await db.update(reportCards).set({ rubricScale: 4, aggregate: agg, averageScore: avg.toFixed(1) }).where(eq(reportCards.id, c.id));
    touched.push(c.id);
    for (const k of suggested) scoreIns.push({ reportCardId: c.id, criterionId: k.criterionId!, score: k.suggested, comment: null });
    cardCount += 1;
  }
  if (touched.length) {
    await inChunks(touched, (ids) => db.delete(reportCardScores).where(inArray(reportCardScores.reportCardId, ids)));
    await inChunks(scoreIns, (p) => db.insert(reportCardScores).values(p));
  }

  /* ---------------- Học viên mẫu + ảnh minh chứng + link chia sẻ cố định ---------------- */
  // Ưu tiên "Học viên mẫu 2" (phụ huynh đồng ý đăng ảnh); không có thì học viên nhiều phiếu nhất
  const counts = new Map<string, number>();
  for (const e of evIns) counts.set(e.studentId, (counts.get(e.studentId) ?? 0) + 1);
  const [named] = await db.select({ id: students.id }).from(students).where(eq(students.fullName, "Học viên mẫu 2")).limit(1);
  const demoStudentId = named && counts.get(named.id) ? named.id : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let token: string | null = null;
  if (demoStudentId) {
    const [st] = await db.select({ id: students.id, tenantId: students.tenantId, homeCenterId: students.homeCenterId }).from(students).where(eq(students.id, demoStudentId)).limit(1);
    // Ảnh minh chứng (bật đồng ý + ảnh cả lớp + ảnh của bé) do seedDemoPortfolioMedia() lo bên dưới.
    const [admin] = await db.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(eq(userRoles.role, "SUPER_ADMIN")).limit(1);
    if (st) {
      await db.insert(portfolioShares).values({
        tenantId: st.tenantId, centerId: st.homeCenterId, studentId: st.id, token: DEMO_PORTFOLIO_TOKEN, scope: "all",
        label: "Link xem thử (dữ liệu mẫu)", expiresAt: new Date(Date.now() + 365 * 86_400_000), viewCount: 2,
        firstViewedAt: new Date(Date.now() - 2 * 86_400_000), lastViewedAt: new Date(Date.now() - 3 * 3600e3), createdBy: admin?.id ?? null,
      }).onConflictDoNothing({ target: portfolioShares.token });
      token = DEMO_PORTFOLIO_TOKEN;
    }
  }

  // Mốc bật tính năng: 14 ngày trước để nhóm "Buổi chưa có phiếu nhận xét học viên" có việc mẫu
  const since = addDays(today, -14);
  await db.insert(appSettings).values({ key: "ho_so_hoc_tap", value: { since } })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: { since }, updatedAt: new Date() } });

  const media = await seedDemoPortfolioMedia(db);

  return { evaluations: evIns.length, cards: cardCount, token, studentId: demoStudentId, media };
}

/* ------------------------------------------------------------------ */
/* Ảnh minh chứng mẫu — GALLERY từng buổi cho gia đình mẫu             */
/*                                                                     */
/* Idempotent + ĐỘC LẬP (tự truy vấn CSDL) → chạy lại được mà không    */
/* cần reset: `pnpm db:seed-media`. Mỗi buổi có phiếu của con sẽ có     */
/* 1 ảnh CHUNG CẢ LỚP + 1–2 ảnh CỦA BÉ (đã duyệt, phụ huynh đồng ý),   */
/* để hồ sơ năng lực thể hiện được cả con lẫn không khí lớp học.       */
/* ------------------------------------------------------------------ */
export async function seedDemoPortfolioMedia(db: Database) {
  const d = db;
  // Gia đình mẫu: ưu tiên "Phụ huynh mẫu 1" (có nhiều con để xem chip chuyển nhanh)
  const [parent] = await d.select({ id: parents.id }).from(parents).where(eq(parents.fullName, "Phụ huynh mẫu 1")).limit(1);
  const [admin] = await d.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(eq(userRoles.role, "SUPER_ADMIN")).limit(1);

  // Con của gia đình mẫu; không có gia đình mẫu thì lấy học viên mẫu có phiếu
  let kidIds: string[] = [];
  if (parent) {
    // Bật đồng ý đăng ảnh cho phụ huynh mẫu (điều kiện để ảnh hiển thị)
    await d.update(parents).set({ mediaConsent: true, mediaConsentAt: new Date() }).where(eq(parents.id, parent.id));
    const gs = await d.select({ studentId: studentGuardians.studentId }).from(studentGuardians).where(eq(studentGuardians.parentId, parent.id));
    kidIds = gs.map((g) => g.studentId);
  } else {
    const named = await d.select({ id: students.id }).from(students).where(inArray(students.fullName, ["Học viên mẫu 2", "Học viên mẫu 1"]));
    kidIds = named.map((s) => s.id);
  }
  if (!kidIds.length) return { students: 0, photos: 0 };

  // Buổi đã có phiếu phát hành của từng con (kèm dữ liệu để dựng ảnh)
  const evs = await d
    .select({ studentId: sessionEvaluations.studentId, sessionId: sessions.id, date: sessions.date, seq: sessions.sequenceNo, tenantId: sessions.tenantId, teacherBy: sessions.completedBy })
    .from(sessionEvaluations)
    .innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
    .where(and(inArray(sessionEvaluations.studentId, kidIds), eq(sessionEvaluations.status, "published")))
    .orderBy(sessions.date);
  if (!evs.length) return { students: 0, photos: 0 };

  const targetSessionIds = [...new Set(evs.map((e) => e.sessionId))];
  // Idempotent: xoá ảnh mẫu cũ của các buổi này rồi dựng lại; trả media_ids về auto (rỗng)
  await inChunks(targetSessionIds, (ids) => d.delete(sessionMedia).where(and(inArray(sessionMedia.sessionId, ids), sql`${sessionMedia.objectKey} like 'seed/%'`)));
  await inChunks(targetSessionIds, (ids) => d.update(sessionEvaluations).set({ mediaIds: [] }).where(and(inArray(sessionEvaluations.sessionId, ids), inArray(sessionEvaluations.studentId, kidIds), eq(sessionEvaluations.status, "published"))));

  const BE_CAPTIONS = ["Bé giới thiệu mô hình của mình", "Bé lắp ráp cùng nhóm", "Bé thuyết trình sản phẩm", "Robot của bé chạy thử trên sa bàn", "Bé thử nghiệm và chỉnh sửa"];
  const LOP_CAPTIONS = ["Cả lớp trong giờ thực hành", "Không khí buổi học nhóm", "Trưng bày sản phẩm cuối buổi"];
  const rows: (typeof sessionMedia.$inferInsert)[] = [];
  const classWideDone = new Set<string>();

  // Sắp theo con → buổi mới nhất trước để 3 buổi gần nhất có thêm ảnh
  for (const kid of kidIds) {
    const mine = evs.filter((e) => e.studentId === kid).sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const [i, e] of mine.entries()) {
      const reviewedAt = new Date(new Date(`${e.date}T12:00:00`).getTime() + 3600e3);
      const base = { tenantId: e.tenantId, sessionId: e.sessionId, status: "approved" as const, takenAt: e.date, uploadedBy: e.teacherBy, submittedBy: e.teacherBy, reviewedBy: admin?.id ?? null, reviewedAt };
      // 1 ảnh CHUNG CẢ LỚP mỗi buổi (dùng chung, chỉ dựng một lần cho mỗi buổi)
      if (!classWideDone.has(e.sessionId)) {
        classWideDone.add(e.sessionId);
        rows.push({ ...base, objectKey: `seed/lop-${e.sessionId}.svg`, caption: LOP_CAPTIONS[e.seq % LOP_CAPTIONS.length]!, isClassWide: true, taggedStudentIds: [] });
      }
      // 1–2 ảnh CỦA BÉ; 3 buổi gần nhất thêm ảnh thứ hai để gallery phong phú
      const nBe = i < 3 ? 2 : 1;
      for (let k = 0; k < nBe; k++) {
        rows.push({ ...base, objectKey: `seed/be-${kid}-${e.sessionId}-${k + 1}.svg`, caption: BE_CAPTIONS[(e.seq + k) % BE_CAPTIONS.length]!, isClassWide: false, taggedStudentIds: [kid] });
      }
    }
  }
  await inChunks(rows, (part) => d.insert(sessionMedia).values(part));
  return { students: kidIds.length, photos: rows.length };
}
