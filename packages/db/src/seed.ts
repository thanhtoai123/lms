/**
 * Seed dữ liệu mẫu (KHÔNG dùng dữ liệu thật): 2 cơ sở, 3 khoá, giáo trình 12 bài,
 * 3 GV, 2 lớp có lịch, 16 học viên, buổi học sinh từ lịch, vài buổi đã điểm danh.
 * Chạy: pnpm db:seed
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "./index";
import {
  centers, rooms, users, userRoles, teachers, parents, students, studentGuardians,
  courses, curricula, lessons, classes, classSchedules, sessions, enrollments, attendance,
} from "./schema/index";
import { generateSessions, buildClassCode, buildStudentCode, toISODate, addDays } from "@satarobo/core";

const db = createDb();

async function main() {
  console.log("Seeding…");

  const [cs1, cs2] = await db
    .insert(centers)
    .values([
      { code: "CS1", name: "Cơ sở 1 — Nguyễn Hữu Thọ", address: "211 Nguyễn Hữu Thọ, Đà Nẵng" },
      { code: "CS2", name: "Cơ sở 2 — Hoàng Diệu", address: "114 Hoàng Diệu, Hải Châu, Đà Nẵng" },
    ])
    .returning();

  const roomRows = await db
    .insert(rooms)
    .values([
      { centerId: cs1!.id, code: "101", name: "Phòng 101", capacity: 12 },
      { centerId: cs1!.id, code: "LAB1", name: "Lab 1", capacity: 10 },
      { centerId: cs2!.id, code: "P302", name: "Phòng 302", capacity: 12 },
    ])
    .returning();

  // ---- Users & roles ----
  const [adminU, mgrU, t1U, t2U, t3U] = await db
    .insert(users)
    .values([
      { email: "superadmin@example.test", fullName: "Quản trị hệ thống" },
      { email: "manager.cs1@example.test", fullName: "Quản lý CS1" },
      { email: "teacher1@satarobo.vn", fullName: "GV Minh (mẫu)" },
      { email: "teacher2@satarobo.vn", fullName: "GV Lan (mẫu)" },
      { email: "teacher3@satarobo.vn", fullName: "GV Hùng (mẫu)" },
    ])
    .returning();

  await db.insert(userRoles).values([
    { userId: adminU!.id, role: "SUPER_ADMIN", centerId: null },
    { userId: mgrU!.id, role: "CENTER_MANAGER", centerId: cs1!.id },
    { userId: t1U!.id, role: "TEACHER", centerId: cs1!.id },
    { userId: t2U!.id, role: "TEACHER", centerId: cs2!.id },
    { userId: t3U!.id, role: "TEACHER", centerId: cs1!.id },
  ]);

  const [gv1, gv2, gv3] = await db
    .insert(teachers)
    .values([
      { userId: t1U!.id, centerId: cs1!.id, code: "GV001", fullName: "GV Minh (mẫu)", email: t1U!.email, contractType: "full_time" },
      { userId: t2U!.id, centerId: cs2!.id, code: "GV002", fullName: "GV Lan (mẫu)", email: t2U!.email },
      { userId: t3U!.id, centerId: cs1!.id, code: "GV003", fullName: "GV Hùng (mẫu)", email: t3U!.email },
    ])
    .returning();

  // ---- Courses & curriculum ----
  const [sata4, sata6] = await db
    .insert(courses)
    .values([
      { code: "SATA4", name: "Sata4 — Bứt Phá Giới Hạn", slug: "sata4", gradeFrom: 3, gradeTo: 4, totalSessions: 48, listPrice: "9600000" },
      { code: "SATA6", name: "Sata6 — Chinh Phục AI", slug: "sata6", gradeFrom: 5, gradeTo: 6, totalSessions: 48, listPrice: "10800000" },
      { code: "SATA1", name: "Sata1 — Luyện thi RoboSim", slug: "sata1", gradeFrom: 3, gradeTo: 8, totalSessions: 12, listPrice: "3600000" },
    ])
    .returning();

  const [cur4] = await db.insert(curricula).values({ courseId: sata4!.id, name: "Sata4 v1 (2026)" }).returning();
  const lessonTitles = [
    "Làm quen bộ kit & an toàn lab", "Cảm biến siêu âm & đo khoảng cách", "Động cơ DC & điều khiển bánh xe",
    "Dò đường bằng cảm biến hồng ngoại", "Vòng lặp & rẽ nhánh", "Robot tránh vật cản", "Lắp ráp khung gầm nâng cao",
    "Cánh tay robot & servo", "Lập trình theo kịch bản", "Dự án nhóm: robot phân loại", "Gỡ lỗi & tối ưu", "Thử thách sa hình & thuyết trình",
  ];
  const lessonRows = await db
    .insert(lessons)
    .values(lessonTitles.map((title, i) => ({ curriculumId: cur4!.id, sequenceNo: i + 1, title, isReportCardMilestone: i + 1 === 5 || i + 1 === 12 })))
    .returning();

  // ---- Classes with schedules ----
  const today = toISODate(new Date());
  const startA = addDays(today, -28); // đã học ~4 tuần
  const startB = addDays(today, 3);

  const [classA, classB] = await db
    .insert(classes)
    .values([
      {
        code: buildClassCode("CS1", "SATA4", 2026, 1), name: "Sata4 sáng CN CS1", courseId: sata4!.id, curriculumId: cur4!.id,
        centerId: cs1!.id, homeRoomId: roomRows[0]!.id, leadTeacherId: gv1!.id, capacity: 12, startDate: startA, status: "running",
      },
      {
        code: buildClassCode("CS2", "SATA6", 2026, 3), name: "Sata6 chiều T7 CS2", courseId: sata6!.id,
        centerId: cs2!.id, homeRoomId: roomRows[2]!.id, leadTeacherId: gv2!.id, capacity: 12, startDate: startB, status: "recruiting",
      },
    ])
    .returning();

  const rulesA = [
    { classId: classA!.id, weekday: 7, startTime: "09:45", endTime: "11:15", roomId: roomRows[0]!.id, teacherId: gv1!.id, effectiveFrom: startA, effectiveTo: null },
    { classId: classA!.id, weekday: 3, startTime: "18:00", endTime: "19:30", roomId: roomRows[1]!.id, teacherId: gv1!.id, effectiveFrom: startA, effectiveTo: null },
  ];
  const rulesB = [
    { classId: classB!.id, weekday: 6, startTime: "15:45", endTime: "17:15", roomId: roomRows[2]!.id, teacherId: gv2!.id, effectiveFrom: startB, effectiveTo: null },
  ];
  await db.insert(classSchedules).values([...rulesA, ...rulesB]);

  const toCore = (r: (typeof rulesA)[number]) => ({ ...r, weekday: r.weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7 });
  const plannedA = generateSessions({ classId: classA!.id, startDate: startA, totalSessions: 12, rules: rulesA.map(toCore), lessonIds: lessonRows.map((l) => l.id) });
  const plannedB = generateSessions({ classId: classB!.id, startDate: startB, totalSessions: 12, rules: rulesB.map(toCore) });

  const sessionRows = await db
    .insert(sessions)
    .values(
      [...plannedA, ...plannedB].map((p) => ({
        classId: p.classId, lessonId: p.lessonId, sequenceNo: p.sequenceNo, date: p.date, startTime: p.startTime, endTime: p.endTime,
        roomId: p.roomId, teacherId: p.teacherId, topic: lessonRows.find((l) => l.id === p.lessonId)?.title ?? null,
      })),
    )
    .returning();

  // ---- Parents, students, enrollments ----
  const parentRows = await db
    .insert(parents)
    .values(Array.from({ length: 16 }, (_, i) => ({ fullName: `Phụ huynh mẫu ${i + 1}`, phone: `09000000${String(i + 1).padStart(2, "0")}`, mediaConsent: i % 4 !== 0 })))
    .returning();
  const studentRows = await db
    .insert(students)
    .values(
      Array.from({ length: 16 }, (_, i) => ({
        code: buildStudentCode(i < 10 ? "CS1" : "CS2", 2026, i + 1), fullName: `Học viên mẫu ${i + 1}`, grade: 3 + (i % 4),
        homeCenterId: i < 10 ? cs1!.id : cs2!.id, status: "active" as const,
      })),
    )
    .returning();
  await db.insert(studentGuardians).values(studentRows.map((s, i) => ({ studentId: s.id, parentId: parentRows[i]!.id, isPrimary: true })));

  const enrollA = await db
    .insert(enrollments)
    .values(studentRows.slice(0, 10).map((s) => ({ studentId: s.id, classId: classA!.id, packageSessions: 48, createdBy: mgrU!.id })))
    .returning();
  await db.insert(enrollments).values(studentRows.slice(10).map((s) => ({ studentId: s.id, classId: classB!.id, packageSessions: 48, status: "trial" as const })));

  // ---- Điểm danh cho các buổi đã qua của lớp A (để lại 1 buổi quá hạn chưa chốt) ----
  const pastA = sessionRows.filter((s) => s.classId === classA!.id && s.date < today).sort((a, b) => a.sequenceNo - b.sequenceNo);
  const toComplete = pastA.slice(0, Math.max(0, pastA.length - 1));
  for (const s of toComplete) {
    await db.insert(attendance).values(
      enrollA.map((e, i) => ({
        sessionId: s.id, enrollmentId: e.id,
        status: (i === 2 && s.sequenceNo >= 3 ? "absent_unexcused" : i === 5 && s.sequenceNo % 2 === 0 ? "absent_excused" : "present") as "present" | "absent_unexcused" | "absent_excused",
        recordedBy: t1U!.id,
      })),
    );
    await db.update(sessions).set({ status: "completed", sessionNote: "Lớp học tốt, các con hoàn thành mục tiêu buổi.", completedAt: new Date(), completedBy: t1U!.id }).where(eq(sessions.id, s.id));
  }

  console.log(`✔ Seeded: 2 centers, 3 rooms, 5 users, 3 teachers, ${lessonRows.length} lessons, 2 classes, ${sessionRows.length} sessions, 16 students`);
  console.log("  Dev login: DEV_ACTOR_EMAIL=teacher1@satarobo.vn (GV lớp A) | manager.cs1@example.test | superadmin@example.test");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
