/**
 * DỮ LIỆU MẪU — PHÍA NGƯỜI DÙNG (docs/PHIA-NGUOI-DUNG.md). Chạy ở CUỐI `seed.ts`, chỉ dùng dữ liệu giả đã có.
 *
 *  - "Phụ huynh mẫu 1" có BA con để thấy chip chuyển nhanh: Học viên mẫu 1 (con ruột, có xu + yêu cầu nghỉ),
 *    Học viên mẫu 2 (phiếu nhận xét + ảnh đã duyệt), Học viên mẫu 11 (giấy chứng nhận lộ trình + khoá đã hoàn thành).
 *  - Một yêu cầu xin nghỉ gửi qua app (còn "Mới" → huỷ được) cho buổi thứ hai sắp tới của Học viên mẫu 2.
 *  - Phản hồi sau buổi của phụ huynh (👍 / 🙂 / 😟) cho buổi gần nhất lớp Sata4 của GV mẫu (teacher1) — "Cần trao đổi"
 *    kèm việc chăm sóc PARENT_CONCERN như luồng thật.
 *  - Mục tiêu + học cụ cho các bài Sata4 chưa có, một tài liệu chung của khoá và một tài liệu cho bài của buổi sắp tới
 *    (màn "Chuẩn bị buổi dạy").
 * Chạy lại không nhân đôi (kiểm tra tồn tại trước khi thêm).
 */
import { and, asc, desc, eq, gte, inArray, isNull, like, sql } from "drizzle-orm";
import {
  parents, students, studentGuardians, enrollments, classes, sessions, attendance, parentFeedback, parentRequests, parentRequestEvents,
  careTasks, lessons, documents, users,
} from "./schema/index";
import { requestCode, slaDue, REACTION_RATING, reactionPlan, sessionLabel, type SessionReaction, type SessionKind } from "@satarobo/core";
import type { Database } from "./index";

