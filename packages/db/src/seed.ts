/**
 * Seed dữ liệu mẫu (KHÔNG dùng dữ liệu thật): 2 cơ sở, 3 khoá, giáo trình 12 bài,
 * 3 GV, 2 lớp có lịch, 16 học viên, buổi học sinh từ lịch, vài buổi đã điểm danh.
 * Chạy: pnpm db:seed
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { createDb } from "./index";
import {
  centers, regions, rooms, users, userRoles, teachers, parents, students, studentGuardians,
  courses, curricula, lessons, classes, classSchedules, sessions, enrollments, attendance, classEvents,
  enrollmentEvents, competencyCriteria, reportCards, reportCardScores, sessionMedia,
  leads, leadChildren, leadActivities, leadTasks, leadAssignees, admissionsSettings, trialBookings, auditLog,
  holidays, coursePrerequisites, teacherCourses, teacherEvaluations,
  paymentMethods, orders, orderItems, orderInstallments, orderEvents, payments, refunds, financeLedger,
  commissionRules, commissions, bankTransactions,
  staff, staffPrivate, staffPositions, workShifts, shiftAssignments, attendancePunches, staffRequests,
  parentRequests, parentRequestEvents, parentFeedback, surveys, surveyInvites, surveyResponses, parentNotifications, careTasks,
  emailLogs, otpRequests, userGroups, userGroupMembers, webhookEvents, appSettings, revenueTargets,
  inventoryItems, kitComponents, stockLevels, stockMovements, stockCounters, rentals, rewardItems, coinTransactions, redemptions,
  documents, assignmentTemplates, assignments, submissions, lessonProposals,
  posts, siteBlocks, campaigns, campaignSpends, trackEvents, consentRecords, dataRequests, dataRequestEvents,
  jobPostings, candidates, candidateEvents, conversations, messages, affiliates,
} from "./schema/index";
import { generateSessions, buildClassCode, buildStudentCode, toISODate, addDays, orderCode, receiptNumber, packagePrice, buildInstallmentPlan, computeCommission, describeRule, periodOf, fmtMin, hhmm, weekdayOf, leaveDays, requestCode, slaDue, SETTINGS_DEFAULTS, CONSENT_TEXT_VERSION, dsrCode, dsrDue } from "@satarobo/core";

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
      { userId: t1U!.id, centerId: cs1!.id, code: "GV001", fullName: "GV Minh (mẫu)", email: t1U!.email, contractType: "full_time", grade: "senior", title: "Giáo viên chính", maxLoadPerWeek: 16 },
      { userId: t2U!.id, centerId: cs2!.id, code: "GV002", fullName: "GV Lan (mẫu)", email: t2U!.email, grade: "junior", title: "Giáo viên" },
      { userId: t3U!.id, centerId: cs1!.id, code: "GV003", fullName: "GV Hùng (mẫu)", email: t3U!.email, grade: "advanced", title: "Giáo viên", maxLoadPerWeek: 10 },
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
    await db.update(sessions).set({ status: "completed", sessionNote: "Lớp học tốt, các con hoàn thành mục tiêu buổi.", completedAt: new Date(), completedBy: t1U!.id, checklist: { pre: { kit: true, lesson: true }, post: { cleanup: true, handover: true } } }).where(eq(sessions.id, s.id));
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

  // ---- Lớp chờ duyệt mẫu (chưa sinh buổi) + sĩ số tối thiểu ----
  await db.update(classes).set({ minCapacity: 4, plannedSessions: 12 }).where(eq(classes.id, classA!.id));
  await db.update(classes).set({ minCapacity: 4, plannedSessions: 12 }).where(eq(classes.id, classB!.id));
  const sata1 = (await db.select().from(courses).where(eq(courses.code, "SATA1")))[0]!;
  const [classC] = await db.insert(classes).values({
    code: buildClassCode("CS1", "SATA1", 2026, 1), name: "Sata1 luyện thi T7 CS1", courseId: sata1.id, centerId: cs1!.id, homeRoomId: roomRows[1]!.id,
    leadTeacherId: gv3!.id, assistantTeacherId: gv1!.id, capacity: 8, minCapacity: 4, plannedSessions: 12, startDate: addDays(today, 10), status: "pending_approval",
    description: "Lớp luyện thi RoboSim (dữ liệu mẫu)", submittedAt: new Date(), submittedBy: mgrU!.id,
  }).returning();
  await db.insert(classSchedules).values({ classId: classC!.id, weekday: 6, startTime: "08:00", endTime: "09:30", roomId: roomRows[1]!.id, teacherId: gv3!.id, effectiveFrom: addDays(today, 10), effectiveTo: null, createdBy: mgrU!.id });
  await db.insert(classEvents).values({ classId: classC!.id, event: "submit", fromStatus: "draft", toStatus: "pending_approval", actorId: mgrU!.id });

  // ---- Hồ sơ GV: khoá được dạy, đánh giá; khoá tiên quyết; ngày nghỉ; giáo trình nháp v2 ----
  await db.insert(teacherCourses).values([
    { teacherId: gv1!.id, courseId: sata4!.id }, { teacherId: gv1!.id, courseId: sata1.id },
    { teacherId: gv2!.id, courseId: sata6!.id },
    { teacherId: gv3!.id, courseId: sata1.id }, { teacherId: gv3!.id, courseId: sata4!.id },
  ]);
  await db.insert(teacherEvaluations).values({ teacherId: gv1!.id, score: 4, comment: "Dẫn dắt lớp tốt, cần quản lý thời gian phần thực hành chặt hơn (mẫu)", observedOn: addDays(today, -7), evaluatorId: mgrU!.id });
  await db.insert(coursePrerequisites).values({ courseId: sata6!.id, requiredCourseId: sata4!.id, note: "Học xong Sata4 mới lên Sata6", createdBy: adminU!.id });
  const monday = (() => { let d = addDays(today, 20); while (new Date(d + "T00:00:00Z").getUTCDay() !== 1) d = addDays(d, 1); return d; })();
  await db.insert(holidays).values([
    { centerId: null, date: monday, name: "Nghỉ lễ (mẫu)", createdBy: adminU!.id },
    { centerId: cs1!.id, date: addDays(monday, 1), name: "Bảo trì cơ sở (mẫu)", createdBy: mgrU!.id },
  ]);
  await db.update(curricula).set({ status: "active", description: "Giáo trình chuẩn 2026" }).where(eq(curricula.id, cur4!.id));
  const [cur4v2] = await db.insert(curricula).values({ courseId: sata4!.id, name: "Sata4 v2 (nháp)", version: 2, status: "draft", isActive: false, createdBy: adminU!.id }).returning();
  await db.insert(lessons).values(lessonTitles.slice(0, 3).map((title, i) => ({ curriculumId: cur4v2!.id, sequenceNo: i + 1, title, materials: "Bộ kit Sata4" })));

  // ---- Tài chính mẫu: kế toán CS1, phương thức TT, đơn học phí, khoản thu, hoàn tiền ----
  const [ktU] = await db.insert(users).values({ email: "ketoan.cs1@example.test", fullName: "Kế toán CS1 (mẫu)" }).returning();
  await db.insert(userRoles).values({ userId: ktU!.id, role: "CENTER_ACCOUNTANT", centerId: cs1!.id });
  const [pmCash, pmBank] = await db.insert(paymentMethods).values([
    { code: "TM-CS1", name: "Tiền mặt tại CS1", kind: "cash", centerId: cs1!.id, allowFor: ["course", "product"], sortOrder: 1 },
    { code: "CK-VCB", name: "Chuyển khoản Vietcombank", kind: "bank_transfer", centerId: null, bankBin: "970436", bankName: "Vietcombank", accountNo: "0000000000", accountName: "CONG TY SATA ROBO (MAU)", allowFor: ["course", "product", "exam"], sortOrder: 2, description: "Tài khoản mẫu — thay bằng tài khoản thật" },
  ]).returning();
  const sata4Price = Number(sata4!.listPrice);
  let orderSeq = 0;
  let receiptSeq = 0;
  const yr = new Date().getFullYear();
  const mkOrder = async (i: number, opts: { installments?: number; firstDue?: string; pay?: { amount: number; status: "confirmed" | "recorded"; daysAgo: number }[] }) => {
    const e = enrollA[i]!;
    const par = parentRows[i]!;
    const total = packagePrice(sata4Price, sata4!.totalSessions, e.packageSessions);
    const [o] = await db.insert(orders).values({
      code: orderCode(yr, ++orderSeq), type: "course", status: "pending_payment", centerId: cs1!.id, parentId: par.id, studentId: e.studentId, enrollmentId: e.id,
      customerName: par.fullName, customerPhone: par.phone, subtotal: total, discountAmount: 0, total, paymentMethodId: pmBank!.id, createdBy: sale1U!.id,
      createdAt: new Date(Date.now() - 40 * 86400e3),
    }).returning();
    await db.insert(orderItems).values({ orderId: o!.id, courseId: sata4!.id, description: `Học phí ${sata4!.code} — gói ${e.packageSessions} buổi`, quantity: 1, unitPrice: total, amount: total, packageSessions: e.packageSessions });
    await db.insert(orderInstallments).values(buildInstallmentPlan(total, opts.installments ?? 1, opts.firstDue ?? addDays(today, -30)).map((p) => ({ orderId: o!.id, ...p })));
    await db.insert(orderEvents).values({ orderId: o!.id, event: "create", toStatus: "pending_payment", actorId: sale1U!.id });
    await db.insert(financeLedger).values({ orderId: o!.id, centerId: cs1!.id, entryType: "charge", amount: total, refId: o!.id, note: "Tạo đơn", actorId: sale1U!.id });
    let confirmed = 0;
    for (const p of opts.pay ?? []) {
      const [pay] = await db.insert(payments).values({
        orderId: o!.id, centerId: cs1!.id, recordedAmount: p.amount, amount: p.amount, paymentMethodId: p.status === "confirmed" ? pmCash!.id : pmBank!.id, paidAt: addDays(today, -p.daysAgo),
        status: p.status, recordedBy: sale1U!.id, recordedAt: new Date(Date.now() - p.daysAgo * 86400e3),
        ...(p.status === "confirmed" ? { decidedBy: ktU!.id, decidedAt: new Date(Date.now() - (p.daysAgo - 1) * 86400e3), receiptNo: receiptNumber("CS1", yr, ++receiptSeq) } : {}),
      }).returning();
      if (p.status === "confirmed") {
        confirmed += p.amount;
        await db.insert(financeLedger).values({ orderId: o!.id, centerId: cs1!.id, entryType: "payment", amount: -p.amount, refId: pay!.id, note: "Thu học phí", actorId: ktU!.id });
      }
    }
    const status = confirmed <= 0 ? "pending_payment" : confirmed >= total ? "paid" : "partially_paid";
    await db.update(orders).set({ status }).where(eq(orders.id, o!.id));
    return { order: o!, total };
  };
  const paid0 = await mkOrder(0, { pay: [{ amount: packagePrice(sata4Price, 48, 48), status: "confirmed", daysAgo: 35 }] });
  const inst = await mkOrder(1, { installments: 3, firstDue: addDays(today, -45), pay: [{ amount: 3_200_000, status: "confirmed", daysAgo: 44 }] });
  await mkOrder(2, { pay: [{ amount: 2_000_000, status: "recorded", daysAgo: 1 }] });
  const paidFull = await mkOrder(4, { pay: [{ amount: packagePrice(sata4Price, 48, 48), status: "confirmed", daysAgo: 30 }] });
  await mkOrder(5, { installments: 2, firstDue: addDays(today, 2) });
  // enrollA[3] không có đơn → "Thiếu học phí: chưa lập đơn"
  await db.insert(refunds).values({
    orderId: paidFull.order.id, enrollmentId: enrollA[4]!.id, centerId: cs1!.id, status: "pending", amount: 6_000_000, proposedAmount: 7_600_000,
    sessionsUsed: 10, sessionsTotal: 48, reason: "Gia đình chuyển vào TP.HCM (mẫu)", requestedBy: mgrU!.id,
  });

  // ---- Hoa hồng mẫu + biến động số dư mẫu ----
  const [saleRule] = await db.insert(commissionRules).values([
    { name: "Sale chốt khoá học 5% (tối đa 1 triệu)", kind: "sale", centerId: null, orderType: "course", rateType: "percent", value: 500, maxAmount: 1_000_000, minOrderTotal: 0, effectiveFrom: "2026-01-01", createdBy: adminU!.id },
    { name: "Phụ huynh giới thiệu 300k", kind: "referrer", centerId: null, orderType: "course", rateType: "fixed", value: 300_000, minOrderTotal: 3_000_000, effectiveFrom: "2026-01-01", createdBy: adminU!.id },
  ]).returning();
  for (const [o, st] of [[paid0, "accrued"], [paidFull, "approved"]] as const) {
    const amt = computeCommission(saleRule!, o.total);
    await db.insert(commissions).values({
      orderId: o.order.id, centerId: cs1!.id, kind: "sale", ruleId: saleRule!.id, beneficiaryUserId: sale1U!.id, beneficiaryName: sale1U!.fullName,
      baseAmount: o.total, rateLabel: describeRule(saleRule!), originalAmount: amt, amount: amt, period: periodOf(addDays(today, -30)), status: st,
      ...(st === "approved" ? { approvedBy: mgrU!.id, approvedAt: new Date() } : {}),
    });
  }
  const now = Date.now();
  await db.insert(bankTransactions).values([
    { source: "sepay", externalId: "seed-1", gateway: "Vietcombank", accountNo: "0000000000", paymentMethodId: pmBank!.id, occurredAt: new Date(now - 2 * 3600e3), amount: 1_500_000, direction: "in", content: "PH chuyen tien hoc cho be (mau)", status: "unmatched", matchNote: "Nội dung không có mã đơn" },
    { source: "sepay", externalId: "seed-2", gateway: "Vietcombank", accountNo: "0000000000", paymentMethodId: pmBank!.id, centerId: cs1!.id, occurredAt: new Date(now - 3600e3), amount: 20_000_000, direction: "in", content: `SATA ${inst.order.code.replace("-", "")} (mau)`, status: "needs_review", matchNote: "Tiền vào vượt số còn phải thu", orderId: inst.order.id },
    { source: "sepay", externalId: "seed-3", gateway: "Vietcombank", accountNo: "0000000000", paymentMethodId: pmBank!.id, occurredAt: new Date(now - 1800e3), amount: 22_000, direction: "out", content: "Phi dich vu SMS (mau)", status: "ignored", matchNote: "Tiền ra — không đối khớp" },
  ]);

  // ---- Nhân sự, ca làm, chấm công, đơn từ (mẫu) ----
  const [hrU] = await db.insert(users).values({ email: "hr.cs1@example.test", fullName: "Nhân sự CS1 (mẫu)" }).returning();
  await db.insert(userRoles).values({ userId: hrU!.id, role: "CENTER_HR", centerId: cs1!.id });
  await db.update(centers).set({ latitude: 16.0336, longitude: 108.2212, checkinRadiusM: 150 }).where(eq(centers.id, cs1!.id));
  const [shHC, , shC] = await db.insert(workShifts).values([
    { centerId: null, code: "HC", name: "Hành chính", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
    { centerId: cs1!.id, code: "SANG", name: "Ca sáng", startTime: "07:30", endTime: "11:30", breakMinutes: 0 },
    { centerId: cs1!.id, code: "CHIEU", name: "Ca chiều tối", startTime: "13:30", endTime: "21:00", breakMinutes: 30 },
  ]).returning();
  const staffDefs = [
    { u: mgrU!, code: "NV0001", department: "management", title: "Quản lý cơ sở", hiredAt: "2025-03-01", status: "active" as const, shift: shHC! },
    { u: sale1U!, code: "NV0002", department: "sales", title: "Tư vấn viên", hiredAt: "2026-02-10", status: "active" as const, shift: shHC! },
    { u: sale2U!, code: "NV0003", department: "sales", title: "Tư vấn viên", hiredAt: "2026-07-01", status: "probation" as const, shift: shHC! },
    { u: ktU!, code: "NV0004", department: "accounting", title: "Kế toán", hiredAt: "2025-09-15", status: "active" as const, shift: shHC! },
    { u: hrU!, code: "NV0005", department: "hr", title: "Chuyên viên nhân sự", hiredAt: "2025-01-06", status: "active" as const, shift: shHC! },
    { u: t1U!, code: "NV0006", department: "academic", title: "Giáo viên chính", hiredAt: "2025-05-20", status: "active" as const, shift: shC!, teacherId: gv1!.id },
  ];
  const staffRows = await db.insert(staff).values([
    ...staffDefs.map((d) => ({ code: d.code, userId: d.u.id, teacherId: d.teacherId ?? null, fullName: d.u.fullName, email: d.u.email, centerId: cs1!.id, department: d.department, title: d.title, employmentType: "full_time" as const, status: d.status, hiredAt: d.hiredAt, createdBy: adminU!.id })),
    { code: "NV0007", fullName: "Nhân viên cũ (mẫu)", centerId: cs1!.id, department: "operations", title: "Lễ tân", employmentType: "part_time" as const, status: "resigned" as const, hiredAt: "2024-06-01", leftAt: "2026-05-31", statusReason: "Chuyển công tác (mẫu)", createdBy: adminU!.id },
  ]).returning();
  const [stMgr, stSale1, stSale2, stKt, stHr, stGv1, stOld] = staffRows;
  await db.insert(staffPrivate).values([
    { staffId: stMgr!.id, idNumber: "048090001234", birthDate: "1990-04-12", baseSalary: 15_000_000, allowance: 2_000_000, bankName: "Vietcombank", bankAccount: "0000000001" },
    { staffId: stSale1!.id, idNumber: "048095004321", baseSalary: 8_000_000, allowance: 500_000 },
  ]);
  await db.insert(staffPositions).values([
    ...staffDefs.map((d, i) => ({ staffId: staffRows[i]!.id, centerId: cs1!.id, title: d.title, department: d.department, kind: "primary" as const, effectiveFrom: d.hiredAt, createdBy: adminU!.id })),
    { staffId: stMgr!.id, centerId: cs2!.id, title: "Phụ trách CS2", department: "management", kind: "concurrent" as const, effectiveFrom: "2026-06-01", createdBy: adminU!.id },
    { staffId: stSale1!.id, centerId: cs1!.id, title: "Quyền trưởng nhóm tư vấn", department: "sales", kind: "delegated" as const, effectiveFrom: addDays(today, -10), effectiveTo: addDays(today, 20), createdBy: mgrU!.id },
    { staffId: stOld!.id, centerId: cs1!.id, title: "Lễ tân", department: "operations", kind: "primary" as const, effectiveFrom: "2024-06-01", effectiveTo: "2026-05-31", endReason: "Nghỉ việc", createdBy: adminU!.id },
  ]);
  const at = (d: string, min: number) => new Date(`${d}T${fmtMin(min)}:00+07:00`);
  const absent = new Map<string, string>([[stKt!.id, addDays(today, -4)], [stHr!.id, addDays(today, -5)]]);
  const asg: (typeof shiftAssignments.$inferInsert)[] = [];
  const punches: (typeof attendancePunches.$inferInsert)[] = [];
  staffDefs.forEach((d, i) => {
    const st = staffRows[i]!;
    for (let k = -20; k <= 6; k++) {
      const day = addDays(today, k);
      const wd = weekdayOf(day);
      if (wd === 7 || (d.shift.id === shC!.id && wd === 1)) continue;
      asg.push({ staffId: st.id, date: day, shiftId: d.shift.id, centerId: cs1!.id, createdBy: hrU!.id });
      if (k >= 0 || absent.get(st.id) === day) continue;
      const jitter = (i * 7 + k * 3 + 30) % 9;
      let inMin = hhmm(d.shift.startTime) - jitter;
      if (st.id === stSale1!.id && k === -3) inMin = hhmm(d.shift.startTime) + 25;
      punches.push({ staffId: st.id, centerId: cs1!.id, kind: "in", at: at(day, inMin), source: "gps", lat: 16.0336, lng: 108.2213, accuracyM: 15, distanceM: 11, createdBy: d.u.id });
      if (st.id === stSale2!.id && k === -2) continue;
      punches.push({ staffId: st.id, centerId: cs1!.id, kind: "out", at: at(day, hhmm(d.shift.endTime) + ((jitter * 2) % 15)), source: "gps", lat: 16.0337, lng: 108.2212, accuracyM: 20, distanceM: 9, createdBy: d.u.id });
    }
  });
  await db.insert(shiftAssignments).values(asg);
  await db.insert(attendancePunches).values(punches);
  await db.insert(staffRequests).values([
    { staffId: stHr!.id, centerId: cs1!.id, kind: "leave", status: "approved", dateFrom: addDays(today, -5), dateTo: addDays(today, -5), portion: "full", leaveType: "annual", days: 1, reason: "Việc gia đình (mẫu)", decidedBy: mgrU!.id, decidedAt: new Date(), createdBy: hrU!.id },
    { staffId: stSale1!.id, centerId: cs1!.id, kind: "late_early", status: "pending", dateFrom: addDays(today, -3), dateTo: addDays(today, -3), lateMin: 25, minutes: 25, reason: "Kẹt xe do mưa lớn (mẫu)", createdBy: sale1U!.id },
    { staffId: stSale2!.id, centerId: cs1!.id, kind: "missing_punch", status: "pending", dateFrom: addDays(today, -2), dateTo: addDays(today, -2), punchOut: "17:10", reason: "Quên chấm ra do điện thoại hết pin (mẫu)", createdBy: sale2U!.id },
    { staffId: stKt!.id, centerId: cs1!.id, kind: "leave", status: "pending", dateFrom: addDays(today, 3), dateTo: addDays(today, 4), portion: "full", leaveType: "annual", days: leaveDays(addDays(today, 3), addDays(today, 4), "full"), reason: "Về quê (mẫu)", createdBy: ktU!.id },
  ]);

  // ---- CSKH phụ huynh (mẫu): yêu cầu, đánh giá, khảo sát, thông báo, sinh nhật ----
  const futA = sessionRows.filter((x) => x.classId === classA!.id && x.date > today).sort((a, b) => a.sequenceNo - b.sequenceNo);
  const yr2 = new Date().getFullYear();
  const reqDefs = [
    { type: "absence" as const, status: "new" as const, channel: "zalo" as const, i: 0, sessionId: futA[0]?.id ?? null, content: "Con bị sốt, xin nghỉ buổi tới (mẫu)", hoursAgo: 1 },
    { type: "pause" as const, status: "in_progress" as const, channel: "phone" as const, i: 1, content: "Gia đình về quê 1 tháng, xin bảo lưu (mẫu)", hoursAgo: 30, dateFrom: addDays(today, 7), dateTo: addDays(today, 37) },
    { type: "complaint" as const, status: "new" as const, channel: "walk_in" as const, i: 2, content: "Phòng học hơi nóng buổi chiều (mẫu)", hoursAgo: 40 },
    { type: "other" as const, status: "done" as const, channel: "app" as const, i: 3, content: "Hỏi lịch nghỉ lễ (mẫu)", hoursAgo: 72 },
  ];
  let reqSeq = 0;
  for (const d of reqDefs) {
    const created = new Date(Date.now() - d.hoursAgo * 3600e3);
    const e = enrollA[d.i]!;
    const [r] = await db.insert(parentRequests).values({
      code: requestCode(yr2, ++reqSeq), type: d.type, status: d.status, channel: d.channel, centerId: cs1!.id, studentId: e.studentId, parentId: parentRows[d.i]!.id,
      enrollmentId: d.type === "complaint" || d.type === "other" ? null : e.id, sessionId: d.sessionId ?? null, dateFrom: d.dateFrom ?? null, dateTo: d.dateTo ?? null,
      content: d.content, dueAt: slaDue(created, d.type), assigneeId: d.status === "in_progress" ? sale1U!.id : null, createdBy: sale1U!.id, createdAt: created,
      ...(d.status === "done" ? { resolution: "Đã gửi lịch nghỉ lễ qua Zalo", completedAt: new Date(created.getTime() + 2 * 3600e3) } : {}),
    }).returning();
    await db.insert(parentRequestEvents).values({ requestId: r!.id, action: "create", toStatus: "new", note: d.content, actorId: sale1U!.id, createdAt: created });
  }
  const pastSess = sessionRows.filter((x) => x.classId === classA!.id && x.date < today).sort((a, b) => b.sequenceNo - a.sequenceNo);
  const [ct] = await db.insert(careTasks).values({ studentId: enrollA[2]!.studentId, enrollmentId: enrollA[2]!.id, centerId: cs1!.id, code: "LOW_FEEDBACK", title: "PH đánh giá thấp buổi học — gọi lại trong 24h", severity: 2, dueAt: new Date(Date.now() + 20 * 3600e3), assigneeId: sale1U!.id }).returning();
  await db.insert(parentFeedback).values([
    { centerId: cs1!.id, studentId: enrollA[0]!.studentId, parentId: parentRows[0]!.id, classId: classA!.id, sessionId: pastSess[1]?.id ?? null, teacherId: gv1!.id, rating: 5, teacherRating: 5, tags: ["teacher", "result"], comment: "Con rất thích thầy (mẫu)", channel: "zalo", status: "resolved", response: "Cảm ơn chị!", respondedBy: sale1U!.id, respondedAt: new Date(), createdBy: sale1U!.id },
    { centerId: cs1!.id, studentId: enrollA[1]!.studentId, parentId: parentRows[1]!.id, classId: classA!.id, sessionId: pastSess[1]?.id ?? null, teacherId: gv1!.id, rating: 4, teacherRating: 4, tags: ["content"], channel: "app", createdBy: sale1U!.id },
    { centerId: cs1!.id, studentId: enrollA[2]!.studentId, parentId: parentRows[2]!.id, classId: classA!.id, sessionId: pastSess[2]?.id ?? null, teacherId: gv1!.id, rating: 2, teacherRating: 3, tags: ["facility", "schedule"], comment: "Lớp tan muộn 15 phút, phòng nóng (mẫu)", channel: "phone", careTaskId: ct!.id, createdBy: sale1U!.id },
  ]);
  const qs = [
    { id: "nps", type: "nps" as const, label: "Anh/chị sẵn sàng giới thiệu Sata Robo cho bạn bè ở mức nào?", required: true },
    { id: "gv", type: "rating" as const, label: "Mức hài lòng về giáo viên", required: true },
    { id: "kenh", type: "choice" as const, label: "Anh/chị muốn nhận thông tin qua kênh nào?", required: false, options: ["Zalo", "App", "Email"] },
    { id: "gopy", type: "text" as const, label: "Góp ý thêm", required: false },
  ];
  const [sv] = await db.insert(surveys).values({ title: "Khảo sát sau buổi 4 (mẫu)", description: "Giúp Sata Robo phục vụ con tốt hơn", trigger: "session_n", triggerValue: 4, questions: qs, status: "active", createdBy: mgrU!.id }).returning();
  await db.insert(surveys).values({ title: "Khảo sát cuối khoá (nháp)", trigger: "course_end", questions: qs.slice(0, 2), status: "draft", createdBy: mgrU!.id });
  const invRows = await db.insert(surveyInvites).values([0, 1, 2].map((i) => ({
    surveyId: sv!.id, parentId: parentRows[i]!.id, studentId: enrollA[i]!.studentId, enrollmentId: enrollA[i]!.id, centerId: cs1!.id,
    token: `demo-ks-${i + 1}-${sv!.id.slice(0, 8)}`, status: i < 2 ? "answered" : "sent", source: "session_n",
    sentAt: new Date(Date.now() - 5 * 86400e3), expiresAt: new Date(Date.now() + 9 * 86400e3), answeredAt: i < 2 ? new Date(Date.now() - 4 * 86400e3) : null,
  }))).returning();
  const [ct2] = await db.insert(careTasks).values({ studentId: enrollA[1]!.studentId, enrollmentId: enrollA[1]!.id, centerId: cs1!.id, code: "LOW_NPS", title: "NPS thấp (5/10) — gọi hỏi thăm", severity: 2, dueAt: new Date(Date.now() + 86400e3) }).returning();
  await db.insert(surveyResponses).values([
    { inviteId: invRows[0]!.id, surveyId: sv!.id, answers: { nps: 10, gv: 5, kenh: "Zalo", gopy: "Rất hài lòng" }, npsScore: 10 },
    { inviteId: invRows[1]!.id, surveyId: sv!.id, answers: { nps: 5, gv: 3, kenh: "App", gopy: "Muốn có thêm bài tập về nhà" }, npsScore: 5, careTaskId: ct2!.id },
  ]);
  await db.insert(parentNotifications).values([
    { parentId: parentRows[2]!.id, studentId: enrollA[2]!.studentId, channel: "in_app", template: "SURVEY_INVITE", title: "Mời anh/chị góp ý", body: "Khảo sát sau buổi 4", link: `/ks/${invRows[2]!.token}`, status: "sent", sentAt: new Date() },
    { parentId: parentRows[0]!.id, studentId: enrollA[0]!.studentId, channel: "zns", template: "TUITION_DUE", title: "Nhắc học phí", body: "Kỳ học phí sắp đến hạn", status: "failed", error: "Chưa cấu hình Zalo ZNS" },
  ]);
  const mdAfter = (n: number) => addDays(today, n).slice(5);
  await db.update(students).set({ dateOfBirth: `2016-${mdAfter(0)}` }).where(eq(students.id, enrollA[0]!.studentId));
  await db.update(students).set({ dateOfBirth: `2017-${mdAfter(3)}` }).where(eq(students.id, enrollA[1]!.studentId));
  await db.update(students).set({ dateOfBirth: `2015-${mdAfter(20)}` }).where(eq(students.id, enrollA[4]!.studentId));

  // ---- Hệ thống (mẫu): khu vực, nhóm, nhật ký email/OTP/webhook, cài đặt, mục tiêu doanh thu ----
  const [rg] = await db.insert(regions).values({ code: "MIEN-TRUNG", name: "Miền Trung", managerUserId: adminU!.id }).returning();
  await db.update(centers).set({ regionId: rg!.id });
  const [grp] = await db.insert(userGroups).values({ name: "Ban quản lý cơ sở", description: "Nhận thông báo vận hành chung", createdBy: adminU!.id }).returning();
  await db.insert(userGroupMembers).values([{ groupId: grp!.id, userId: mgrU!.id, addedBy: adminU!.id }, { groupId: grp!.id, userId: ktU!.id, addedBy: adminU!.id }]);
  await db.insert(emailLogs).values([
    { toEmail: "ph.mau1@example.test", eventKey: "RECEIPT_ISSUED", subject: "Sata Robo xác nhận thanh toán PT-CS1-26-000001", body: "(mẫu)", status: "skipped", error: "Chưa cấu hình nhà cung cấp email (RESEND_API_KEY)", attempts: 1, createdAt: new Date(Date.now() - 86400e3) },
    { toEmail: "sai-dia-chi", eventKey: "TEST", subject: "Email thử", body: "(mẫu)", status: "failed", error: "Địa chỉ email không hợp lệ", attempts: 3 },
  ]);
  await db.insert(otpRequests).values([
    { phone: "0905000001", purpose: "parent_activation", codeHash: "x", channel: "zns", status: "verified", attempts: 1, ip: "113.160.0.1", expiresAt: new Date(Date.now() - 3600e3), verifiedAt: new Date(Date.now() - 3700e3), createdAt: new Date(Date.now() - 3800e3) },
    { phone: "0905000002", purpose: "password_reset", codeHash: "x", channel: "zns", status: "failed", attempts: 5, ip: "113.160.0.2", expiresAt: new Date(Date.now() - 600e3), createdAt: new Date(Date.now() - 900e3) },
  ]);
  await db.insert(webhookEvents).values([
    { source: "public_lead", status: "failed", httpStatus: 400, payload: { hoTenPh: "Phụ huynh webhook (mẫu)", sdt: "0906111222", lop: 4, consent: true, source: "web-form" }, error: "Lỗi tạm thời khi ghi lead (mẫu)", ip: "1.2.3.4", receivedAt: new Date(Date.now() - 7200e3) },
    { source: "sepay", externalId: "seed-1", status: "processed", httpStatus: 201, payload: { id: "seed-1", transferAmount: 1500000 }, result: { status: "unmatched" }, receivedAt: new Date(Date.now() - 7200e3) },
    { source: "sepay", status: "rejected", httpStatus: 401, payload: { note: "sai khoá" }, error: "Sai API key", receivedAt: new Date(Date.now() - 3600e3) },
  ]);
  await db.insert(appSettings).values({ key: "general", value: { ...SETTINGS_DEFAULTS, hotline: "0900 000 000", supportEmail: "hotro@example.test" }, updatedBy: adminU!.id });
  const pm = (k: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
  await db.insert(revenueTargets).values([
    { centerId: cs1!.id, period: pm(0), amount: 60_000_000, newEnrollments: 8, updatedBy: adminU!.id },
    { centerId: cs1!.id, period: pm(-1), amount: 50_000_000, newEnrollments: 6, updatedBy: adminU!.id },
    { centerId: cs2!.id, period: pm(0), amount: 40_000_000, newEnrollments: 5, updatedBy: adminU!.id },
  ]);

  // ---- Kho & học cụ (mẫu): linh kiện, bộ học cụ theo khoá, sản phẩm bán/thuê, tồn đầu kỳ ----
  const itemRows = await db.insert(inventoryItems).values([
    { sku: "LK-MOTOR", name: "Động cơ DC mini", type: "component", unit: "cái", reorderLevel: 20 },
    { sku: "LK-SENSOR", name: "Cảm biến siêu âm", type: "component", unit: "cái", reorderLevel: 10 },
    { sku: "LK-BOARD", name: "Bo mạch điều khiển", type: "component", unit: "cái", reorderLevel: 5 },
    { sku: "KIT-SATA4", name: "Bộ học cụ Sata 4", type: "kit", unit: "bộ", courseId: sata4!.id, salePrice: 1_200_000, rentPrice: 150_000, deposit: 500_000, reorderLevel: 3 },
    { sku: "SP-ROBOT-MINI", name: "Robot mini lắp ráp", type: "product", unit: "hộp", salePrice: 350_000, reorderLevel: 5 },
    { sku: "SP-BINH-NUOC", name: "Bình nước Sata Robo", type: "product", unit: "cái", salePrice: 90_000, reorderLevel: 10 },
    { sku: "VT-PIN-AA", name: "Pin AA", type: "material", unit: "viên", reorderLevel: 50 },
  ]).returning();
  const it = (sku: string) => itemRows.find((x) => x.sku === sku)!;
  await db.insert(kitComponents).values([
    { kitId: it("KIT-SATA4").id, componentId: it("LK-MOTOR").id, qty: 2 },
    { kitId: it("KIT-SATA4").id, componentId: it("LK-SENSOR").id, qty: 1 },
    { kitId: it("KIT-SATA4").id, componentId: it("LK-BOARD").id, qty: 1 },
  ]);
  const opening: [string, string, number, number][] = [
    ["LK-MOTOR", cs1!.id, 40, 45_000], ["LK-SENSOR", cs1!.id, 12, 60_000], ["LK-BOARD", cs1!.id, 6, 180_000], ["KIT-SATA4", cs1!.id, 5, 380_000],
    ["SP-ROBOT-MINI", cs1!.id, 8, 200_000], ["SP-BINH-NUOC", cs1!.id, 4, 40_000], ["VT-PIN-AA", cs1!.id, 120, 3_000],
    ["LK-MOTOR", cs2!.id, 10, 45_000], ["KIT-SATA4", cs2!.id, 2, 380_000], ["SP-ROBOT-MINI", cs2!.id, 3, 200_000],
  ];
  await db.insert(stockLevels).values(opening.map(([sku, c, q, cost]) => ({ itemId: it(sku).id, centerId: c, onHand: q, avgCost: cost })));
  await db.insert(stockMovements).values(opening.map(([sku, c, q, cost], i) => ({
    code: `PN-${c === cs1!.id ? "CS1" : "CS2"}-${today.slice(2, 4)}-${String(c === cs1!.id ? 1 : 1).padStart(5, "0")}`, itemId: it(sku).id, centerId: c, type: "receipt" as const,
    qty: q, balanceAfter: q, unitCost: cost, supplier: "Nhà cung cấp mẫu", note: "Tồn đầu kỳ (mẫu)", createdBy: adminU!.id, createdAt: new Date(Date.now() - (20 - i) * 3600e3),
  })));
  await db.insert(stockCounters).values([{ key: `PN-CS1-${today.slice(0, 4)}`, seq: 1 }, { key: `PN-CS2-${today.slice(0, 4)}`, seq: 1 }]);
  // cấp 1 bộ học cụ cho HV đầu tiên lớp A; 1 phiếu thuê quá hạn
  await db.update(stockLevels).set({ onHand: 3 }).where(and(eq(stockLevels.itemId, it("KIT-SATA4").id), eq(stockLevels.centerId, cs1!.id)));
  await db.insert(stockMovements).values([
    { code: `PX-CS1-${today.slice(2, 4)}-00001`, itemId: it("KIT-SATA4").id, centerId: cs1!.id, type: "issue", qty: -1, balanceAfter: 4, unitCost: 380_000, studentId: enrollA[0]!.studentId, classId: classA!.id, createdBy: mgrU!.id },
    { code: `TH-CS1-${today.slice(2, 4)}-00001`, itemId: it("KIT-SATA4").id, centerId: cs1!.id, type: "rent_out", qty: -1, balanceAfter: 3, unitCost: 380_000, studentId: enrollA[1]!.studentId, refType: "rental", createdBy: mgrU!.id },
  ]);
  await db.insert(stockCounters).values([{ key: `PX-CS1-${today.slice(0, 4)}`, seq: 1 }, { key: `TH-CS1-${today.slice(0, 4)}`, seq: 1 }]);
  await db.insert(rentals).values({ code: `TH-CS1-${today.slice(2, 4)}-00001`, itemId: it("KIT-SATA4").id, centerId: cs1!.id, studentId: enrollA[1]!.studentId, qty: 1, startDate: addDays(today, -40), dueDate: addDays(today, -10), fee: 300_000, deposit: 500_000, createdBy: mgrU!.id });

  // ---- SataCoin (mẫu): quà, lịch sử xu, 1 yêu cầu đổi quà chờ duyệt ----
  const rw = await db.insert(rewardItems).values([
    { name: "Sticker Sata Robo", cost: 20, sortOrder: 1 },
    { name: "Bình nước Sata Robo", cost: 120, inventoryItemId: it("SP-BINH-NUOC").id, sortOrder: 2 },
    { name: "Robot mini lắp ráp", cost: 400, inventoryItemId: it("SP-ROBOT-MINI").id, sortOrder: 3 },
  ]).returning();
  const coinPlan: [number, number, "attendance" | "homework" | "competition" | "behavior"][] = [[0, 30, "attendance"], [0, 20, "homework"], [0, 100, "competition"], [1, 40, "attendance"], [1, 15, "behavior"], [2, 25, "attendance"], [3, 10, "homework"]];
  const bal: Record<number, number> = {};
  await db.insert(coinTransactions).values(coinPlan.map(([i, amt, reason], k) => {
    bal[i] = (bal[i] ?? 0) + amt;
    return { studentId: enrollA[i]!.studentId, centerId: cs1!.id, amount: amt, balanceAfter: bal[i]!, reason, note: reason === "competition" ? "Giải nhì Robotacon (mẫu)" : null, classId: classA!.id, createdBy: reason === "competition" ? mgrU!.id : t1U!.id, createdAt: new Date(Date.now() - (10 - k) * 86400e3) };
  }));
  await db.insert(redemptions).values({ code: `DQ-CS1-${today.slice(2, 4)}-00001`, studentId: enrollA[0]!.studentId, centerId: cs1!.id, rewardId: rw[1]!.id, cost: 120, requestedBy: sale1U!.id, note: "Con muốn đổi bình nước" });
  await db.insert(stockCounters).values({ key: `DQ-CS1-${today.slice(0, 4)}`, seq: 1 });

  // ---- Học liệu (mẫu): tài khoản Đào tạo, tài liệu liên kết, mẫu bài tập, bài tập lớp A, đề xuất sửa giáo án ----
  const [dtU] = await db.insert(users).values({ email: "daotao@example.test", fullName: "Đào tạo (mẫu)" }).returning();
  await db.insert(userRoles).values({ userId: dtU!.id, role: "TRAINING", centerId: null });
  await db.insert(documents).values([
    { title: "Video: làm quen robot Sata4", kind: "link", category: "video", audience: "student", status: "published", courseId: sata4!.id, lessonId: lessonRows[0]!.id, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", tags: ["video", "bài 1"], createdBy: dtU!.id, publishedAt: new Date() },
    { title: "Hướng dẫn lập trình cảm biến (GV)", kind: "link", category: "guide", audience: "teacher", status: "published", courseId: sata4!.id, lessonId: lessonRows[1]!.id, url: "https://docs.google.com/document/d/mau", tags: ["cảm biến"], createdBy: dtU!.id, publishedAt: new Date() },
    { title: "Giáo án bài 2 (đang soạn)", kind: "file", category: "lesson_plan", audience: "teacher", status: "draft", courseId: sata4!.id, lessonId: lessonRows[1]!.id, createdBy: dtU!.id },
  ]);
  const [tpl1] = await db.insert(assignmentTemplates).values({ courseId: sata4!.id, lessonId: lessonRows[0]!.id, title: "Lắp xe robot cơ bản", instructions: "Con lắp xe theo hình hướng dẫn trang 3 và chụp ảnh xe đã lắp xong gửi thầy cô.", submissionType: "file", maxScore: 10, createdBy: dtU!.id }).returning();
  const hwActive = enrollA.filter((e, i) => i !== 9);
  const [hw1] = await db.insert(assignments).values({ classId: classA!.id, templateId: tpl1!.id, title: "Lắp xe robot cơ bản", instructions: "Con lắp xe theo hình hướng dẫn trang 3 và chụp ảnh xe đã lắp xong gửi thầy cô.", submissionType: "file", maxScore: 10, dueAt: new Date(Date.now() + 3 * 86400e3), coinReward: 5, status: "published", publishedAt: new Date(Date.now() - 86400e3), createdBy: t1U!.id }).returning();
  await db.insert(submissions).values(hwActive.map((e, i) => ({
    assignmentId: hw1!.id, studentId: e.studentId, token: `seedhw1tok${String(i).padStart(2, "0")}${hw1!.id.slice(0, 8)}`,
    status: (i === 0 ? "submitted" : i === 1 ? "graded" : "assigned") as "submitted" | "graded" | "assigned",
    answerText: i < 2 ? "Con đã lắp xong (mẫu)" : null, submittedAt: i < 2 ? new Date(Date.now() - 3600e3) : null, submittedVia: i < 2 ? "parent_link" : null, attempts: i < 2 ? 1 : 0,
    score: i === 1 ? 9 : null, feedback: i === 1 ? "Lắp chắc chắn, gọn gàng" : null, gradedBy: i === 1 ? t1U!.id : null, gradedAt: i === 1 ? new Date() : null,
  })));
  const [hw0] = await db.insert(assignments).values({ classId: classA!.id, title: "Trả lời: robot dùng cảm biến gì?", instructions: "Con kể tên 2 loại cảm biến đã học và công dụng của chúng.", submissionType: "text", maxScore: 10, dueAt: new Date(Date.now() - 5 * 86400e3), status: "closed", publishedAt: new Date(Date.now() - 12 * 86400e3), closedAt: new Date(Date.now() - 4 * 86400e3), createdBy: t1U!.id }).returning();
  await db.insert(submissions).values(hwActive.slice(0, 3).map((e, i) => ({
    assignmentId: hw0!.id, studentId: e.studentId, token: `seedhw0tok${String(i).padStart(2, "0")}${hw0!.id.slice(0, 8)}`,
    status: (i === 2 ? "missing" : "graded") as "missing" | "graded", answerText: i < 2 ? "Cảm biến siêu âm, cảm biến màu" : null, submittedAt: i < 2 ? new Date(Date.now() - 6 * 86400e3) : null,
    score: i === 0 ? 10 : i === 1 ? 7 : null, gradedBy: i < 2 ? t1U!.id : null, gradedAt: i < 2 ? new Date(Date.now() - 5 * 86400e3) : null,
  })));
  await db.insert(lessonProposals).values({
    code: `DX${String(new Date().getFullYear()).slice(2)}-0001`, lessonId: lessonRows[2]!.id, curriculumId: cur4!.id, type: "objectives", status: "submitted",
    reason: "Học sinh lớp 3 cần thêm mục tiêu lập trình kéo thả cơ bản ngay từ bài 3.", snapshot: { title: lessonRows[2]!.title, objectives: lessonRows[2]!.objectives, materials: lessonRows[2]!.materials },
    patch: { objectives: "Lắp mô hình; lập trình kéo thả cho robot tiến / lùi" }, classId: classA!.id, proposedBy: t1U!.id,
  });

  // ---- Lớp Trial mẫu: 1 buổi sắp tới (đã xếp), 1 đã học thử, 1 không đến ----
  const futureA = sessionRows.filter((x) => x.classId === classA!.id && x.date > today).sort((a, b) => a.sequenceNo - b.sequenceNo);
  const futureB = sessionRows.filter((x) => x.classId === classB!.id && x.date > today).sort((a, b) => a.sequenceNo - b.sequenceNo);
  const trialRows: (typeof trialBookings.$inferInsert)[] = [];
  if (futureA[0]) trialRows.push({ leadId: leadRows[3]!.id, sessionId: futureA[0].id, centerId: cs1!.id, status: "booked", childName: leadRows[3]!.childName, note: "PH đưa đón (mẫu)", bookedBy: sale1U!.id });
  if (futureB[0]) trialRows.push({ leadId: leadRows[4]!.id, sessionId: futureB[0].id, centerId: cs2!.id, status: "booked", childName: leadRows[4]!.childName, bookedBy: sale2U!.id });
  if (toComplete.length >= 2) {
    trialRows.push({ leadId: leadRows[5]!.id, sessionId: toComplete[toComplete.length - 1]!.id, centerId: cs1!.id, status: "attended", childName: leadRows[5]!.childName, resultNote: "Con hào hứng, lắp xong mô hình", resultBy: t1U!.id, resultAt: h(30), bookedBy: sale1U!.id });
    trialRows.push({ leadId: leadRows[7]!.id, sessionId: toComplete[toComplete.length - 2]!.id, centerId: cs1!.id, status: "no_show", childName: leadRows[7]!.childName, resultNote: "PH báo bận đột xuất", resultBy: mgrU!.id, resultAt: h(200), bookedBy: sale1U!.id });
    trialRows.push({ leadId: leadRows[8]!.id, sessionId: toComplete[0]!.id, centerId: cs1!.id, status: "attended", childName: leadRows[8]!.childName, resultBy: t1U!.id, resultAt: h(520), bookedBy: sale1U!.id });
  }
  if (trialRows.length) await db.insert(trialBookings).values(trialRows);
  await db.insert(leadActivities).values([
    { leadId: leadRows[9]!.id, type: "status_change" as const, content: "Mất lead", meta: { from: "consulting", to: "lost", event: "lose" }, createdAt: h(650) },
    { leadId: leadRows[8]!.id, type: "status_change" as const, content: "Đăng ký", meta: { from: "trial_done", to: "enrolled", event: "enroll" }, createdAt: h(500) },
  ]);

  // ---- Website, marketing, tuân thủ (mẫu) ----
  const [mkU] = await db.insert(users).values({ email: "marketing@example.test", fullName: "Marketing HO (mẫu)" }).returning();
  await db.insert(userRoles).values({ userId: mkU!.id, role: "HO_MARKETING", centerId: null });
  const d = (n: number) => new Date(Date.now() - n * 86400e3);
  await db.insert(posts).values([
    { slug: "khai-giang-he-2026", title: "Khai giảng khoá hè 2026", excerpt: "Lịch khai giảng các lớp robot mùa hè tại hai cơ sở.", body: "## Lịch khai giảng\n\nCác lớp **Sata4** và **Sata6** khai giảng từ tháng 6.\n\n- Học thử miễn phí 1 buổi\n- Sĩ số tối đa 12\n\n[Đăng ký học thử](/dang-ky)", category: "news", status: "published", publishedAt: d(5), createdBy: mkU!.id, views: 42 },
    { slug: "5-meo-giup-con-yeu-lap-trinh", title: "5 mẹo giúp con yêu lập trình", excerpt: "Gợi ý cho phụ huynh đồng hành cùng con tại nhà.", body: "1. Cho con tự lắp trước\n2. Hỏi con \"vì sao\"\n3. Khen quá trình, không chỉ kết quả", category: "tips", status: "published", publishedAt: d(12), createdBy: mkU!.id, views: 17 },
    { slug: "robotacon-2026", title: "Học viên đạt giải Robotacon 2026", body: "Bài viết đang soạn (mẫu).", category: "story", status: "draft", createdBy: mkU!.id },
    { slug: "uu-dai-thang-9", title: "Ưu đãi tháng 9", body: "Giảm học phí khi đăng ký trước ngày khai giảng (mẫu).", category: "promotion", status: "scheduled", publishAt: new Date(Date.now() + 3 * 86400e3), createdBy: mkU!.id },
  ]);
  await db.insert(siteBlocks).values([
    { page: "home", data: { heroTitle: "Sata Robo — Học robot, yêu khoa học", heroSubtitle: "Lập trình & robotics cho trẻ 6–15 tuổi.", heroImage: "", ctaLabel: "Đăng ký học thử", ctaUrl: "/dang-ky" }, updatedBy: mkU!.id },
    { page: "about", data: { title: "Về Sata Robo", body: "Sata Robo là hệ thống trung tâm STEM (nội dung mẫu).\n\n## Sứ mệnh\n\nGiúp trẻ tự tin sáng tạo với công nghệ.", image: "" }, updatedBy: mkU!.id },
    { page: "register", data: { title: "Đăng ký học thử miễn phí", subtitle: "Để lại thông tin, tư vấn viên gọi lại trong 24 giờ.", thankYou: "Cảm ơn anh/chị! Sata Robo sẽ liên hệ sớm." }, updatedBy: mkU!.id },
  ]);
  const monthStartISO = `${today.slice(0, 8)}01`;
  const [campHe, campGg] = await db.insert(campaigns).values([
    { name: "Hè 2026 — Facebook", utmCampaign: "he-2026", channel: "facebook", centerId: cs1!.id, budget: 5_000_000, startDate: addDays(today, -40), endDate: addDays(today, 20), landingUrl: "https://satarobo.vn/dang-ky", createdBy: mkU!.id },
    { name: "Google tìm kiếm", utmCampaign: "gg-search", channel: "google", centerId: null, budget: 2_000_000, startDate: monthStartISO, createdBy: mkU!.id },
  ]).returning();
  await db.insert(campaignSpends).values([
    { campaignId: campHe!.id, date: addDays(today, -3), amount: 400_000, impressions: 12000, clicks: 180, createdBy: mkU!.id },
    { campaignId: campHe!.id, date: addDays(today, -2), amount: 350_000, impressions: 10500, clicks: 150, createdBy: mkU!.id },
    { campaignId: campHe!.id, date: addDays(today, -1), amount: 380_000, impressions: 11000, clicks: 170, createdBy: mkU!.id },
    { campaignId: campGg!.id, date: today, amount: 120_000, impressions: 900, clicks: 40, createdBy: mkU!.id },
  ]);
  const anon = (i: number) => `seedanon${String(i).padStart(4, "0")}abcdef`;
  await db.insert(trackEvents).values([
    ...Array.from({ length: 12 }, (_, i) => ({ event: "page_view" as const, anonId: anon(i), path: i % 3 ? "/dang-ky" : "/tin-tuc", utmSource: i < 8 ? "facebook" : null, utmMedium: i < 8 ? "cpc" : null, utmCampaign: i < 8 ? "he-2026" : null, referrerHost: i >= 8 ? "google.com" : null, createdAt: h(i + 2) })),
    ...Array.from({ length: 6 }, (_, i) => ({ event: "form_view" as const, anonId: anon(i), path: "/dang-ky", utmSource: "facebook", utmMedium: "cpc", utmCampaign: "he-2026", createdAt: h(i + 2) })),
    ...Array.from({ length: 3 }, (_, i) => ({ event: "form_start" as const, anonId: anon(i), path: "/dang-ky", utmSource: "facebook", utmMedium: "cpc", utmCampaign: "he-2026", createdAt: h(i + 1.5) })),
    { event: "form_submit" as const, anonId: anon(0), path: "/dang-ky", utmSource: "facebook", utmMedium: "cpc", utmCampaign: "he-2026", leadId: leadRows[0]!.id, createdAt: h(1) },
  ]);
  await db.insert(consentRecords).values([
    { subjectType: "lead" as const, subjectId: leadRows[0]!.id, purpose: "service" as const, granted: true, source: "web_form", textVersion: CONSENT_TEXT_VERSION, createdAt: h(1) },
    { subjectType: "lead" as const, subjectId: leadRows[0]!.id, purpose: "marketing" as const, granted: true, source: "web_form", textVersion: CONSENT_TEXT_VERSION, createdAt: h(1) },
    ...parentRows.slice(0, 4).map((p) => ({ subjectType: "parent" as const, subjectId: p.id, purpose: "service" as const, granted: true, source: "counter", textVersion: CONSENT_TEXT_VERSION, recordedBy: mgrU!.id })),
  ]);
  await db.update(leads).set({ marketingOptOut: true }).where(eq(leads.id, leadRows[9]!.id));
  const recv = h(20);
  const [dr] = await db.insert(dataRequests).values({
    code: dsrCode(Number(today.slice(0, 4)), 1), type: "withdraw_consent", status: "received", centerId: cs1!.id, requesterName: "PH Mẫu 10", requesterPhone: "0900000010", channel: "phone",
    details: "Phụ huynh không muốn nhận tin nhắn quảng cáo nữa (mẫu).", subjectType: "lead", subjectId: leadRows[9]!.id, receivedAt: recv, dueAt: dsrDue("withdraw_consent", recv), createdBy: sale2U!.id,
  }).returning();
  await db.insert(dataRequestEvents).values({ requestId: dr!.id, action: "received", note: "Kênh: phone", userId: sale2U!.id, createdAt: recv });


  // ---- Tuyển dụng, hộp thư, nguồn giới thiệu, pilot chat (mẫu) ----
  const [job1] = await db.insert(jobPostings).values({
    code: `TD${today.slice(2, 4)}-001`, slug: `giao-vien-robotics-tieu-hoc-td${today.slice(2, 4)}-001`, title: "Giáo viên Robotics tiểu học", centerId: cs1!.id, department: "academic", employmentType: "part_time",
    openings: 2, salaryText: "180–250k/buổi", description: "Dạy lắp ráp và lập trình robot cho học sinh 6–10 tuổi theo giáo trình Sata Robo.\n\n- 6–10 buổi/tuần\n- Được đào tạo trước khi nhận lớp",
    requirements: "Sinh viên / tốt nghiệp khối kỹ thuật hoặc sư phạm, yêu trẻ.", benefits: "Thưởng theo đánh giá phụ huynh.", deadline: addDays(today, 30), status: "open", openedAt: h(72), createdBy: hrU!.id,
  }).returning();
  const cands = await db.insert(candidates).values([
    { jobId: job1!.id, fullName: "Ứng viên mẫu A", phone: "0987000001", phoneNormalized: "84987000001", source: "website", stage: "applied", consentAt: h(20) },
    { jobId: job1!.id, fullName: "Ứng viên mẫu B", phone: "0987000002", phoneNormalized: "84987000002", source: "facebook", stage: "screening", consentAt: h(50), ownerId: hrU!.id },
  ]).returning();
  await db.insert(candidateEvents).values(cands.map((c) => ({ candidateId: c.id, action: "applied", toStage: "applied" as const, note: "Nộp qua website" })));
  await db.insert(affiliates).values({ code: "PHAN01", name: "PH Mẫu giới thiệu", type: "parent", phone: "0911000002", centerId: cs1!.id, parentId: parentRows[1]!.id, rule: { kind: "fixed", value: 300000, cap: null }, payoutInfo: "Trừ vào học phí kỳ sau", createdBy: mgrU!.id });
  await db.update(leads).set({ referralCode: "PHAN01", source: "referral" }).where(eq(leads.id, leadRows[2]!.id));
  const [cv1] = await db.insert(conversations).values({
    channel: "portal", displayName: parentRows[0]!.fullName, centerId: cs1!.id, parentId: parentRows[0]!.id, teacherId: gv1!.id, assignedTo: sale1U!.id, status: "open",
    subject: "Tình hình học của con", portalTokenHash: "0".repeat(64), lastInboundAt: h(2), lastOutboundAt: h(26), lastMessageAt: h(2), waitingSince: h(2), lastPreview: "Cô ơi tuần sau con xin nghỉ 1 buổi ạ",
  }).returning();
  const [cv2] = await db.insert(conversations).values({
    channel: "messenger", externalId: "seedpsid0001", displayName: "Khách Facebook mẫu", centerId: cs1!.id, status: "open", subject: "Tin nhắn Facebook",
    lastInboundAt: h(3), lastMessageAt: h(3), waitingSince: h(3), lastPreview: "Trung tâm có lớp cho bé 7 tuổi không ạ?", flags: [],
  }).returning();
  await db.insert(messages).values([
    { conversationId: cv1!.id, direction: "out", body: "Chào chị, tuần này bé học rất tốt, đã lắp xong xe robot.", senderUserId: sale1U!.id, status: "sent", createdAt: h(26) },
    { conversationId: cv1!.id, direction: "in", body: "Cô ơi tuần sau con xin nghỉ 1 buổi ạ", status: "received", createdAt: h(2) },
    { conversationId: cv2!.id, direction: "in", body: "Trung tâm có lớp cho bé 7 tuổi không ạ?", externalId: "messenger:seedmid0001", status: "received", createdAt: h(3) },
  ]);
  await db.insert(appSettings).values({ key: "chat_pilot", value: { classIds: [classA!.id], startDate: addDays(today, -14), note: "Pilot tin nhắn PH lớp A (mẫu)" }, updatedBy: mgrU!.id });

  // ---- Hoá đơn điện tử: cấu hình mẫu (tắt; bật khi đã ký hợp đồng nhà cung cấp) ----
  await db.insert(appSettings).values({ key: "einvoice", value: { enabled: false, provider: "sandbox", templateCode: "1", serial: `1C${String(new Date().getFullYear()).slice(-2)}TSR`, sellerName: "Công ty mẫu Sata Robo (dữ liệu mẫu)", sellerTaxCode: "0100000000", sellerAddress: "Địa chỉ mẫu", courseRate: "KCT", goodsRate: "10", autoDraft: true, autoIssue: false, startDate: null, lookupUrl: "/tra-cuu-hoa-don" }, updatedBy: adminU!.id });

  // ---- Một ca nghỉ học mẫu (cho báo cáo churn / cohort) ----
  const [wd] = await db.insert(enrollments).values({ studentId: studentRows[10]!.id, classId: classA!.id, packageSessions: 24, status: "withdrawn", enrolledAt: d(40), endedAt: d(8), endReason: "Học phí cao so với gia đình (mẫu)", createdBy: mgrU!.id }).returning();
  await db.insert(enrollmentEvents).values([
    { enrollmentId: wd!.id, type: "created", toStatus: "active", actorId: mgrU!.id, createdAt: d(40) },
    { enrollmentId: wd!.id, type: "withdraw", fromStatus: "active", toStatus: "withdrawn", reason: "Học phí cao so với gia đình (mẫu)", actorId: mgrU!.id, createdAt: d(8) },
  ]);

  await db.insert(auditLog).values([
    { actorId: adminU!.id, action: "UPDATE", module: "system", entity: "admissions_settings", entityId: null, before: { maxTrialsPerLead: 1 }, after: { maxTrialsPerLead: 2 }, reason: "Cho phép học thử 2 buổi (mẫu)", createdAt: h(72) },
    { actorId: mgrU!.id, action: "TRANSITION", module: "academics", entity: "enrollments", entityId: enrollA[9]!.id, before: { status: "active" }, after: { status: "paused" }, reason: "Gia đình đi xa (dữ liệu mẫu)", createdAt: h(2) },
  ]);

  console.log(`✔ Seeded: 2 centers, 3 rooms, 7 users, 3 teachers, ${lessonRows.length} lessons, 2 classes, ${sessionRows.length} sessions, 16 students, ${leadRows.length} leads`);
  console.log("  Dev login (/login → tài khoản mẫu): superadmin@example.test | manager.cs1@example.test | sale1.cs1@example.test | ketoan.cs1@example.test | hr.cs1@example.test | daotao@example.test | marketing@example.test | teacher1@satarobo.vn");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
