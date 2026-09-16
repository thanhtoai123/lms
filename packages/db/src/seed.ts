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
  enrollmentEvents, competencyCriteria, reportCards, reportCardScores, sessionMedia,
  leads, leadChildren, leadActivities, leadTasks, leadAssignees, admissionsSettings,
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
  const [adminU, mgrU, t1U, t2U, t3U, sale1U, sale2U] = await db
    .insert(users)
    .values([
      { email: "superadmin@example.test", fullName: "Quản trị hệ thống" },
      { email: "manager.cs1@example.test", fullName: "Quản lý CS1" },
      { email: "teacher1@satarobo.vn", fullName: "GV Minh (mẫu)" },
      { email: "teacher2@satarobo.vn", fullName: "GV Lan (mẫu)" },
      { email: "teacher3@satarobo.vn", fullName: "GV Hùng (mẫu)" },
      { email: "sale1.cs1@example.test", fullName: "Tư vấn Hoa (mẫu)" },
      { email: "sale2.cs1@example.test", fullName: "Tư vấn Nam (mẫu)" },
    ])
    .returning();

  await db.insert(userRoles).values([
    { userId: adminU!.id, role: "SUPER_ADMIN", centerId: null },
    { userId: mgrU!.id, role: "CENTER_MANAGER", centerId: cs1!.id },
    { userId: t1U!.id, role: "TEACHER", centerId: cs1!.id },
    { userId: t2U!.id, role: "TEACHER", centerId: cs2!.id },
    { userId: t3U!.id, role: "TEACHER", centerId: cs1!.id },
    { userId: sale1U!.id, role: "CENTER_SALES_CSM", centerId: cs1!.id },
    { userId: sale2U!.id, role: "CENTER_SALES_CSM", centerId: cs1!.id },
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
    .values(Array.from({ length: 16 }, (_, i) => ({ fullName: `Phụ huynh mẫu ${i + 1}`, phone: `849110000${String(i + 1).padStart(2, "0")}`, mediaConsent: i % 4 !== 0, mediaConsentAt: i % 4 !== 0 ? new Date() : null,
      accountStatus: (i % 5 === 0 ? "active" : i % 5 === 1 ? "pending_activation" : "none") as "active" | "pending_activation" | "none",
      activatedAt: i % 5 === 0 ? new Date(Date.now() - 20 * 86_400_000) : null, activationRequestedAt: i % 5 <= 1 ? new Date(Date.now() - 25 * 86_400_000) : null })))
    .returning();
  const studentRows = await db
    .insert(students)
    .values(
      Array.from({ length: 16 }, (_, i) => ({
        code: buildStudentCode(i < 10 ? "CS1" : "CS2", 2026, i + 1), fullName: `Học viên mẫu ${i + 1}`, grade: 3 + (i % 4),
        homeCenterId: i < 10 ? cs1!.id : cs2!.id, status: (i < 10 ? "active" : "trial") as "active" | "trial",
        dateOfBirth: `${2019 - (i % 4)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
        gender: i % 2 === 0 ? "male" : "female", school: `Tiểu học mẫu ${(i % 3) + 1}`, healthNotes: i === 3 ? "Dị ứng đậu phộng" : null,
      })),
    )
    .returning();
  await db.insert(studentGuardians).values(studentRows.map((s, i) => ({ studentId: s.id, parentId: parentRows[i]!.id, isPrimary: true })));

  const enrollA = await db
    .insert(enrollments)
    // HV 9 mua gói ngắn để xuất hiện ở "Sắp hết khoá"
    .values(studentRows.slice(0, 10).map((s, i) => ({ studentId: s.id, classId: classA!.id, packageSessions: i === 8 ? 8 : 48, createdBy: mgrU!.id })))
    .returning();
  const enrollB = await db.insert(enrollments).values(studentRows.slice(10).map((s) => ({ studentId: s.id, classId: classB!.id, packageSessions: 48, status: "trial" as const }))).returning();
  await db.insert(enrollmentEvents).values([...enrollA, ...enrollB].map((e) => ({ enrollmentId: e.id, type: "created" as const, toStatus: e.status, meta: { packageSessions: e.packageSessions }, actorId: mgrU!.id })));

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

  // ---- Học bạ năng lực: tiêu chí, lộ trình khoá, học bạ mẫu ----
  await db.update(courses).set({ nextCourseId: sata6!.id }).where(eq(courses.id, sata4!.id));
  const critNames = ["Tư duy lập trình", "Lắp ráp & cơ khí", "Giải quyết vấn đề", "Làm việc nhóm", "Thuyết trình"];
  const crit4 = await db.insert(competencyCriteria).values(critNames.map((name, i) => ({ courseId: sata4!.id, name, sortOrder: i + 1 }))).returning();
  await db.insert(competencyCriteria).values(critNames.slice(0, 4).map((name, i) => ({ courseId: sata6!.id, name, sortOrder: i + 1 })));
  const m5 = sessionRows.find((x) => x.classId === classA!.id && x.sequenceNo === 5);
  if (m5 && m5.date <= today) {
    const [rc1] = await db.insert(reportCards).values({ enrollmentId: enrollA[0]!.id, milestoneSeq: 5, sessionId: m5.id, status: "submitted", teacherComment: "Con tiếp thu nhanh, chủ động hỏi bài và giúp bạn cùng nhóm lắp ráp mô hình.", strengths: "Tư duy logic tốt", improvements: "Cần cẩn thận hơn khi đi dây", averageScore: "4.2", authorId: t1U!.id, submittedAt: new Date() }).returning();
    await db.insert(reportCardScores).values(crit4.map((c, i) => ({ reportCardId: rc1!.id, criterionId: c.id, score: [5, 4, 4, 4, 4][i]! })));
    await db.insert(reportCards).values({ enrollmentId: enrollA[1]!.id, milestoneSeq: 5, sessionId: m5.id, status: "draft", teacherComment: "Đang viết…", authorId: t1U!.id });
  }

  // ---- Ảnh lớp mẫu (tệp giữ chỗ, chờ duyệt) ----
  const pastWithMedia = sessionRows.filter((x) => x.classId === classA!.id && x.date < today).slice(-2);
  for (const [k, ss] of pastWithMedia.entries()) {
    await db.insert(sessionMedia).values([
      { sessionId: ss.id, objectKey: `seed/lop-a-buoi-${ss.sequenceNo}-1.svg`, caption: "Các con lắp robot theo nhóm", status: "pending" as const, taggedStudentIds: [studentRows[1]!.id, studentRows[2]!.id], uploadedBy: t1U!.id, createdAt: new Date(Date.now() - (k === 0 ? 50 : 3) * 3600e3) },
      { sessionId: ss.id, objectKey: `seed/lop-a-buoi-${ss.sequenceNo}-2.svg`, caption: "Thử nghiệm mô hình", status: "pending" as const, taggedStudentIds: [studentRows[0]!.id, studentRows[3]!.id], uploadedBy: t1U!.id, createdAt: new Date(Date.now() - (k === 0 ? 50 : 3) * 3600e3) },
    ]);
  }

  // ---- Một ca bảo lưu mẫu ----
  const pauseFrom = today;
  const pauseUntil = addDays(today, 45);
  await db.update(enrollments).set({ status: "paused", pausedAt: pauseFrom, pauseUntil }).where(eq(enrollments.id, enrollA[9]!.id));
  await db.update(students).set({ status: "paused" }).where(eq(students.id, studentRows[9]!.id));
  await db.insert(enrollmentEvents).values({ enrollmentId: enrollA[9]!.id, type: "pause", fromStatus: "active", toStatus: "paused", reason: "Gia đình đi xa (dữ liệu mẫu)", meta: { pausedAt: pauseFrom, pauseUntil }, actorId: mgrU!.id });

  // ---- Tuyển sinh: cấu hình chia lead, bảng sale, lead mẫu (dữ liệu giả) ----
  await db.insert(admissionsSettings).values({ centerId: cs1!.id, distributionMode: "round_robin", dedupeDays: 30, maxTrialsPerLead: 2, staleAfterDays: 7, updatedBy: adminU!.id });
  await db.insert(leadAssignees).values([
    { userId: sale1U!.id, centerId: cs1!.id, isAvailable: true, roundsReceived: 3, lastAssignedAt: new Date(Date.now() - 3 * 3600e3) },
    { userId: sale2U!.id, centerId: cs1!.id, isAvailable: true, roundsReceived: 2, lastAssignedAt: new Date(Date.now() - 26 * 3600e3) },
    { userId: mgrU!.id, centerId: cs1!.id, isAvailable: false, note: "Chỉ nhận khi thiếu người" },
  ]);
  const h = (n: number) => new Date(Date.now() - n * 3600e3);
  const leadRows = await db
    .insert(leads)
    .values([
      { centerId: cs1!.id, status: "new", parentName: "PH Mẫu 01", phone: "0900000001", phoneNormalized: "84900000001", childName: "Bé An", childGrade: 3, source: "web-form", utmCampaign: "he-2026", assignedToId: sale1U!.id, assignedAt: h(1), lastTouchAt: h(1), consentAt: h(1) },
      { centerId: cs1!.id, status: "new", parentName: "PH Mẫu 02", phone: "0900000002", phoneNormalized: "84900000002", childName: "Bé Bình", childGrade: 5, source: "ads", utmSource: "facebook", assignedToId: null, lastTouchAt: h(0.2) },
      { centerId: cs1!.id, status: "contacted", parentName: "PH Mẫu 03", phone: "0900000003", phoneNormalized: "84900000003", childName: "Bé Chi", childGrade: 2, source: "referral", assignedToId: sale2U!.id, assignedAt: h(30), lastTouchAt: h(30) },
      { centerId: cs1!.id, status: "trial_scheduled", parentName: "PH Mẫu 04", phone: "0900000004", phoneNormalized: "84900000004", childName: "Bé Dũng", childGrade: 4, source: "walk-in", interestedCourseId: sata4!.id, assignedToId: sale1U!.id, assignedAt: h(50), lastTouchAt: h(20), nextActionAt: new Date(Date.now() + 26 * 3600e3) },
      { centerId: cs1!.id, status: "trial_in_progress", parentName: "PH Mẫu 05", phone: "0900000005", phoneNormalized: "84900000005", childName: "Bé Em", childGrade: 6, source: "web-form", interestedCourseId: sata6!.id, assignedToId: sale2U!.id, assignedAt: h(100), lastTouchAt: h(40) },
      { centerId: cs1!.id, status: "trial_done", parentName: "PH Mẫu 06", phone: "0900000006", phoneNormalized: "84900000006", childName: "Bé Giang", childGrade: 3, source: "ads", utmSource: "google", assignedToId: sale1U!.id, assignedAt: h(120), lastTouchAt: h(30) },
      { centerId: cs1!.id, status: "deciding", parentName: "PH Mẫu 07", phone: "0900000007", phoneNormalized: "84900000007", childName: "Bé Hà", childGrade: 4, source: "referral", assignedToId: sale2U!.id, assignedAt: h(200), lastTouchAt: h(100) },
      { centerId: cs1!.id, status: "nurturing", parentName: "PH Mẫu 08", phone: "0900000008", phoneNormalized: "84900000008", childName: "Bé Khoa", childGrade: 1, source: "web-form", assignedToId: sale1U!.id, assignedAt: h(400), lastTouchAt: h(300) },
      { centerId: cs1!.id, status: "enrolled", parentName: "PH Mẫu 09", phone: "0900000009", phoneNormalized: "84900000009", childName: "Bé Lâm", childGrade: 5, source: "ads", assignedToId: sale1U!.id, assignedAt: h(600), lastTouchAt: h(500), convertedAt: h(500) },
      { centerId: cs1!.id, status: "lost", parentName: "PH Mẫu 10", phone: "0900000010", phoneNormalized: "84900000010", childName: "Bé Minh", childGrade: 7, source: "web-form", assignedToId: sale2U!.id, assignedAt: h(700), lastTouchAt: h(650), lostReason: "Chọn trung tâm gần nhà" },
      { centerId: cs2!.id, status: "new", parentName: "PH Mẫu 11", phone: "0900000011", phoneNormalized: "84900000011", childName: "Bé Ngân", childGrade: 3, source: "web-form", assignedToId: null, lastTouchAt: h(5) },
    ])
    .returning();
  await db.insert(leadChildren).values(
    leadRows.flatMap((l, i) => [
      { leadId: l.id, fullName: l.childName!, grade: l.childGrade, interestedCourseId: l.interestedCourseId },
      ...(i === 6 ? [{ leadId: l.id, fullName: "Bé Hải (em)", grade: 2, interestedCourseId: sata4!.id }] : []),
    ]),
  );
  await db.insert(leadActivities).values(leadRows.flatMap((l) => [
    { leadId: l.id, type: "system" as const, content: `Tạo lead từ ${l.source}`, createdAt: l.assignedAt ?? l.lastTouchAt },
    ...(l.assignedToId ? [{ leadId: l.id, type: "assignment" as const, content: "Chia tự động (round_robin)", meta: { assignedToId: l.assignedToId, mode: "round_robin" }, createdAt: l.assignedAt ?? l.lastTouchAt }] : []),
    ...(l.status === "trial_scheduled" || l.status === "trial_in_progress" || l.status === "trial_done" ? [{ leadId: l.id, type: "trial_booked" as const, content: "Hẹn học thử", meta: { from: "contacted", to: "trial_scheduled", event: "schedule_trial" }, createdAt: l.lastTouchAt }] : []),
  ]));
  await db.insert(leadTasks).values([
    { leadId: leadRows[0]!.id, title: "Gọi tư vấn lần đầu", dueAt: new Date(Date.now() - 45 * 60e3), assigneeId: sale1U!.id, createdByRule: "NEW_LEAD_FIRST_CALL" },
    { leadId: leadRows[5]!.id, title: "Gọi chốt sau học thử", dueAt: new Date(Date.now() - 6 * 3600e3), assigneeId: sale1U!.id, createdByRule: "TRIAL_DONE_FOLLOW_UP" },
  ]);

  console.log(`✔ Seeded: 2 centers, 3 rooms, 7 users, 3 teachers, ${lessonRows.length} lessons, 2 classes, ${sessionRows.length} sessions, 16 students, ${leadRows.length} leads`);
  console.log("  Dev login (/login → tài khoản mẫu): superadmin@example.test | manager.cs1@example.test | sale1.cs1@example.test | teacher1@satarobo.vn");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