export async function seedPhiaNguoiDung(db: Database, opts: { today: string }) {
  const today = opts.today;
  const out = { parentPhone: null as string | null, children: 0, reactions: 0, requests: 0, documents: 0 };

  const [parent] = await db.select({ id: parents.id, phone: parents.phone }).from(parents).where(eq(parents.fullName, "Phụ huynh mẫu 1")).limit(1);
  if (!parent) return out;
  out.parentPhone = parent.phone;
  const kids = await db.select({ id: students.id, fullName: students.fullName }).from(students)
    .where(inArray(students.fullName, ["Học viên mẫu 1", "Học viên mẫu 2", "Học viên mẫu 11"]));
  const kid = (n: string) => kids.find((k) => k.fullName === n) ?? null;

  // ---- Ba con cho một phụ huynh (chip chuyển nhanh) ----
  for (const k of [kid("Học viên mẫu 2"), kid("Học viên mẫu 11")]) {
    if (!k) continue;
    const [has] = await db.select({ s: studentGuardians.studentId }).from(studentGuardians).where(and(eq(studentGuardians.studentId, k.id), eq(studentGuardians.parentId, parent.id))).limit(1);
    if (!has) await db.insert(studentGuardians).values({ studentId: k.id, parentId: parent.id, relation: "parent", isPrimary: false });
  }
  out.children = (await db.select({ n: sql<number>`count(*)::int` }).from(studentGuardians).where(eq(studentGuardians.parentId, parent.id)))[0]?.n ?? 0;

  // ---- Lớp Sata4 của GV mẫu (lớp của Học viên mẫu 1) ----
  const k1 = kid("Học viên mẫu 1");
  const [enr1] = k1 ? await db.select({ classId: enrollments.classId }).from(enrollments).where(eq(enrollments.studentId, k1.id)).orderBy(asc(enrollments.enrolledAt)).limit(1) : [];
  if (!enr1) return out;
  const [cls] = await db.select({ id: classes.id, centerId: classes.centerId, courseId: classes.courseId, curriculumId: classes.curriculumId, leadTeacherId: classes.leadTeacherId }).from(classes).where(eq(classes.id, enr1.classId)).limit(1);
  if (!cls) return out;

  // ---- Yêu cầu xin nghỉ gửi qua app: buổi thứ hai sắp tới của Học viên mẫu 2 ----
  const k2 = kid("Học viên mẫu 2");
  const [enr2] = k2 ? await db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.studentId, k2.id), eq(enrollments.classId, cls.id))).limit(1) : [];
  const upcoming = await db.select({ id: sessions.id, date: sessions.date, seq: sessions.sequenceNo, kind: sessions.kind }).from(sessions)
    .where(and(eq(sessions.classId, cls.id), gte(sessions.date, today), eq(sessions.status, "scheduled"))).orderBy(asc(sessions.date), asc(sessions.startTime)).limit(2);
  const target = upcoming[1];
  if (k2 && enr2 && target) {
    const [dup] = await db.select({ id: parentRequests.id }).from(parentRequests).where(and(eq(parentRequests.enrollmentId, enr2.id), eq(parentRequests.sessionId, target.id))).limit(1);
    if (!dup) {
      const yr = Number(today.slice(0, 4));
      const prefix = requestCode(yr, 0).slice(0, 5);
      const [m] = await db.select({ n: sql<number>`coalesce(max(substring(${parentRequests.code} from 6)::int), 0)::int` }).from(parentRequests).where(like(parentRequests.code, `${prefix}%`));
      const created = new Date(Date.now() - 2 * 3600e3);
      const content = `Phụ huynh xin cho con nghỉ ${sessionLabel(target.seq, target.kind as SessionKind)} ngày ${target.date.slice(8, 10)}/${target.date.slice(5, 7)}: Việc gia đình. Cần xếp học bù. (mẫu)`;
      const [r] = await db.insert(parentRequests).values({
        code: requestCode(yr, (m?.n ?? 0) + 1), type: "absence", status: "new", channel: "app", centerId: cls.centerId, studentId: k2.id, parentId: parent.id,
        enrollmentId: enr2.id, sessionId: target.id, content, dueAt: slaDue(created, "absence"), createdBy: null, createdAt: created,
      }).returning({ id: parentRequests.id });
      if (r) await db.insert(parentRequestEvents).values({ requestId: r.id, action: "create", toStatus: "new", note: content, actorId: null, createdAt: created });
      out.requests += 1;
    }
  }

  // ---- Phản hồi sau buổi của phụ huynh cho buổi gần nhất đã hoàn tất ----
  const [last] = await db.select({ id: sessions.id, date: sessions.date, seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo, teacherId: sessions.teacherId })
    .from(sessions).where(and(eq(sessions.classId, cls.id), eq(sessions.status, "completed"))).orderBy(desc(sessions.date), desc(sessions.startTime)).limit(1);
  const plan: [string, SessionReaction, string | null][] = [
    ["Học viên mẫu 4", "concern", "Con về kể bị bạn trêu khi làm nhóm, nhờ thầy cô để ý giúp (mẫu)"],
    ["Học viên mẫu 5", "happy", "Con rất thích bài hôm nay, về nhà kể mãi về robot (mẫu)"],
    ["Học viên mẫu 7", "ok", null],
  ];
  if (last) {
    const label = sessionLabel(last.seq, last.kind as SessionKind, last.originalSeq);
    for (const [name, reaction, note] of plan) {
      const [row] = await db
        .select({ studentId: students.id, enrollmentId: enrollments.id, att: attendance.status })
        .from(attendance).innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId)).innerJoin(students, eq(students.id, enrollments.studentId))
        .where(and(eq(attendance.sessionId, last.id), eq(students.fullName, name))).limit(1);
      if (!row || !["present", "late", "makeup"].includes(row.att)) continue;
      const [exists] = await db.select({ id: parentFeedback.id }).from(parentFeedback).where(and(eq(parentFeedback.sessionId, last.id), eq(parentFeedback.studentId, row.studentId))).limit(1);
      if (exists) continue;
      const [g] = await db.select({ id: parents.id }).from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
        .where(eq(studentGuardians.studentId, row.studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
      const p = reactionPlan(reaction, note, { studentName: name, sessionLabel: `${label} (${last.date.slice(8, 10)}/${last.date.slice(5, 7)})` });
      const createdAt = new Date(Date.now() - (reaction === "concern" ? 3 : reaction === "happy" ? 20 : 26) * 3600e3);
      const [f] = await db.insert(parentFeedback).values({
        centerId: cls.centerId, studentId: row.studentId, parentId: g?.id ?? null, classId: cls.id, sessionId: last.id, teacherId: last.teacherId ?? cls.leadTeacherId,
        rating: REACTION_RATING[reaction], reaction, tags: [], comment: p.comment, channel: "app", createdBy: null, createdAt,
      }).returning({ id: parentFeedback.id });
      if (f && p.care) {
        const [t] = await db.insert(careTasks).values({
          studentId: row.studentId, enrollmentId: row.enrollmentId, centerId: cls.centerId, code: p.care.code, title: p.care.title, severity: 2,
          dueAt: new Date(createdAt.getTime() + p.care.hours * 3600e3), dedupeKey: `feedback:${f.id}`, createdAt,
        }).returning({ id: careTasks.id });
        if (t) await db.update(parentFeedback).set({ careTaskId: t.id }).where(eq(parentFeedback.id, f.id));
      }
      out.reactions += 1;
    }
  }

  // ---- Màn "Chuẩn bị buổi dạy": mục tiêu + học cụ cho bài chưa có, tài liệu chung và tài liệu của bài sắp dạy ----
  if (cls.curriculumId) {
    const ls = await db.select({ id: lessons.id, title: lessons.title }).from(lessons).where(and(eq(lessons.curriculumId, cls.curriculumId), isNull(lessons.objectives)));
    for (const l of ls) {
      await db.update(lessons).set({
        objectives: `Học viên hiểu và tự thực hành được nội dung "${l.title}"; lập trình và chạy thử robot đúng yêu cầu của bài; trình bày ngắn sản phẩm của nhóm.`,
        materials: "Bộ kit Sata4 (1 bộ / 2 em), máy tính bảng có ứng dụng lập trình, pin dự phòng, sa bàn thử thách",
      }).where(eq(lessons.id, l.id));
    }
  }
  const [author] = await db.select({ id: users.id }).from(users).where(eq(users.email, "daotao@example.test")).limit(1);
  const [nextSession] = await db.select({ lessonId: sessions.lessonId }).from(sessions)
    .where(and(eq(sessions.classId, cls.id), gte(sessions.date, today), eq(sessions.status, "scheduled"))).orderBy(asc(sessions.date)).limit(1);
  const docs: (typeof documents.$inferInsert)[] = [
    { title: "Sổ tay giảng dạy Sata4 — quy trình một buổi 90 phút (GV)", kind: "link", category: "guide", audience: "teacher", status: "published", courseId: cls.courseId, lessonId: null, url: "https://docs.google.com/document/d/mau-so-tay-sata4", tags: ["sổ tay"], createdBy: author?.id ?? null, publishedAt: new Date() },
  ];
  if (nextSession?.lessonId) {
    docs.push({ title: "Slide bài giảng buổi tới (mẫu)", kind: "link", category: "slides", audience: "teacher", status: "published", courseId: cls.courseId, lessonId: nextSession.lessonId, url: "https://docs.google.com/presentation/d/mau-slide", tags: ["slide"], createdBy: author?.id ?? null, publishedAt: new Date() });
  }
  for (const doc of docs) {
    const [has] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.title, doc.title), eq(documents.courseId, cls.courseId))).limit(1);
    if (has) continue;
    await db.insert(documents).values(doc);
    out.documents += 1;
  }
  return out;
}
