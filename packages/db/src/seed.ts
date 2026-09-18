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
  courses, coursePackages, curricula, lessons, classes, classSchedules, sessions, enrollments, attendance, classEvents,
  enrollmentEvents, competencyCriteria, reportCards, reportCardScores, sessionMedia,
  leads, leadChildren, leadActivities, leadTasks, leadAssignees, admissionsSettings, trialBookings, auditLog,
  holidays, coursePrerequisites, teacherCourses, teacherEvaluations,
  paymentMethods, orders, orderItems, orderInstallments, orderEvents, payments, refunds, financeLedger,
  commissionRules, commissions, commissionPolicies, commissionPolicyShares, commissionPolicyTiers, paymentQrCodes, bankTransactions,
  staff, staffPrivate, staffPositions, positions, staffDeployments, workShifts, shiftTemplates, shiftAssignments, attendancePunches, staffRequests, checkinPoints,
  parentRequests, parentRequestEvents, parentFeedback, surveys, surveyInvites, surveyResponses, parentNotifications, careTasks,
  emailLogs, otpRequests, userGroups, userGroupMembers, webhookEvents, appSettings, revenueTargets,
  inventoryItems, kitComponents, stockLevels, stockMovements, stockCounters, rentals, rewardItems, coinRules, coinTransactions, redemptions,
  documents, assignmentTemplates, assignments, submissions, lessonProposals,
  posts, siteBlocks, campaigns, campaignSpends, trackEvents, consentRecords, dataRequests, dataRequestEvents,
  jobPostings, candidates, candidateEvents, conversations, messages, affiliates,
} from "./schema/index";
import { SHIFT_CATALOGUE, plannedMinutesOf, workSegments, COIN_RULE_DEFS } from "@satarobo/core";
import { generateSessions, buildClassCode, buildStudentCode, toISODate, addDays, orderCode, receiptNumber, packagePrice, buildInstallmentPlan, computeCommission, describeRule, periodOf, transferMemo, vietQrImageUrl, fmtMin, hhmm, weekdayOf, leaveDays, requestCode, slaDue, SETTINGS_DEFAULTS, CONSENT_TEXT_VERSION, dsrCode, dsrDue } from "@satarobo/core";
import { courseCompletions } from "./schema/index";
import {
  expectedEndDate as sessionsEndDate, detectRisks, staffCode, refundProposal, reportCardMilestones, averageScore, gradeFromAverage, certificateNumber,
  type Weekday, type AttendanceStatus, type Role, type ClassStatus, type LeadStatus,
} from "@satarobo/core";

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
      { centerId: cs1!.id, code: "101", name: "Phòng 101", capacity: 12, equipment: ["Máy chiếu", "Bảng trắng", "8 bộ kit Sata"] },
      { centerId: cs1!.id, code: "LAB1", name: "Lab 1", capacity: 10, equipment: ["TV 55\"", "10 laptop", "Máy in 3D"] },
      { centerId: cs2!.id, code: "P302", name: "Phòng 302", capacity: 12, equipment: ["TV 43\"", "Bảng trắng"] },
      { centerId: cs2!.id, code: "P303", name: "Phòng 303 (đang sửa điều hoà)", capacity: 10, equipment: ["Bảng trắng"], status: "maintenance" as const, isActive: false },
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
  const [sata4, sata6, sata1Row] = await db
    .insert(courses)
    .values([
      { code: "SATA4", name: "Sata4 — Bứt Phá Giới Hạn", slug: "sata4", gradeFrom: 3, gradeTo: 4, totalSessions: 48, listPrice: "9600000" },
      { code: "SATA6", name: "Sata6 — Chinh Phục AI", slug: "sata6", gradeFrom: 5, gradeTo: 6, totalSessions: 48, listPrice: "10800000" },
      { code: "SATA1", name: "Sata1 — Luyện thi RoboSim", slug: "sata1", gradeFrom: 3, gradeTo: 8, totalSessions: 12, listPrice: "3600000" },
    ])
    .returning();

  // ---- Gói bán cho khách (course_packages) ----
  await db.insert(coursePackages).values([
    { courseId: sata4!.id, code: "SATA4-48", name: "Sata4 trọn khoá 48 buổi", level: "Cơ bản", sessions: 48, listPrice: 9_600_000, salePrice: 8_640_000, description: "Học đủ 48 buổi, tặng bộ học cụ mang về (dữ liệu mẫu)", isFeatured: true, sortOrder: 1 },
    { courseId: sata4!.id, code: "SATA4-24", name: "Sata4 học phần 24 buổi", level: "Cơ bản", sessions: 24, listPrice: 4_992_000, description: "Đóng theo nửa khoá (dữ liệu mẫu)", sortOrder: 2 },
    { courseId: sata6!.id, code: "SATA6-48", name: "Sata6 trọn khoá 48 buổi", level: "Nâng cao", sessions: 48, listPrice: 10_800_000, salePrice: 9_990_000, description: "Chinh phục AI — trọn khoá (dữ liệu mẫu)", isFeatured: true, sortOrder: 1 },
    { courseId: sata1Row!.id, code: "SATA1-12", name: "Sata1 luyện thi 12 buổi", level: "Luyện thi", sessions: 12, listPrice: 3_600_000, description: "Gói luyện thi RoboSim ngắn hạn (dữ liệu mẫu)", sortOrder: 1 },
  ]);

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
  await db.insert(admissionsSettings).values({ centerId: cs1!.id, distributionMode: "round_robin", dedupeDays: 0, maxTrialsPerLead: 2, staleAfterDays: 7, updatedBy: adminU!.id });
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
    { code: "TM-CS1", name: "Tiền mặt tại CS1", kind: "cash", centerId: cs1!.id, allowFor: ["course", "product"], canBuyCourse: true, canBuyPackage: true, canBuyProduct: true, sortOrder: 1 },
    { code: "CK-VCB", name: "Chuyển khoản Vietcombank", kind: "bank_transfer", centerId: null, bankBin: "970436", bankName: "Vietcombank", bankBranch: "CN Đà Nẵng", accountNo: "0000000000", accountName: "CONG TY SATA ROBO (MAU)", allowFor: ["course", "product", "exam"], canBuyCourse: true, canBuyPackage: true, canBuyExam: true, canBuyProduct: true, sortOrder: 2, description: "Tài khoản mẫu — thay bằng tài khoản thật" },
    // Đủ loại như bản gốc: ví điện tử và thu hộ khi giao
    { code: "VI-MOMO", name: "Ví điện tử MoMo", kind: "wallet", centerId: null, allowFor: ["course", "product"], canBuyCourse: true, canBuyPackage: true, canBuyProduct: true, canDeposit: true, sortOrder: 3, description: "Ví điện tử — mẫu, chưa nối cổng thật" },
    { code: "COD", name: "Thu hộ khi giao (COD)", kind: "cod", centerId: null, allowFor: ["product"], canBuyProduct: true, sortOrder: 4, description: "Chỉ dùng cho đơn sản phẩm giao tận nơi" },
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
    await db.insert(orderItems).values({ orderId: o!.id, courseId: sata4!.id, description: `Học phí ${sata4!.code} — gói ${e.packageSessions} buổi`, quantity: 1, unitPrice: total, amount: total, netAmount: total, packageSessions: e.packageSessions, studentId: e.studentId, enrollmentId: e.id });
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
  // ---- Chính sách hoa hồng 4 trục (mẫu theo SR.QD.208 · PL04): tổng % mỗi sự kiện ≤ 9% ----
  const [polNew, polRenew, polTransfer, polDevice, polTitle] = await db.insert(commissionPolicies).values([
    {
      name: "Học viên mới — khoá học", event: "hoc_vien_moi", orderScope: "course", centerId: null, calcMethod: "percent",
      sourceRef: "SR.QD.208 · PL04 Điều 1", note: "Tổng 9%: TVV 5% + quản lý trung tâm 3% + quản lý vùng 1%",
      effectiveFrom: "2026-01-01", isActive: true, createdBy: adminU!.id,
    },
    {
      name: "Tái tục — khoá học", event: "tai_tuc", orderScope: "course", centerId: null, calcMethod: "percent",
      sourceRef: "SR.QD.208 · PL04 Điều 2", note: "Mức tái tục thấp hơn học viên mới",
      effectiveFrom: "2026-01-01", isActive: true, createdBy: adminU!.id,
    },
    {
      name: "Chuyển trung tâm — chi một lần cho nhân sự trung tâm cũ", event: "chuyen_trung_tam", orderScope: "all", centerId: null, calcMethod: "fixed",
      sourceRef: "SR.QD.208 · PL04 Điều 3", note: "Chi MỘT LẦN cho nhân sự trung tâm cũ, không chi lại ở kỳ sau",
      effectiveFrom: "2026-01-01", isActive: true, createdBy: adminU!.id,
    },
    {
      name: "Bán thiết bị — sản phẩm", event: "ban_thiet_bi", orderScope: "product", centerId: null, calcMethod: "fixed",
      sourceRef: "SR.QD.208 · PL04 Điều 4", effectiveFrom: "2026-01-01", isActive: true, createdBy: adminU!.id,
    },
    {
      name: "Thưởng danh hiệu TVV theo bậc doanh thu quý", event: "thuong_danh_hieu_tvv", orderScope: "all", centerId: null, calcMethod: "tier",
      sourceRef: "SR.QD.208 · PL04 Điều 5", note: "Bậc doanh thu không chồng lấn",
      effectiveFrom: "2026-01-01", isActive: true, createdBy: adminU!.id,
    },
  ]).returning();
  const policyShares = await db.insert(commissionPolicyShares).values([
    { policyId: polNew!.id, role: "CENTER_SALES_CSM", value: 500, sortOrder: 0 },
    { policyId: polNew!.id, role: "CENTER_MANAGER", value: 300, sortOrder: 1 },
    { policyId: polNew!.id, role: "REGION_MANAGER", value: 100, sortOrder: 2 },
    { policyId: polRenew!.id, role: "CENTER_SALES_CSM", value: 300, sortOrder: 0 },
    { policyId: polTransfer!.id, role: "CENTER_SALES_CSM", value: 500_000, sortOrder: 0 },
    { policyId: polDevice!.id, role: "CENTER_SALES_CSM", value: 100_000, maxAmount: 2_000_000, sortOrder: 0 },
    { policyId: polTitle!.id, role: "CENTER_SALES_CSM", value: 0, sortOrder: 0 },
  ]).returning();
  // Bậc doanh thu của vai TVV trong chính sách thưởng danh hiệu — các bậc không chồng lấn
  const shTitleTvv = policyShares.find((s) => s.policyId === polTitle!.id)!;
  await db.insert(commissionPolicyTiers).values([
    { shareId: shTitleTvv.id, fromAmount: 50_000_000, toAmount: 99_999_999, amount: 2_000_000, sortOrder: 0 },
    { shareId: shTitleTvv.id, fromAmount: 100_000_000, toAmount: 299_999_999, amount: 5_000_000, sortOrder: 1 },
    { shareId: shTitleTvv.id, fromAmount: 300_000_000, toAmount: null, percent: 200, sortOrder: 2 },
  ]);

  // ---- Mã QR chuyển khoản mẫu: một mã còn hiệu lực, một mã đã hết hạn ----
  const qrNow = Date.now();
  await db.insert(paymentQrCodes).values([
    {
      orderId: inst.order.id, paymentMethodId: pmBank!.id, amount: 3_200_000, content: transferMemo(inst.order.code),
      imageUrl: vietQrImageUrl({ bankBin: "970436", accountNo: "0000000000", accountName: "CONG TY SATA ROBO (MAU)", amount: 3_200_000, memo: transferMemo(inst.order.code) }),
      bankBin: "970436", accountNo: "0000000000", accountName: "CONG TY SATA ROBO (MAU)", bankName: "Vietcombank",
      status: "active", issuedBy: sale1U!.id, issuedAt: new Date(qrNow - 2 * 3600e3), expiresAt: new Date(qrNow + 22 * 3600e3),
    },
    {
      orderId: inst.order.id, paymentMethodId: pmBank!.id, amount: 3_200_000, content: transferMemo(inst.order.code),
      imageUrl: vietQrImageUrl({ bankBin: "970436", accountNo: "0000000000", accountName: "CONG TY SATA ROBO (MAU)", amount: 3_200_000, memo: transferMemo(inst.order.code) }),
      bankBin: "970436", accountNo: "0000000000", accountName: "CONG TY SATA ROBO (MAU)", bankName: "Vietcombank",
      status: "expired", issuedBy: sale1U!.id, issuedAt: new Date(qrNow - 3 * 86400e3), expiresAt: new Date(qrNow - 2 * 86400e3),
    },
  ]);

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
  // Danh mục mã ca gốc (dùng chung — Hội sở giữ)
  const shiftRows = await db.insert(workShifts).values(
    SHIFT_CATALOGUE.map((sh, i) => ({
      centerId: null, code: sh.code, name: sh.name, kind: sh.kind, units: sh.units, segments: sh.segments,
      plannedMinutes: plannedMinutesOf(sh.segments), workplace: sh.workplace,
      workplaceCenterId: sh.fixedCenterCode === "CS1" ? cs1!.id : sh.fixedCenterCode === "CS2" ? cs2!.id : null,
      punchRequired: sh.punchRequired, sortOrder: i, isActive: true,
    })),
  ).returning();
  const shiftByCode = new Map(shiftRows.map((r) => [r.code, r]));
  const shHC = shiftByCode.get("HC")!;
  const shC = shiftByCode.get("CS")!;
  await db.insert(checkinPoints).values([
    { centerId: cs1!.id, name: "Quầy lễ tân CS1", lat: 16.0336, lng: 108.2212, radiusM: 100, geofenceEnabled: true, keyVersion: 1, createdBy: adminU!.id },
    { centerId: cs2!.id, name: "Quầy lễ tân CS2", lat: 16.0678, lng: 108.2208, radiusM: 100, geofenceEnabled: true, keyVersion: 1, createdBy: adminU!.id },
  ]);
  const [posMgr] = await db.insert(positions).values([
    { centerId: cs1!.id, name: "Quản lý cơ sở 1", department: "management", roles: ["CENTER_MANAGER"] as Role[], isManager: true, createdBy: adminU!.id },
    { centerId: cs1!.id, name: "Nhân sự cơ sở 1", department: "hr", roles: ["CENTER_HR"] as Role[], isManager: false, createdBy: adminU!.id },
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
    ...staffDefs.map((d, i) => ({ staffId: staffRows[i]!.id, centerId: cs1!.id, positionId: i === 0 ? posMgr!.id : null, title: d.title, department: d.department, kind: "primary" as const, effectiveFrom: d.hiredAt, createdBy: adminU!.id })),
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
      if (wd === 7 || (d.shift.id === shC.id && wd === 1)) continue;
      const segs = workSegments(d.shift.segments ?? []);
      const segStart = segs[0]?.from ?? 480;
      const segEnd = segs[segs.length - 1]?.to ?? 1020;
      asg.push({ staffId: st.id, date: day, shiftId: d.shift.id, centerId: cs1!.id, origin: "template" as const, createdBy: hrU!.id });
      if (k >= 0 || absent.get(st.id) === day) continue;
      const jitter = (i * 7 + k * 3 + 30) % 9;
      let inMin = segStart - jitter;
      if (st.id === stSale1!.id && k === -3) inMin = segStart + 25;
      punches.push({ staffId: st.id, centerId: cs1!.id, kind: "in", at: at(day, inMin), source: "qr", lat: 16.0336, lng: 108.2213, accuracyM: 15, distanceM: 11, flags: [], createdBy: d.u.id });
      if (st.id === stSale2!.id && k === -2) continue;
      punches.push({ staffId: st.id, centerId: cs1!.id, kind: "out", at: at(day, segEnd + ((jitter * 2) % 15)), source: "qr", lat: 16.0337, lng: 108.2212, accuracyM: 20, distanceM: 9, flags: [], createdBy: d.u.id });
    }
  });
  await db.insert(shiftAssignments).values(asg);
  await db.insert(attendancePunches).values(punches);
  await db.insert(staffRequests).values([
    { staffId: stHr!.id, centerId: cs1!.id, kind: "leave", status: "approved", dateFrom: addDays(today, -5), dateTo: addDays(today, -5), portion: "full", leaveType: "annual", leavePaid: true, days: 1, reason: "Việc gia đình (mẫu)", effectPreview: "HC → P", appliedAt: new Date(), decidedBy: mgrU!.id, decidedAt: new Date(), createdBy: hrU!.id },
    { staffId: stSale1!.id, centerId: cs1!.id, kind: "late_early", status: "pending", dateFrom: addDays(today, -3), dateTo: addDays(today, -3), lateEarlyKind: "late", atTime: "08:25", lateSubmission: true, effectPreview: "Đi muộn 08:25 — bỏ qua cờ", reason: "Kẹt xe do mưa lớn (mẫu)", createdBy: sale1U!.id },
    { staffId: stSale2!.id, centerId: cs1!.id, kind: "timesheet_fix", status: "pending", dateFrom: addDays(today, -2), dateTo: addDays(today, -2), punchOut: "17:10", lateSubmission: true, effectPreview: "Thêm mốc ra 17:10", reason: "Quên chấm ra do điện thoại hết pin (mẫu)", createdBy: sale2U!.id },
    { staffId: stKt!.id, centerId: cs1!.id, kind: "leave", status: "pending", dateFrom: addDays(today, 3), dateTo: addDays(today, 4), portion: "full", leaveType: "annual", leavePaid: true, days: leaveDays(addDays(today, 3), addDays(today, 4), "full"), effectPreview: "HC → P", reason: "Về quê (mẫu)", createdBy: ktU!.id },
    { staffId: stGv1!.id, centerId: cs1!.id, kind: "sub_teach", status: "pending", dateFrom: addDays(today, 2), dateTo: addDays(today, 2), effectPreview: "chờ chỉ định người dạy thay", reason: "Bận việc gia đình, nhờ dạy thay (mẫu)", createdBy: t1U!.id },
  ]);
  await db.insert(shiftTemplates).values(staffDefs.flatMap((d, i) => [1, 2, 3, 4, 5, 6].map((wd) => ({ centerId: cs1!.id, staffId: staffRows[i]!.id, weekday: wd, shiftId: d.shift.id, createdBy: hrU!.id }))));
  await db.insert(staffDeployments).values({ staffId: stGv1!.id, centerId: cs2!.id, effectiveFrom: addDays(today, -3), effectiveTo: addDays(today, 27), reason: "Điều động hỗ trợ dạy tại CS2 (mẫu)", createdBy: adminU!.id });

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
  await db.insert(coinRules).values(
    (Object.keys(COIN_RULE_DEFS) as (keyof typeof COIN_RULE_DEFS)[]).map((code) => ({
      code, description: COIN_RULE_DEFS[code].label, coins: COIN_RULE_DEFS[code].coins, condition: COIN_RULE_DEFS[code].condition,
      isActive: code !== "BIRTHDAY", updatedBy: mgrU!.id,
    })),
  );
  const coinPlan: [number, number, "attendance" | "homework" | "competition" | "behavior"][] =[[0, 30, "attendance"], [0, 20, "homework"], [0, 100, "competition"], [1, 40, "attendance"], [1, 15, "behavior"], [2, 25, "attendance"], [3, 10, "homework"]];
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

  // ---- Khối lượng demo (mặc định bật; SEED_VOLUME=small để chỉ giữ dữ liệu mẫu tối thiểu) ----
  if (process.env.SEED_VOLUME !== "small") {
    await seedDemoVolume({
      cs1: cs1!, cs2: cs2!, adminU: adminU!, mgrU: mgrU!, ktU: ktU!, hrU: hrU!, sale1U: sale1U!, sale2U: sale2U!, t1U: t1U!, t2U: t2U!, t3U: t3U!,
      gv1: gv1!, gv2: gv2!, gv3: gv3!, sata4: sata4!, sata6: sata6!, sata1, cur4Id: cur4!.id, lessons4: lessonRows, crit4Ids: crit4.map((c) => c.id),
      busyRules: [...rulesA, ...rulesB, { weekday: 6, startTime: "08:00", endTime: "09:30", roomId: roomRows[1]!.id, teacherId: gv3!.id }],
      usedClassCodes: [classA!.code, classB!.code, classC!.code], usedStudentCodes: studentRows.map((st) => st.code),
      existingStaffCount: staffRows.length, pmCashCS1Id: pmCash!.id, pmBankId: pmBank!.id, shHC: shHC!, shC1: shC!, saleRule: saleRule!,
      seq: { order: orderSeq, receiptCS1: receiptSeq, request: reqSeq }, holidayDates: { global: [monday], cs1: [addDays(monday, 1)] },
    });
  }

  console.log(`✔ Seeded: 2 centers, 3 rooms, 7 users, 3 teachers, ${lessonRows.length} lessons, 2 classes, ${sessionRows.length} sessions, 16 students, ${leadRows.length} leads`);
  console.log("  Dev login (/login → tài khoản mẫu): superadmin@example.test | manager.cs1@example.test | sale1.cs1@example.test | ketoan.cs1@example.test | hr.cs1@example.test | daotao@example.test | marketing@example.test | teacher1@satarobo.vn");
}

/* ============================================================================
 * KHỐI LƯỢNG DEMO — dữ liệu GIẢ đủ lớn để đánh giá nghiệp vụ (không phải người thật).
 * Chạy sau phần seed cơ bản; tắt bằng SEED_VOLUME=small. PRNG cố định → chạy lại ra cùng dữ liệu.
 * SĐT giả dải 0900 1xx xxx (chuẩn hoá 849001xxxxx); nhân sự 0900 3xx xxx; email @example.test.
 * ========================================================================== */

type CenterRow = typeof centers.$inferSelect;
type UserRow = typeof users.$inferSelect;
type TeacherRow = typeof teachers.$inferSelect;
type CourseRow = typeof courses.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;
type ShiftRow = typeof workShifts.$inferSelect;
type CommissionRuleRow = typeof commissionRules.$inferSelect;
type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rInt(r: Rng, a: number, b: number): number {
  return a + Math.floor(r() * (b - a + 1));
}
function rPick<T>(r: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("rPick: danh sách rỗng");
  return arr[Math.floor(r() * arr.length)]!;
}
function rWeighted<T>(r: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, it) => s + it[1], 0);
  let v = r() * total;
  for (const it of items) {
    v -= it[1];
    if (v < 0) return it[0];
  }
  const last = items[items.length - 1];
  if (!last) throw new Error("rWeighted: danh sách rỗng");
  return last[0];
}
function rShuffle<T>(r: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}
/** UUID dạng v4 sinh từ PRNG (tái lập được) */
function uuidFrom(r: Rng): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(r() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
/** Chèn theo lô để không vượt giới hạn tham số của Postgres */
async function inChunks<T>(rows: readonly T[], fn: (part: T[]) => PromiseLike<unknown>, size = 400): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}
const vnAt = (date: string, hm: string) => new Date(`${date}T${hm.slice(0, 5)}:00+07:00`);
const vnDate = (d: Date) => toISODate(new Date(d.getTime() + 7 * 3600e3));
const courseTitle = (code: string) => `Sata${code.slice(4)}`;
const WD_VI: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };

const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đoàn", "Trương", "Mai", "Lương"];
const DEM_NAM = ["Văn", "Minh", "Quốc", "Gia", "Đức", "Hoàng", "Anh", "Bảo", "Nhật", "Thành", "Hữu", "Trọng"];
const DEM_NU = ["Thị", "Ngọc", "Thu", "Minh", "Bảo", "Khánh", "Phương", "Mai", "Gia", "Thanh", "Hoài", "Diệu"];
const TEN_NAM = ["An", "Bảo", "Khang", "Phúc", "Huy", "Khôi", "Nam", "Quân", "Minh", "Duy", "Long", "Tuấn", "Đăng", "Kiên", "Lâm", "Hải", "Phong", "Tín", "Vinh", "Hưng", "Sơn", "Thịnh", "Nhân", "Đạt"];
const TEN_NU = ["Anh", "Chi", "Hân", "Linh", "My", "Ngân", "Nhi", "Thảo", "Trang", "Vy", "Yến", "Hà", "Quyên", "Tâm", "Uyên", "Lan", "Như", "Diệp", "Khuê", "Mai", "Ngọc", "Hương", "Giang", "Trâm"];
const QUAN = ["Hải Châu", "Thanh Khê", "Sơn Trà", "Ngũ Hành Sơn", "Cẩm Lệ", "Liên Chiểu", "Hoà Vang"];
const NICKS = ["Bin", "Bống", "Su", "Tôm", "Cún", "Na", "Bơ", "Mít", "Gạo", "Sóc", "Ken", "Bi"];
const HEALTH = ["Dị ứng hải sản", "Hen suyễn nhẹ — mang theo thuốc xịt", "Cận thị, cần ngồi bàn đầu", "Dị ứng phấn hoa"];
const TOPICS: Record<string, string[]> = {
  SATA2: ["Robot là gì? Làm quen bộ kit", "Bánh răng và chuyển động", "Lắp xe ô tô đầu tiên", "Lập trình kéo thả: tiến – lùi", "Đèn LED và âm thanh", "Cảm biến chạm", "Robot vẽ hình", "Vòng lặp đơn giản", "Robot chú chó con", "Robot né vật cản đơn giản", "Thử thách mê cung", "Trưng bày sản phẩm"],
  SATA6: ["Ôn tập Sata4 & an toàn lab", "Cảm biến màu và phân loại", "Biến và phép so sánh", "Điều khiển PID cơ bản", "Robot dò line tốc độ", "Camera AI: nhận diện màu", "Nhận diện khuôn mặt đơn giản", "Robot trợ lý giọng nói", "Dự án: xe tự hành", "Tối ưu thuật toán", "Luyện đề sa hình", "Thuyết trình dự án AI"],
  SATA8: ["Làm quen Python", "Biến, kiểu dữ liệu, vòng lặp", "Hàm và module", "Điều khiển động cơ bằng Python", "Đọc cảm biến qua cổng I/O", "Xử lý ảnh với thư viện mở", "Học máy: phân loại đơn giản", "Robot bám đối tượng", "Giao tiếp không dây", "Dự án nhóm: nhà thông minh", "Kiểm thử & gỡ lỗi", "Bảo vệ dự án cuối khoá"],
  SATA1: ["Luật thi RoboSim", "Mô phỏng sa hình 1", "Chiến thuật di chuyển", "Tối ưu thời gian", "Mô phỏng sa hình 2", "Xử lý tình huống", "Thi thử vòng 1", "Chữa đề vòng 1", "Mô phỏng sa hình 3", "Thi thử vòng 2", "Chữa đề vòng 2", "Tổng duyệt trước thi"],
};
const SESSION_NOTES = [
  "Lớp học tốt, các con hoàn thành mục tiêu buổi.",
  "Các con hào hứng, nhóm nào cũng chạy được mô hình.",
  "Một số bạn còn chậm phần lập trình, tuần sau ôn lại.",
  "Buổi học đúng tiến độ, đã giao bài tập về nhà.",
  "Lớp sôi nổi, cần nhắc giữ trật tự khi thực hành.",
  "Hoàn thành dự án nhỏ, các con tự thuyết trình sản phẩm.",
];
const REMARKS = ["Con tập trung, lắp nhanh", "Chủ động hỏi bài", "Cần cẩn thận khi đi dây", "Giúp bạn cùng nhóm tốt", "Hôm nay hơi mất tập trung", "Lập trình đúng ngay lần đầu", "Tiến bộ rõ so với tuần trước", "Cần luyện thêm phần vòng lặp"];
const ABSENT_NOTES = ["PH báo con ốm", "Gia đình có việc", "Con đi thi ở trường", "PH xin nghỉ qua Zalo"];
const END_REASONS = ["Gia đình chuyển nhà xa (mẫu)", "Lịch học trùng lịch học thêm ở trường (mẫu)", "Học phí chưa phù hợp (mẫu)", "Con chưa hứng thú (mẫu)", "Chuyển sang học bơi hè (mẫu)"];
const LOST_REASONS = ["Chọn trung tâm gần nhà", "Học phí cao", "Không liên lạc được", "Lịch học không phù hợp", "Con còn nhỏ, để năm sau", "Đã đăng ký nơi khác"];
const CALL_OK = ["Đã gọi, PH quan tâm khoá học cho con", "Gọi tư vấn lộ trình, PH hỏi lịch khai giảng", "PH hỏi học phí và lịch học cuối tuần", "Đã tư vấn qua điện thoại 10 phút"];
const CALL_MISS = ["Không nghe máy", "Thuê bao tạm thời không liên lạc được", "PH bận, hẹn gọi lại"];
const MSGS = ["Gửi lịch khai giảng qua Zalo", "Gửi học phí và ưu đãi tháng này", "Gửi video lớp học mẫu", "Nhắn nhắc lịch học thử"];
const NOTES_LEAD = ["PH muốn con học cuối tuần", "PH hỏi có xe đưa đón không", "Con thích lắp ráp, đã học Scratch ở trường", "PH cần bàn thêm với gia đình"];
const RC_COMMENTS = [
  "Con tiếp thu nhanh, chủ động hỏi bài và hỗ trợ bạn cùng nhóm khi lắp ráp.",
  "Con tiến bộ rõ ở phần lập trình, cần rèn thêm tính cẩn thận khi đi dây.",
  "Con tập trung tốt, hoàn thành đầy đủ bài tập và thuyết trình tự tin.",
  "Con còn rụt rè khi làm việc nhóm nhưng kỹ năng lắp ráp rất chắc chắn.",
  "Con sáng tạo, thường đề xuất cải tiến mô hình; cần quản lý thời gian tốt hơn.",
];
const FEEDBACK_GOOD = ["Con về kể rất hào hứng", "Thầy cô nhiệt tình, con tiến bộ", "Lớp học vui, con thích đi học", "Cảm ơn trung tâm đã gửi nhận xét chi tiết"];
const FEEDBACK_BAD = ["Lớp tan muộn 10 phút", "Phòng học hơi nóng", "Con chưa theo kịp phần lập trình", "Muốn được báo trước khi đổi giáo viên"];

interface DemoCtx {
  cs1: CenterRow;
  cs2: CenterRow;
  adminU: UserRow;
  mgrU: UserRow;
  ktU: UserRow;
  hrU: UserRow;
  sale1U: UserRow;
  sale2U: UserRow;
  t1U: UserRow;
  t2U: UserRow;
  t3U: UserRow;
  gv1: TeacherRow;
  gv2: TeacherRow;
  gv3: TeacherRow;
  sata4: CourseRow;
  sata6: CourseRow;
  sata1: CourseRow;
  cur4Id: string;
  lessons4: LessonRow[];
  crit4Ids: string[];
  busyRules: { weekday: number; startTime: string; endTime: string; roomId: string | null; teacherId: string | null }[];
  usedClassCodes: string[];
  usedStudentCodes: (string | null)[];
  existingStaffCount: number;
  pmCashCS1Id: string;
  pmBankId: string;
  shHC: ShiftRow;
  shC1: ShiftRow;
  saleRule: CommissionRuleRow;
  seq: { order: number; receiptCS1: number; request: number };
  holidayDates: { global: string[]; cs1: string[] };
}

type EnrStatus = "trial" | "active" | "paused" | "completed" | "withdrawn";
type SessStatus = "scheduled" | "attendance_done" | "completed";
type LeadActType = "note" | "call" | "message" | "status_change" | "assignment" | "trial_booked" | "task_done" | "system";

async function seedDemoVolume(x: DemoCtx): Promise<void> {
  const t0 = Date.now();
  const rng = mulberry32(20260917);
  const idRng = mulberry32(0x5a7a0b0);
  const uid = () => uuidFrom(idRng);
  const int = (a: number, b: number) => rInt(rng, a, b);
  const chance = (p: number) => rng() < p;
  function pick<T>(arr: readonly T[]): T {
    return rPick(rng, arr);
  }
  function weighted<T>(items: readonly (readonly [T, number])[]): T {
    return rWeighted(rng, items);
  }
  const now = Date.now();
  const today = vnDate(new Date(now));
  const yr = Number(today.slice(0, 4));
  const syStart = Number(today.slice(5, 7)) >= 9 ? yr : yr - 1; // năm học hiện tại
  const ago = (hours: number) => new Date(now - hours * 3600e3);
  const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60e3);
  /** Mốc sau `after` một khoảng ngẫu nhiên, không vượt quá hiện tại (giữ thứ tự tăng dần) */
  const later = (after: Date, minM: number, maxM: number) => {
    const t = after.getTime() + int(minM, maxM) * 60e3;
    return new Date(Math.max(after.getTime() + 1000, Math.min(t, now - 60e3)));
  };
  const notFuture = (d: Date) => (d.getTime() > now - 60e3 ? new Date(now - int(2, 40) * 60e3) : d);
  const minISO = (a: string, b: string) => (a < b ? a : b);
  const maxISO = (a: string, b: string) => (a > b ? a : b);
  const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");
  const hm = () => `${String(int(8, 20)).padStart(2, "0")}:${pick(["05", "10", "20", "30", "40", "50"])}`;
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => {
    counts[k] = (counts[k] ?? 0) + n;
  };
  const { cs1, cs2 } = x;
  const ccOf = (centerId: string) => (centerId === cs1.id ? "CS1" : "CS2");

  /* ---------------- Khoá học bổ sung, giáo trình, tiêu chí học bạ ---------------- */
  interface CourseInfo {
    id: string;
    code: string;
    listPrice: number;
    totalSessions: number;
    gradeFrom: number;
    gradeTo: number;
    curriculumId: string;
    lessonIds: string[];
    titles: string[];
    criteriaIds: string[];
    nextCourseId: string | null;
  }
  const sata2Id = uid();
  const sata8Id = uid();
  await db.insert(courses).values([
    { id: sata2Id, code: "SATA2", name: "Sata2 — Khám Phá Robot", slug: "sata2", gradeFrom: 1, gradeTo: 2, totalSessions: 48, listPrice: "8400000", nextCourseId: x.sata4.id, level: "Cơ bản", description: "Lắp ráp và lập trình kéo thả cho học sinh lớp 1–2 (dữ liệu mẫu)" },
    { id: sata8Id, code: "SATA8", name: "Sata8 — Lập Trình Python & AI", slug: "sata8", gradeFrom: 7, gradeTo: 9, totalSessions: 48, listPrice: "12000000", level: "Nâng cao", description: "Python, cảm biến và AI cơ bản cho THCS (dữ liệu mẫu)" },
  ]);
  await db.update(courses).set({ nextCourseId: sata8Id }).where(eq(courses.id, x.sata6.id));
  bump("courses", 2);
  const crit6 = await db.select({ id: competencyCriteria.id }).from(competencyCriteria).where(eq(competencyCriteria.courseId, x.sata6.id));
  const CRIT = ["Tư duy lập trình", "Lắp ráp & cơ khí", "Giải quyết vấn đề", "Làm việc nhóm"];
  const courseDefs: { id: string; code: string; listPrice: number; totalSessions: number; gradeFrom: number; gradeTo: number; next: string | null; lessons: number; criteria: string[] | null }[] = [
    { id: sata2Id, code: "SATA2", listPrice: 8_400_000, totalSessions: 48, gradeFrom: 1, gradeTo: 2, next: x.sata4.id, lessons: 24, criteria: null },
    { id: x.sata6.id, code: "SATA6", listPrice: Number(x.sata6.listPrice), totalSessions: x.sata6.totalSessions, gradeFrom: 5, gradeTo: 6, next: sata8Id, lessons: 24, criteria: crit6.map((c) => c.id) },
    { id: sata8Id, code: "SATA8", listPrice: 12_000_000, totalSessions: 48, gradeFrom: 7, gradeTo: 9, next: null, lessons: 24, criteria: null },
    { id: x.sata1.id, code: "SATA1", listPrice: Number(x.sata1.listPrice), totalSessions: x.sata1.totalSessions, gradeFrom: 3, gradeTo: 8, next: null, lessons: 12, criteria: null },
  ];
  const courseInfo = new Map<string, CourseInfo>();
  const curIns: (typeof curricula.$inferInsert)[] = [];
  const lessonIns: (typeof lessons.$inferInsert)[] = [];
  const critIns: (typeof competencyCriteria.$inferInsert)[] = [];
  for (const c of courseDefs) {
    const curriculumId = uid();
    curIns.push({ id: curriculumId, courseId: c.id, name: `${courseTitle(c.code)} v1 (2026)`, status: "active", description: "Giáo trình chuẩn (dữ liệu mẫu)", createdBy: x.adminU.id });
    const pool = TOPICS[c.code] ?? [];
    const lessonIds: string[] = [];
    const titles: string[] = [];
    for (let i = 1; i <= c.lessons; i++) {
      const base = pool[(i - 1) % Math.max(1, pool.length)] ?? `Bài ${i}`;
      const title = i <= pool.length ? base : `${base} — nâng cao`;
      const lessonId = uid();
      lessonIds.push(lessonId);
      titles.push(title);
      lessonIns.push({ id: lessonId, curriculumId, sequenceNo: i, title, objectives: `Hoàn thành mục tiêu: ${title.toLowerCase()}`, materials: `Bộ kit ${courseTitle(c.code)}`, isReportCardMilestone: [5, 12, 17, 24].includes(i) });
    }
    let criteriaIds = c.criteria;
    if (!criteriaIds) {
      const ids = CRIT.map(() => uid());
      CRIT.forEach((name, k) => {
        critIns.push({ id: ids[k]!, courseId: c.id, name, sortOrder: k + 1 });
      });
      criteriaIds = ids;
    }
    courseInfo.set(c.code, { id: c.id, code: c.code, listPrice: c.listPrice, totalSessions: c.totalSessions, gradeFrom: c.gradeFrom, gradeTo: c.gradeTo, curriculumId, lessonIds, titles, criteriaIds, nextCourseId: c.next });
  }
  const l4 = [...x.lessons4].sort((a, b) => a.sequenceNo - b.sequenceNo);
  courseInfo.set("SATA4", {
    id: x.sata4.id, code: "SATA4", listPrice: Number(x.sata4.listPrice), totalSessions: x.sata4.totalSessions, gradeFrom: 3, gradeTo: 4,
    curriculumId: x.cur4Id, lessonIds: l4.map((l) => l.id), titles: l4.map((l) => l.title), criteriaIds: x.crit4Ids, nextCourseId: x.sata6.id,
  });
  await db.insert(curricula).values(curIns);
  await inChunks(lessonIns, (p) => db.insert(lessons).values(p));
  await db.insert(competencyCriteria).values(critIns);
  bump("curricula", curIns.length);
  bump("lessons", lessonIns.length);
  const course = (code: string): CourseInfo => {
    const c = courseInfo.get(code);
    if (!c) throw new Error(`Thiếu khoá ${code}`);
    return c;
  };
  const courseIdByCode = (code: string) => course(code).id;

  /* ---------------- Nhân sự: tư vấn, giáo vụ, kế toán, quản lý CS2, GV, trợ giảng ---------------- */
  type Dept = "sales" | "academic" | "accounting" | "operations" | "management";
  interface PersonDef {
    key: string;
    email: string;
    name: string;
    role: Role;
    center: CenterRow;
    dept: Dept;
    title: string;
    hiredAt: string;
    status: "active" | "probation";
    employment: "full_time" | "part_time";
    teacher?: { grade: string; contract: "full_time" | "part_time" | "collaborator"; courses: string[]; maxLoad: number };
  }
  const ALL4 = ["SATA2", "SATA4", "SATA6", "SATA8"];
  const people: PersonDef[] = [
    { key: "sale3", email: "sale3.cs1@example.test", name: "Tư vấn Thảo (mẫu)", role: "CENTER_SALES_CSM", center: cs1, dept: "sales", title: "Tư vấn viên", hiredAt: "2025-11-03", status: "active", employment: "full_time" },
    { key: "sale4", email: "sale4.cs1@example.test", name: "Tư vấn Quân (mẫu)", role: "CENTER_SALES_CSM", center: cs1, dept: "sales", title: "Tư vấn viên", hiredAt: "2026-08-03", status: "probation", employment: "full_time" },
    { key: "gvu1", email: "giaovu.cs1@example.test", name: "Giáo vụ CS1 (mẫu)", role: "CENTER_CLASS_MANAGER", center: cs1, dept: "operations", title: "Giáo vụ", hiredAt: "2025-06-16", status: "active", employment: "full_time" },
    { key: "mgr2", email: "manager.cs2@example.test", name: "Quản lý CS2 (mẫu)", role: "CENTER_MANAGER", center: cs2, dept: "management", title: "Quản lý cơ sở", hiredAt: "2025-04-01", status: "active", employment: "full_time" },
    { key: "sale5", email: "sale1.cs2@example.test", name: "Tư vấn Vy (mẫu)", role: "CENTER_SALES_CSM", center: cs2, dept: "sales", title: "Tư vấn viên", hiredAt: "2025-10-06", status: "active", employment: "full_time" },
    { key: "sale6", email: "sale2.cs2@example.test", name: "Tư vấn Khang (mẫu)", role: "CENTER_SALES_CSM", center: cs2, dept: "sales", title: "Tư vấn viên", hiredAt: "2026-03-02", status: "active", employment: "full_time" },
    { key: "gvu2", email: "giaovu.cs2@example.test", name: "Giáo vụ CS2 (mẫu)", role: "CENTER_CLASS_MANAGER", center: cs2, dept: "operations", title: "Giáo vụ", hiredAt: "2025-09-08", status: "active", employment: "full_time" },
    { key: "kt2", email: "ketoan.cs2@example.test", name: "Kế toán CS2 (mẫu)", role: "CENTER_ACCOUNTANT", center: cs2, dept: "accounting", title: "Kế toán", hiredAt: "2025-07-01", status: "active", employment: "full_time" },
    { key: "t4", email: "teacher4@example.test", name: "GV Phong (mẫu)", role: "TEACHER", center: cs1, dept: "academic", title: "Giáo viên chính", hiredAt: "2025-02-17", status: "active", employment: "full_time", teacher: { grade: "senior", contract: "full_time", courses: ["SATA2", "SATA4"], maxLoad: 16 } },
    { key: "t5", email: "teacher5@example.test", name: "GV Ngân (mẫu)", role: "TEACHER", center: cs1, dept: "academic", title: "Giáo viên", hiredAt: "2025-08-11", status: "active", employment: "part_time", teacher: { grade: "advanced", contract: "part_time", courses: ["SATA6", "SATA8"], maxLoad: 12 } },
    { key: "t6", email: "teacher6@example.test", name: "GV Tuấn (mẫu)", role: "TEACHER", center: cs1, dept: "academic", title: "Giáo viên chính", hiredAt: "2024-09-09", status: "active", employment: "full_time", teacher: { grade: "expert", contract: "full_time", courses: ["SATA8", "SATA6", "SATA1"], maxLoad: 14 } },
    { key: "t7", email: "teacher7@example.test", name: "GV Hà (mẫu)", role: "TEACHER", center: cs2, dept: "academic", title: "Giáo viên chính", hiredAt: "2025-03-03", status: "active", employment: "full_time", teacher: { grade: "advanced", contract: "full_time", courses: ["SATA4", "SATA2"], maxLoad: 16 } },
    { key: "t8", email: "teacher8@example.test", name: "GV Duy (mẫu)", role: "TEACHER", center: cs2, dept: "academic", title: "Giáo viên", hiredAt: "2026-01-05", status: "active", employment: "part_time", teacher: { grade: "junior", contract: "part_time", courses: ["SATA2", "SATA8"], maxLoad: 10 } },
    { key: "t9", email: "teacher9@example.test", name: "GV Linh (mẫu)", role: "TEACHER", center: cs2, dept: "academic", title: "Giáo viên", hiredAt: "2026-07-20", status: "probation", employment: "part_time", teacher: { grade: "advanced", contract: "collaborator", courses: ["SATA6", "SATA2"], maxLoad: 8 } },
    { key: "a1", email: "trogiang1.cs1@example.test", name: "TG Nhi (mẫu)", role: "ASSISTANT_TEACHER", center: cs1, dept: "academic", title: "Trợ giảng", hiredAt: "2026-02-02", status: "active", employment: "part_time", teacher: { grade: "intern", contract: "part_time", courses: ALL4, maxLoad: 12 } },
    { key: "a2", email: "trogiang2.cs1@example.test", name: "TG Khôi (mẫu)", role: "ASSISTANT_TEACHER", center: cs1, dept: "academic", title: "Trợ giảng", hiredAt: "2026-05-18", status: "active", employment: "part_time", teacher: { grade: "intern", contract: "part_time", courses: ALL4, maxLoad: 12 } },
    { key: "a3", email: "trogiang1.cs2@example.test", name: "TG My (mẫu)", role: "ASSISTANT_TEACHER", center: cs2, dept: "academic", title: "Trợ giảng", hiredAt: "2026-03-09", status: "active", employment: "part_time", teacher: { grade: "intern", contract: "part_time", courses: ALL4, maxLoad: 12 } },
    { key: "a4", email: "trogiang2.cs2@example.test", name: "TG Bảo (mẫu)", role: "ASSISTANT_TEACHER", center: cs2, dept: "academic", title: "Trợ giảng", hiredAt: "2026-08-24", status: "probation", employment: "part_time", teacher: { grade: "intern", contract: "part_time", courses: ALL4, maxLoad: 12 } },
  ];
  interface TeacherLite {
    id: string;
    userId: string | null;
    centerId: string;
  }
  const userIdOf = new Map<string, string>();
  const userName = new Map<string, string>([
    [x.adminU.id, x.adminU.fullName], [x.mgrU.id, x.mgrU.fullName], [x.ktU.id, x.ktU.fullName], [x.hrU.id, x.hrU.fullName], [x.sale1U.id, x.sale1U.fullName], [x.sale2U.id, x.sale2U.fullName],
  ]);
  const teacherOf = new Map<string, TeacherLite>([
    ["gv1", { id: x.gv1.id, userId: x.t1U.id, centerId: cs1.id }],
    ["gv2", { id: x.gv2.id, userId: x.t2U.id, centerId: cs2.id }],
    ["gv3", { id: x.gv3.id, userId: x.t3U.id, centerId: cs1.id }],
  ]);
  const userIns: (typeof users.$inferInsert)[] = [];
  const roleIns: (typeof userRoles.$inferInsert)[] = [];
  const teacherIns: (typeof teachers.$inferInsert)[] = [];
  const tcIns: (typeof teacherCourses.$inferInsert)[] = [];
  const staffIns: (typeof staff.$inferInsert)[] = [];
  const posIns: (typeof staffPositions.$inferInsert)[] = [];
  type HrKind = "office" | "teacher" | "assistant";
  const hrPeople: { staffId: string; userId: string; centerId: string; kind: HrKind }[] = [];
  let staffSeq = x.existingStaffCount;
  let teacherSeq = 3;
  people.forEach((p, i) => {
    const userId = uid();
    const phone = `090030${String(i + 1).padStart(4, "0")}`;
    userIdOf.set(p.key, userId);
    userName.set(userId, p.name);
    userIns.push({ id: userId, email: p.email, fullName: p.name, phone, lastLoginAt: ago(int(1, 96)), createdAt: vnAt(p.hiredAt, "08:30") });
    roleIns.push({ userId, role: p.role, centerId: p.center.id, grantedBy: x.adminU.id });
    let teacherId: string | null = null;
    if (p.teacher) {
      teacherId = uid();
      teacherOf.set(p.key, { id: teacherId, userId, centerId: p.center.id });
      teacherIns.push({
        id: teacherId, userId, centerId: p.center.id, code: `GV${String(++teacherSeq).padStart(3, "0")}`, fullName: p.name, phone, email: p.email,
        grade: p.teacher.grade, title: p.title, contractType: p.teacher.contract, maxLoadPerWeek: p.teacher.maxLoad, hiredAt: p.hiredAt, workStatus: "active",
      });
      for (const code of p.teacher.courses) tcIns.push({ teacherId, courseId: courseIdByCode(code) });
    }
    const staffId = uid();
    staffIns.push({
      id: staffId, code: staffCode(++staffSeq), userId, teacherId, fullName: p.name, email: p.email, phone, centerId: p.center.id, department: p.dept, title: p.title,
      employmentType: p.employment, status: p.status, hiredAt: p.hiredAt, createdBy: x.adminU.id,
    });
    posIns.push({ staffId, centerId: p.center.id, title: p.title, department: p.dept, kind: "primary", effectiveFrom: p.hiredAt, createdBy: x.adminU.id });
    hrPeople.push({ staffId, userId, centerId: p.center.id, kind: p.role === "ASSISTANT_TEACHER" ? "assistant" : p.teacher ? "teacher" : "office" });
  });
  // Hồ sơ nhân sự cho GV Lan (CS2) và GV Hùng (CS1) — trước đây chưa có
  for (const [u, t, c, hired] of [[x.t2U, x.gv2, cs2, "2025-08-01"], [x.t3U, x.gv3, cs1, "2024-12-02"]] as const) {
    const staffId = uid();
    staffIns.push({ id: staffId, code: staffCode(++staffSeq), userId: u.id, teacherId: t.id, fullName: u.fullName, email: u.email, centerId: c.id, department: "academic", title: "Giáo viên", employmentType: "part_time", status: "active", hiredAt: hired, createdBy: x.adminU.id });
    posIns.push({ staffId, centerId: c.id, title: "Giáo viên", department: "academic", kind: "primary", effectiveFrom: hired, createdBy: x.adminU.id });
    hrPeople.push({ staffId, userId: u.id, centerId: c.id, kind: "teacher" });
  }
  await db.insert(users).values(userIns);
  await db.insert(userRoles).values(roleIns);
  await db.insert(teachers).values(teacherIns);
  await db.insert(teacherCourses).values(tcIns);
  await db.insert(staff).values(staffIns);
  await db.insert(staffPositions).values(posIns);
  bump("users", userIns.length);
  bump("teachers", teacherIns.length);
  bump("staff", staffIns.length);
  const uidOf = (key: string) => {
    const v = userIdOf.get(key);
    if (!v) throw new Error(`Thiếu người dùng ${key}`);
    return v;
  };
  const teacherByKey = (key: string) => {
    const v = teacherOf.get(key);
    if (!v) throw new Error(`Thiếu giáo viên ${key}`);
    return v;
  };
  const teacherUser = new Map<string, string | null>([...teacherOf.values()].map((t) => [t.id, t.userId] as const));
  const sales1 = [x.sale1U.id, x.sale2U.id, uidOf("sale3"), uidOf("sale4")];
  const sales2 = [uidOf("sale5"), uidOf("sale6")];
  const salesOf = (centerId: string) => (centerId === cs1.id ? sales1 : sales2);
  const mgrOf = (centerId: string) => (centerId === cs1.id ? x.mgrU.id : uidOf("mgr2"));
  const accOf = (centerId: string) => (centerId === cs1.id ? x.ktU.id : uidOf("kt2"));
  const gvuOf = (centerId: string) => (centerId === cs1.id ? uidOf("gvu1") : uidOf("gvu2"));
  await db.insert(admissionsSettings).values({ centerId: cs2.id, distributionMode: "round_robin", dedupeDays: 30, maxTrialsPerLead: 2, staleAfterDays: 7, updatedBy: x.adminU.id });

  /* ---------------- Phòng học ---------------- */
  interface RoomLite {
    id: string;
    centerId: string;
    code: string;
    name: string;
    capacity: number;
  }
  const roomList: RoomLite[] = [
    { id: uid(), centerId: cs1.id, code: "102", name: "Phòng 102", capacity: 14 },
    { id: uid(), centerId: cs1.id, code: "103", name: "Phòng 103", capacity: 12 },
    { id: uid(), centerId: cs1.id, code: "LAB2", name: "Lab 2", capacity: 16 },
    { id: uid(), centerId: cs1.id, code: "201", name: "Phòng 201", capacity: 16 },
    { id: uid(), centerId: cs2.id, code: "P301", name: "Phòng 301", capacity: 14 },
    { id: uid(), centerId: cs2.id, code: "P303", name: "Phòng 303", capacity: 12 },
    { id: uid(), centerId: cs2.id, code: "LAB-A", name: "Lab A", capacity: 16 },
    { id: uid(), centerId: cs2.id, code: "P201", name: "Phòng 201", capacity: 16 },
  ];
  await db.insert(rooms).values(roomList.map((r) => ({ id: r.id, centerId: r.centerId, code: r.code, name: r.name, capacity: r.capacity })));
  await db.update(centers).set({ latitude: 16.0678, longitude: 108.2208, checkinRadiusM: 150 }).where(eq(centers.id, cs2.id));
  bump("rooms", roomList.length);
  const roomByCode = (centerId: string, code: string) => {
    const r = roomList.find((z) => z.centerId === centerId && z.code === code);
    if (!r) throw new Error(`Thiếu phòng ${code}`);
    return r;
  };

  /* ---------------- Lớp học, lịch tuần, buổi học ---------------- */
  interface SessPlan {
    id: string;
    classId: string;
    seq: number;
    date: string;
    start: string;
    end: string;
    roomId: string | null;
    teacherId: string | null;
    teacherUserId: string | null;
    lessonId: string | null;
    topic: string | null;
    status: SessStatus;
  }
  interface AttRec {
    sess: SessPlan;
    status: AttendanceStatus;
  }
  interface ClassPlan {
    id: string;
    code: string;
    name: string;
    centerId: string;
    course: CourseInfo;
    status: ClassStatus;
    start: string;
    planned: number;
    capacity: number;
    lead: TeacherLite;
    assistant: TeacherLite | null;
    sessions: SessPlan[];
    attended: SessPlan[];
    enrs: EnrPlan[];
  }
  interface Family {
    parentId: string;
    name: string;
    gender: "male" | "female";
    local: string;
    norm: string;
    email: string | null;
    familyName: string;
    centerId: string;
    kids: Kid[];
    second: { id: string; name: string; norm: string } | null;
    accountStatus: "none" | "pending_activation" | "active";
    mediaConsent: boolean;
    firstAt: Date;
  }
  interface Kid {
    id: string;
    code: string;
    name: string;
    grade: number;
    gender: "male" | "female";
    dob: string;
    school: string;
    centerId: string;
    fam: Family;
    enrs: EnrPlan[];
    createdAt: Date;
    nickname: string | null;
    healthNotes: string | null;
  }
  interface EnrPlan {
    id: string;
    kid: Kid;
    cls: ClassPlan;
    status: EnrStatus;
    pkg: number;
    startSeq: number;
    carried: number;
    enrolledAt: Date;
    endedAt: Date | null;
    endReason: string | null;
    pausedAt: string | null;
    pauseUntil: string | null;
    /** Không điểm danh các buổi từ ngày này trở đi (bảo lưu / nghỉ) */
    cutDate: string | null;
    createdBy: string;
    recs: AttRec[];
    consumed: number;
    continuing: boolean;
  }

  type Slot = { s: string; e: string };
  const WEEKDAY_SLOTS: Slot[] = [{ s: "17:30", e: "19:00" }, { s: "19:15", e: "20:45" }];
  const WEEKEND_SLOTS: Slot[] = [{ s: "08:00", e: "09:30" }, { s: "09:45", e: "11:15" }, { s: "14:00", e: "15:30" }, { s: "15:45", e: "17:15" }];
  const busy: { res: string; wd: number; s: number; e: number }[] = [];
  const occupy = (res: string | null, wd: number, s: string, e: string) => {
    if (res) busy.push({ res, wd, s: hhmm(s), e: hhmm(e) });
  };
  const isFree = (res: string, wd: number, s: string, e: string) => !busy.some((b) => b.res === res && b.wd === wd && b.s < hhmm(e) && hhmm(s) < b.e);
  for (const r of x.busyRules) {
    occupy(r.teacherId, r.weekday, r.startTime, r.endTime);
    occupy(r.roomId, r.weekday, r.startTime, r.endTime);
  }
  const slotOn = (wd: number, teacherId: string, roomId: string): Slot | null => {
    for (const sl of rShuffle(rng, wd >= 6 ? WEEKEND_SLOTS : WEEKDAY_SLOTS)) if (isFree(teacherId, wd, sl.s, sl.e) && isFree(roomId, wd, sl.s, sl.e)) return sl;
    return null;
  };
  const PAIRS: number[][] = [[2, 5], [1, 4], [3, 6], [2, 6], [4, 7], [1, 5], [3, 7], [6, 7], [2, 4], [3, 5]];
  const SINGLES: number[][] = [[6], [7], [2], [3], [4], [5], [1]];

  const usedClassCodes = new Set(x.usedClassCodes);
  const classSeq = new Map<string, number>();
  const nextClassCode = (cc: string, courseCode: string, year: number) => {
    const key = `${cc}.${courseCode}`;
    let n = classSeq.get(key) ?? 0;
    let c = "";
    do {
      n++;
      c = buildClassCode(cc, courseCode, year, n);
    } while (usedClassCodes.has(c));
    classSeq.set(key, n);
    usedClassCodes.add(c);
    return c;
  };

  const classSpecs: { center: CenterRow; course: string; status: ClassStatus; off: number; perWeek: number; lead: string; asst: string | null; room: string }[] = [
    { center: cs1, course: "SATA4", status: "finished", off: -150, perWeek: 2, lead: "t4", asst: "a2", room: "201" },
    { center: cs1, course: "SATA2", status: "running", off: -63, perWeek: 2, lead: "t4", asst: "a1", room: "102" },
    { center: cs1, course: "SATA4", status: "running", off: -42, perWeek: 1, lead: "gv3", asst: "a2", room: "103" },
    { center: cs1, course: "SATA6", status: "running", off: -56, perWeek: 2, lead: "t5", asst: "a1", room: "LAB2" },
    { center: cs1, course: "SATA8", status: "running", off: -28, perWeek: 1, lead: "t6", asst: null, room: "201" },
    { center: cs1, course: "SATA1", status: "recruiting", off: 12, perWeek: 1, lead: "gv1", asst: null, room: "LAB2" },
    { center: cs1, course: "SATA6", status: "draft", off: 30, perWeek: 1, lead: "t5", asst: null, room: "103" },
    { center: cs2, course: "SATA2", status: "finished", off: -140, perWeek: 2, lead: "t8", asst: "a4", room: "P201" },
    { center: cs2, course: "SATA4", status: "running", off: -49, perWeek: 2, lead: "t7", asst: "a3", room: "P301" },
    { center: cs2, course: "SATA6", status: "running", off: -70, perWeek: 1, lead: "gv2", asst: "a4", room: "LAB-A" },
    { center: cs2, course: "SATA2", status: "running", off: -35, perWeek: 1, lead: "t9", asst: "a3", room: "P303" },
    { center: cs2, course: "SATA6", status: "recruiting", off: 8, perWeek: 2, lead: "t9", asst: null, room: "P201" },
    { center: cs2, course: "SATA8", status: "pending_approval", off: 21, perWeek: 1, lead: "t8", asst: null, room: "LAB-A" },
  ];
  const plans: ClassPlan[] = [];
  const classIns: (typeof classes.$inferInsert)[] = [];
  const schedIns: (typeof classSchedules.$inferInsert)[] = [];
  const classEvIns: (typeof classEvents.$inferInsert)[] = [];
  let runIdx = 0;
  for (const spec of classSpecs) {
    const crs = course(spec.course);
    const lead = teacherByKey(spec.lead);
    const asst = spec.asst ? teacherByKey(spec.asst) : null;
    const room = roomByCode(spec.center.id, spec.room);
    const combos = spec.perWeek === 2 ? rShuffle(rng, PAIRS) : rShuffle(rng, SINGLES);
    let chosen: { wd: number; sl: Slot }[] | null = null;
    for (const combo of combos) {
      const got: { wd: number; sl: Slot }[] = [];
      for (const wd of combo) {
        const sl = slotOn(wd, lead.id, room.id);
        if (!sl) break;
        got.push({ wd, sl });
      }
      if (got.length === combo.length) {
        chosen = got;
        break;
      }
    }
    if (!chosen) throw new Error(`Không xếp được lịch cho lớp ${spec.course} ${spec.center.code}`);
    for (const c of chosen) {
      occupy(lead.id, c.wd, c.sl.s, c.sl.e);
      occupy(room.id, c.wd, c.sl.s, c.sl.e);
    }
    const id = uid();
    const start = addDays(today, spec.off);
    const clsCode = nextClassCode(spec.center.code, crs.code, Number(start.slice(0, 4)));
    const firstStart = chosen[0]?.sl.s ?? "08:00";
    const part = firstStart < "12:00" ? "sáng" : firstStart < "17:00" ? "chiều" : "tối";
    const name = `${courseTitle(crs.code)} ${part} ${chosen.map((c) => WD_VI[c.wd] ?? "").join(" & ")} ${spec.center.code}`;
    const planned = crs.code === "SATA1" ? 12 : 24;
    const rules = chosen.map((c) => ({ weekday: c.wd as Weekday, startTime: c.sl.s, endTime: c.sl.e, roomId: room.id, teacherId: lead.id, effectiveFrom: start, effectiveTo: null }));
    const holidayList = [...x.holidayDates.global, ...(spec.center.id === cs1.id ? x.holidayDates.cs1 : [])];
    const withSessions = spec.status === "running" || spec.status === "finished" || spec.status === "recruiting";
    const gen = withSessions ? generateSessions({ classId: id, startDate: start, totalSessions: planned, rules, holidays: holidayList, lessonIds: crs.lessonIds }) : [];
    const gvu = gvuOf(spec.center.id);
    const mgr = mgrOf(spec.center.id);
    const createdAt = notFuture(vnAt(addDays(start, -int(20, 30)), "09:00"));
    const submittedAt = spec.status === "draft" ? null : later(createdAt, 30, 240);
    const approved = spec.status === "running" || spec.status === "finished" || spec.status === "recruiting";
    const approvedAt = approved && submittedAt ? later(submittedAt, 120, 36 * 60) : null;
    const sessList: SessPlan[] = gen.map((p) => ({
      id: uid(), classId: id, seq: p.sequenceNo, date: p.date, start: p.startTime, end: p.endTime, roomId: p.roomId, teacherId: p.teacherId,
      teacherUserId: p.teacherId ? (teacherUser.get(p.teacherId) ?? null) : null, lessonId: p.lessonId,
      topic: crs.titles[p.sequenceNo - 1] ?? (crs.titles.length ? `Ôn tập & mở rộng: ${crs.titles[(p.sequenceNo - 1) % crs.titles.length] ?? ""}` : null),
      status: p.date < today ? "completed" : "scheduled",
    }));
    if (spec.status === "running") {
      // Để lại vài buổi quá hạn chưa chốt để hàng đợi "Buổi học quá hạn" có dữ liệu
      const lastPast = [...sessList].reverse().find((s) => s.date < today);
      if (lastPast && (runIdx === 1 || runIdx === 5)) lastPast.status = "scheduled";
      if (lastPast && runIdx === 3) lastPast.status = "attendance_done";
      runIdx++;
    }
    const plan: ClassPlan = {
      id, code: clsCode, name, centerId: spec.center.id, course: crs, status: spec.status, start, planned, capacity: room.capacity, lead, assistant: asst,
      sessions: sessList, attended: sessList.filter((s) => s.status !== "scheduled"), enrs: [],
    };
    plans.push(plan);
    classIns.push({
      id, code: clsCode, name, courseId: crs.id, curriculumId: crs.curriculumId, centerId: spec.center.id, homeRoomId: room.id, leadTeacherId: lead.id,
      assistantTeacherId: asst?.id ?? null, capacity: room.capacity, minCapacity: 6, plannedSessions: planned, startDate: start,
      expectedEndDate: gen.length ? sessionsEndDate(gen) : null, status: spec.status, description: `Lớp ${courseTitle(crs.code)} (dữ liệu mẫu)`,
      submittedAt, submittedBy: submittedAt ? gvu : null, approvedAt, approvedBy: approvedAt ? mgr : null, createdAt,
    });
    for (const r of rules) schedIns.push({ classId: id, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime, roomId: r.roomId, teacherId: r.teacherId, effectiveFrom: start, effectiveTo: null, createdBy: gvu, createdAt });
    if (submittedAt) classEvIns.push({ classId: id, event: "submit", fromStatus: "draft", toStatus: "pending_approval", actorId: gvu, createdAt: submittedAt });
    if (approvedAt) classEvIns.push({ classId: id, event: "approve", fromStatus: "pending_approval", toStatus: "recruiting", actorId: mgr, createdAt: approvedAt });
    const first = sessList[0];
    const last = sessList[sessList.length - 1];
    if ((spec.status === "running" || spec.status === "finished") && first) classEvIns.push({ classId: id, event: "start", fromStatus: "recruiting", toStatus: "running", actorId: gvu, createdAt: vnAt(first.date, "07:00") });
    if (spec.status === "finished" && last) classEvIns.push({ classId: id, event: "finish", fromStatus: "running", toStatus: "finished", reason: "Hoàn thành chương trình", actorId: gvu, createdAt: vnAt(last.date, "21:30") });
  }
  await db.insert(classes).values(classIns);
  await db.insert(classSchedules).values(schedIns);
  await db.insert(classEvents).values(classEvIns);
  bump("classes", classIns.length);

  const allSessions = plans.flatMap((p) => p.sessions);
  const planOf = new Map(plans.map((p) => [p.id, p] as const));
  const sessRows: (typeof sessions.$inferInsert)[] = allSessions.map((s): typeof sessions.$inferInsert => {
    const gvu = gvuOf(planOf.get(s.classId)?.centerId ?? cs1.id);
    const base = {
      id: s.id, classId: s.classId, lessonId: s.lessonId, sequenceNo: s.seq, kind: "regular" as const, date: s.date, startTime: s.start, endTime: s.end,
      roomId: s.roomId, teacherId: s.teacherId, status: s.status, topic: s.topic, createdBy: gvu,
    };
    if (s.status === "completed") {
      return {
        ...base, sessionNote: pick(SESSION_NOTES), privateNote: chance(0.12) ? "Nhắc PH đón đúng giờ (nội bộ)" : null,
        checklist: { pre: { kit: true, lesson: true, room: chance(0.8) }, post: { cleanup: true, photos: chance(0.6), handover: true } },
        startedAt: addMin(vnAt(s.date, s.start), -int(0, 5)), completedAt: notFuture(addMin(vnAt(s.date, s.end), int(10, 120))), completedBy: s.teacherUserId,
      };
    }
    if (s.status === "attendance_done") return { ...base, checklist: { pre: { kit: true, lesson: true } }, startedAt: addMin(vnAt(s.date, s.start), -3) };
    return base;
  });
  await inChunks(sessRows, (p) => db.insert(sessions).values(p));
  bump("sessions", sessRows.length);

  /* ---------------- Phụ huynh, học viên, ghi danh ---------------- */
  const families: Family[] = [];
  const kids: Kid[] = [];
  const allEnrs: EnrPlan[] = [];
  let phoneSeq = 0;
  const nextPhone = () => {
    phoneSeq++;
    const local = `09001${String(phoneSeq).padStart(5, "0")}`;
    return { local, norm: `84${local.slice(1)}` };
  };
  const personName = (gender: "male" | "female", familyName: string) => (gender === "male" ? `${familyName} ${pick(DEM_NAM)} ${pick(TEN_NAM)}` : `${familyName} ${pick(DEM_NU)} ${pick(TEN_NU)}`);
  const usedStudentCodes = new Set(x.usedStudentCodes.filter((c): c is string => !!c));
  const stuSeq = new Map<string, number>();
  const nextStudentCode = (cc: string) => {
    let n = stuSeq.get(cc) ?? 0;
    let c = "";
    do {
      n++;
      c = buildStudentCode(cc, yr, n);
    } while (usedStudentCodes.has(c));
    stuSeq.set(cc, n);
    usedStudentCodes.add(c);
    return c;
  };
  const newFamily = (centerId: string, at: Date): Family => {
    const familyName = pick(HO);
    const gender: "male" | "female" = chance(0.62) ? "female" : "male";
    const ph = nextPhone();
    const secondGender: "male" | "female" = gender === "female" ? "male" : "female";
    const second = chance(0.18) ? { id: uid(), name: secondGender === "male" ? personName("male", familyName) : personName("female", pick(HO)), norm: nextPhone().norm } : null;
    const fam: Family = {
      parentId: uid(), name: gender === "male" ? personName("male", familyName) : personName("female", pick(HO)), gender, local: ph.local, norm: ph.norm,
      email: chance(0.45) ? `ph${String(phoneSeq).padStart(5, "0")}@example.test` : null, familyName, centerId, kids: [], second,
      accountStatus: weighted<"none" | "pending_activation" | "active">([["active", 0.4], ["pending_activation", 0.3], ["none", 0.3]]), mediaConsent: chance(0.72), firstAt: at,
    };
    families.push(fam);
    return fam;
  };
  const newKid = (fam: Family, grade: number, at: Date): Kid => {
    const gender: "male" | "female" = chance(0.55) ? "male" : "female";
    const kid: Kid = {
      id: uid(), code: nextStudentCode(ccOf(fam.centerId)), name: personName(gender, fam.familyName), grade, gender,
      dob: `${syStart - 5 - grade}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      school: grade <= 5 ? `Tiểu học mẫu ${pick(QUAN)}` : `THCS mẫu ${pick(QUAN)}`, centerId: fam.centerId, fam, enrs: [], createdAt: at,
      nickname: chance(0.2) ? pick(NICKS) : null, healthNotes: chance(0.06) ? pick(HEALTH) : null,
    };
    fam.kids.push(kid);
    kids.push(kid);
    if (at.getTime() < fam.firstAt.getTime()) fam.firstAt = at;
    return kid;
  };
  const familyFor = (centerId: string, grade: number, at: Date): Family => {
    if (chance(0.13)) {
      const cands = families.filter((f) => f.centerId === centerId && f.kids.length === 1 && (f.kids[0]?.grade ?? grade) !== grade && (f.kids[0]?.createdAt.getTime() ?? 0) <= at.getTime());
      if (cands.length) return pick(cands);
    }
    return newFamily(centerId, at);
  };
  const addEnr = (e: Omit<EnrPlan, "id" | "recs" | "consumed">): EnrPlan => {
    const full: EnrPlan = { ...e, id: uid(), recs: [], consumed: 0 };
    e.cls.enrs.push(full);
    e.kid.enrs.push(full);
    allEnrs.push(full);
    return full;
  };
  const sessAt = (cls: ClassPlan, seq: number) => {
    const s = cls.sessions.find((z) => z.seq === seq);
    if (!s) throw new Error(`Lớp ${cls.code} không có buổi ${seq}`);
    return s;
  };

  // 1) Lớp đã kết thúc
  const finished = plans.filter((p) => p.status === "finished");
  const running = plans.filter((p) => p.status === "running");
  const recruiting = plans.filter((p) => p.status === "recruiting");
  for (const cls of finished) {
    const lastDate = cls.sessions[cls.sessions.length - 1]?.date ?? cls.start;
    const gradeBump = lastDate < `${syStart}-09-01` ? 1 : 0;
    const n = cls.capacity - int(0, 2);
    for (let i = 0; i < n; i++) {
      const grade = Math.min(9, int(cls.course.gradeFrom, cls.course.gradeTo) + gradeBump);
      const enrolledAt = vnAt(addDays(cls.start, -int(3, 15)), hm());
      const kid = newKid(familyFor(cls.centerId, grade, enrolledAt), grade, enrolledAt);
      const withdrawn = chance(0.14) && cls.attended.length >= 8;
      const cut = withdrawn ? cls.attended[int(5, cls.attended.length - 2)] : undefined;
      addEnr({
        kid, cls, status: cut ? "withdrawn" : "completed", pkg: 24, startSeq: 1, carried: 0, enrolledAt,
        endedAt: cut ? vnAt(addDays(cut.date, int(0, 2)), "10:00") : vnAt(addDays(lastDate, int(0, 3)), "10:30"),
        endReason: cut ? pick(END_REASONS) : "Hoàn thành khoá", pausedAt: null, pauseUntil: null, cutDate: cut ? cut.date : null,
        createdBy: pick(salesOf(cls.centerId)), continuing: false,
      });
    }
  }
  // 2) Học viên học tiếp lên khoá sau (lớp đang chạy cùng cơ sở)
  const continuing = new Map<string, { kid: Kid; after: Date }[]>();
  for (const fin of finished) {
    const next = running.find((r) => r.centerId === fin.centerId && r.course.id === fin.course.nextCourseId);
    const finEnd = fin.sessions[fin.sessions.length - 1]?.date ?? fin.start;
    if (!next || next.start <= finEnd) continue;
    for (const e of fin.enrs) {
      if (e.status !== "completed" || e.kid.grade < next.course.gradeFrom || e.kid.grade > next.course.gradeTo || !chance(0.65)) continue;
      const list = continuing.get(next.id) ?? [];
      list.push({ kid: e.kid, after: e.endedAt ?? vnAt(finEnd, "12:00") });
      continuing.set(next.id, list);
    }
  }
  // 3) Lớp đang chạy
  const pickRunStatus = (cls: ClassPlan): { status: EnrStatus; startSeq: number } => {
    const A = cls.attended;
    const r = rng();
    if (r < 0.05 && A.length >= 2) return { status: "trial", startSeq: A[A.length - int(1, 2)]!.seq };
    if (r < 0.11 && A.length >= 5) return { status: "paused", startSeq: 1 };
    if (A.length >= 6 && chance(0.18)) return { status: "active", startSeq: A[int(1, Math.min(5, A.length - 4))]!.seq };
    return { status: "active", startSeq: 1 };
  };
  for (const cls of running) {
    const A = cls.attended;
    const open = cls.capacity - int(1, 3);
    const cont = continuing.get(cls.id) ?? [];
    for (const c of cont.slice(0, open)) {
      const d = maxISO(addDays(cls.start, -int(2, 6)), addDays(vnDate(c.after), 1));
      addEnr({ kid: c.kid, cls, status: "active", pkg: 24, startSeq: 1, carried: 0, enrolledAt: vnAt(minISO(d, addDays(cls.start, -1)), hm()), endedAt: null, endReason: null, pausedAt: null, pauseUntil: null, cutDate: null, createdBy: pick(salesOf(cls.centerId)), continuing: true });
    }
    for (let i = cont.length; i < open; i++) {
      const pickSt = pickRunStatus(cls);
      let status = pickSt.status;
      const startSeq = pickSt.startSeq;
      const enrolledAt = startSeq === 1 ? vnAt(addDays(cls.start, -int(2, 18)), hm()) : notFuture(vnAt(addDays(sessAt(cls, startSeq).date, -int(1, 4)), hm()));
      const grade = int(cls.course.gradeFrom, cls.course.gradeTo);
      const kid = newKid(familyFor(cls.centerId, grade, enrolledAt), grade, enrolledAt);
      let pausedAt: string | null = null;
      let pauseUntil: string | null = null;
      if (status === "paused") {
        const cands = A.filter((s) => s.seq >= startSeq + 2);
        const ps = cands.length ? pick(cands) : undefined;
        if (ps) {
          pausedAt = ps.date;
          const wanted = maxISO(addDays(ps.date, int(30, 80)), addDays(today, int(3, 30)));
          pauseUntil = minISO(wanted, addDays(ps.date, 89));
        } else status = "active";
      }
      addEnr({ kid, cls, status, pkg: 24, startSeq, carried: 0, enrolledAt, endedAt: null, endReason: null, pausedAt, pauseUntil, cutDate: pausedAt, createdBy: pick(salesOf(cls.centerId)), continuing: false });
    }
    const wd = A.length >= 5 ? int(0, 2) : 0;
    for (let i = 0; i < wd; i++) {
      const enrolledAt = vnAt(addDays(cls.start, -int(2, 18)), hm());
      const grade = int(cls.course.gradeFrom, cls.course.gradeTo);
      const kid = newKid(familyFor(cls.centerId, grade, enrolledAt), grade, enrolledAt);
      const cut = A[int(2, A.length - 2)]!;
      addEnr({
        kid, cls, status: "withdrawn", pkg: 24, startSeq: 1, carried: 0, enrolledAt, endedAt: notFuture(vnAt(addDays(cut.date, int(0, 2)), "10:00")), endReason: pick(END_REASONS),
        pausedAt: null, pauseUntil: null, cutDate: cut.date, createdBy: pick(salesOf(cls.centerId)), continuing: false,
      });
    }
  }
  // 4) Lớp đang tuyển sinh (chưa khai giảng)
  for (const cls of recruiting) {
    const n = int(6, 9);
    for (let i = 0; i < n; i++) {
      const enrolledAt = ago(int(1, 20 * 24));
      const grade = int(cls.course.gradeFrom, cls.course.gradeTo);
      const kid = newKid(familyFor(cls.centerId, grade, enrolledAt), grade, enrolledAt);
      const trial = chance(0.25);
      addEnr({ kid, cls, status: trial ? "trial" : "active", pkg: trial ? cls.planned : pick([cls.planned, cls.planned, cls.planned * 2]), startSeq: 1, carried: 0, enrolledAt, endedAt: null, endReason: null, pausedAt: null, pauseUntil: null, cutDate: null, createdBy: pick(salesOf(cls.centerId)), continuing: false });
    }
  }

  // 5) Điểm danh các buổi đã học (≈88% có mặt, 5% muộn, 4% vắng phép, 3% vắng không phép)
  const ATT_MIX: (readonly [AttendanceStatus, number])[] = [["present", 0.88], ["late", 0.05], ["absent_excused", 0.04], ["absent_unexcused", 0.03]];
  for (const cls of plans) {
    for (const s of cls.attended) {
      for (const e of cls.enrs) {
        if (s.seq < e.startSeq) continue;
        if (e.cutDate !== null && s.date >= e.cutDate) continue;
        e.recs.push({ sess: s, status: weighted(ATT_MIX) });
      }
    }
  }
  // Một số HV nghỉ liên tiếp 2–3 buổi gần nhất (cảnh báo rủi ro) và vài HV chuyên cần thấp
  const riskPool = rShuffle(rng, allEnrs.filter((e) => e.cls.status === "running" && e.status === "active" && e.recs.length >= 5));
  for (const e of riskPool.slice(0, 8)) {
    const n = chance(0.5) ? 3 : 2;
    e.recs.slice(-n).forEach((r) => {
      r.status = chance(0.55) ? "absent_excused" : "absent_unexcused";
    });
  }
  for (const e of riskPool.slice(8, 11)) {
    e.recs.forEach((r, i) => {
      if (i === e.recs.length - 1) r.status = "present";
      else if (chance(0.4)) r.status = chance(0.5) ? "absent_excused" : "absent_unexcused";
    });
  }
  // 6) Gói học: suy từ số buổi đã học để có HV "sắp hết khoá" (còn ≤ 4 buổi)
  for (const e of allEnrs) {
    e.consumed = e.recs.filter((r) => r.status === "present" || r.status === "late" || r.status === "absent_unexcused").length;
    if (e.cls.status !== "running") continue;
    const P = e.recs.length;
    if (e.status === "active" && !e.continuing && chance(0.05)) {
      e.carried = int(4, 10);
      e.pkg = 36;
      continue;
    }
    if ((e.status === "active" || e.status === "paused") && P >= 8 && chance(0.28)) {
      const fit = [12, 16, 20, 24].find((k) => k >= P && k - e.consumed <= 4);
      if (fit) {
        e.pkg = fit;
        continue;
      }
    }
    e.pkg = P + 4 > 24 ? 36 : weighted<number>([[24, 0.75], [36, 0.25]]);
  }

  // Ghi DB: phụ huynh, học viên, ghi danh, lịch sử ghi danh, điểm danh
  const parentIns: (typeof parents.$inferInsert)[] = [];
  const guardianIns: (typeof studentGuardians.$inferInsert)[] = [];
  for (const f of families) {
    const reqAt = f.accountStatus === "none" ? null : later(f.firstAt, 60, 3 * 24 * 60);
    parentIns.push({
      id: f.parentId, fullName: f.name, phone: f.norm, email: f.email, mediaConsent: f.mediaConsent, mediaConsentAt: f.mediaConsent ? f.firstAt : null,
      accountStatus: f.accountStatus, activationRequestedAt: reqAt, activatedAt: f.accountStatus === "active" && reqAt ? later(reqAt, 30, 5 * 24 * 60) : null,
      lastLoginAt: f.accountStatus === "active" ? ago(int(1, 400)) : null, createdAt: f.firstAt,
    });
    if (f.second) parentIns.push({ id: f.second.id, fullName: f.second.name, phone: f.second.norm, createdAt: f.firstAt });
    for (const k of f.kids) {
      guardianIns.push({ studentId: k.id, parentId: f.parentId, relation: f.gender === "female" ? "mother" : "father", isPrimary: true });
      if (f.second) guardianIns.push({ studentId: k.id, parentId: f.second.id, relation: f.gender === "female" ? "father" : "mother", isPrimary: false });
    }
  }
  const studentStatus = (k: Kid): "trial" | "active" | "paused" | "alumni" | "withdrawn" => {
    const st = k.enrs.map((e) => e.status);
    if (st.includes("active")) return "active";
    if (st.includes("paused")) return "paused";
    if (st.includes("trial")) return "trial";
    if (st.includes("completed")) return "alumni";
    return "withdrawn";
  };
  const studentIns: (typeof students.$inferInsert)[] = kids.map((k) => ({
    id: k.id, code: k.code, fullName: k.name, nickname: k.nickname, dateOfBirth: k.dob, grade: k.grade, school: k.school, gender: k.gender,
    healthNotes: k.healthNotes, homeCenterId: k.centerId, status: studentStatus(k), createdAt: k.createdAt,
    interests: chance(0.3) ? pick(["Lắp ráp", "Lập trình", "Vẽ", "Toán tư duy", "Bóng đá"]) : null,
  }));
  const enrIns: (typeof enrollments.$inferInsert)[] = [];
  const enrEvIns: (typeof enrollmentEvents.$inferInsert)[] = [];
  const attIns: (typeof attendance.$inferInsert)[] = [];
  for (const e of allEnrs) {
    const initial = e.status === "trial" ? "trial" : "active";
    enrIns.push({
      id: e.id, studentId: e.kid.id, classId: e.cls.id, status: e.status, packageSessions: e.pkg, startSequenceNo: e.startSeq, carriedSessions: e.carried,
      enrolledAt: e.enrolledAt, endedAt: e.endedAt, endReason: e.endReason, pausedAt: e.pausedAt, pauseUntil: e.pauseUntil, createdBy: e.createdBy, createdAt: e.enrolledAt,
    });
    enrEvIns.push({ enrollmentId: e.id, type: "created", toStatus: initial, meta: { packageSessions: e.pkg, ...(e.carried ? { carriedSessions: e.carried } : {}) }, actorId: e.createdBy, createdAt: e.enrolledAt });
    if (e.status === "paused" && e.pausedAt) enrEvIns.push({ enrollmentId: e.id, type: "pause", fromStatus: "active", toStatus: "paused", reason: pick(["Con ốm dài ngày (mẫu)", "Gia đình về quê (mẫu)", "Ôn thi học kỳ ở trường (mẫu)"]), meta: { pausedAt: e.pausedAt, pauseUntil: e.pauseUntil }, actorId: mgrOf(e.cls.centerId), createdAt: vnAt(addDays(e.pausedAt, -1), "16:00") });
    if (e.status === "withdrawn" && e.endedAt) enrEvIns.push({ enrollmentId: e.id, type: "withdraw", fromStatus: "active", toStatus: "withdrawn", reason: e.endReason, actorId: mgrOf(e.cls.centerId), createdAt: e.endedAt });
    if (e.status === "completed" && e.endedAt) enrEvIns.push({ enrollmentId: e.id, type: "complete", fromStatus: "active", toStatus: "completed", reason: "Hoàn thành khoá", actorId: gvuOf(e.cls.centerId), createdAt: e.endedAt });
    for (const r of e.recs) {
      const absent = r.status === "absent_excused" || r.status === "absent_unexcused";
      attIns.push({
        sessionId: r.sess.id, enrollmentId: e.id, status: r.status,
        note: absent && (r.status === "absent_excused" || chance(0.3)) ? (r.status === "absent_excused" ? pick(ABSENT_NOTES) : "Không liên lạc được PH") : null,
        studentRemark: !absent && chance(0.35) ? pick(REMARKS) : null, rating: !absent && chance(0.4) ? int(3, 5) : null,
        recordedBy: r.sess.teacherUserId, recordedAt: notFuture(addMin(vnAt(r.sess.date, r.sess.end), -int(5, 60))),
      });
    }
  }
  await inChunks(parentIns, (p) => db.insert(parents).values(p));
  await inChunks(studentIns, (p) => db.insert(students).values(p));
  await inChunks(guardianIns, (p) => db.insert(studentGuardians).values(p));
  await inChunks(enrIns, (p) => db.insert(enrollments).values(p));
  await inChunks(enrEvIns, (p) => db.insert(enrollmentEvents).values(p));
  await inChunks(attIns, (p) => db.insert(attendance).values(p), 500);
  bump("parents", parentIns.length);
  bump("students", studentIns.length);
  bump("enrollments", enrIns.length);
  bump("attendance", attIns.length);

  /* ---------------- Tuyển sinh: ~300 lead 90 ngày, hoạt động, việc, học thử ---------------- */
  const leadIns: (typeof leads.$inferInsert)[] = [];
  const childIns: (typeof leadChildren.$inferInsert)[] = [];
  const actIns: (typeof leadActivities.$inferInsert)[] = [];
  const taskIns: (typeof leadTasks.$inferInsert)[] = [];
  const trialIns: (typeof trialBookings.$inferInsert)[] = [];
  const trialSeat = new Map<string, number>();
  const SOURCES: (readonly [string, number])[] = [["facebook", 30], ["web-form", 18], ["zalo", 12], ["referral", 10], ["walk-in", 8], ["hotline", 8], ["tiktok", 8], ["ads", 6]];
  const utmFor = (src: string): { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null } => {
    if (src === "facebook") return { utmSource: "facebook", utmMedium: pick(["cpc", "paid_social"]), utmCampaign: pick(["he-2026", "khai-giang-t9"]) };
    if (src === "tiktok") return { utmSource: "tiktok", utmMedium: "paid_social", utmCampaign: "khai-giang-t9" };
    if (src === "ads") return { utmSource: "google", utmMedium: "cpc", utmCampaign: "gg-search" };
    if (src === "web-form" && chance(0.4)) return { utmSource: "google", utmMedium: "organic", utmCampaign: null };
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  };
  const courseForGrade = (grade: number): CourseInfo => (grade <= 2 ? course("SATA2") : grade <= 4 ? course("SATA4") : grade <= 6 ? course("SATA6") : course("SATA8"));
  const trialPool = plans.filter((p) => p.status === "running" || p.status === "recruiting");
  const findTrialSession = (centerId: string, courseId: string | null, from: string, to: string, want: "future" | "past"): { s: SessPlan; cls: ClassPlan } | null => {
    const ok = (s: SessPlan) => s.date >= from && s.date <= to && (want === "future" ? s.status === "scheduled" && s.date > today : s.status === "completed") && (trialSeat.get(s.id) ?? 0) < 2;
    const pools = [trialPool.filter((c) => c.centerId === centerId && c.course.id === courseId), trialPool.filter((c) => c.centerId === centerId)];
    for (const pool of pools) {
      const list = pool.flatMap((c) => c.sessions.filter(ok).map((s) => ({ s, cls: c })));
      if (list.length) {
        const got = pick(list);
        trialSeat.set(got.s.id, (trialSeat.get(got.s.id) ?? 0) + 1);
        return got;
      }
    }
    return null;
  };
  const sessStart = (s: SessPlan) => vnAt(s.date, s.start);
  const sessEnd = (s: SessPlan) => vnAt(s.date, s.end);
  const planOfSession = (s: SessPlan) => planOf.get(s.classId);
  const assignStats = new Map<string, { n: number; last: Date }>();

  interface ConvInfo {
    fam: Family;
    enrs: EnrPlan[];
  }
  const makeLead = (target: LeadStatus, centerId: string | null, conv: ConvInfo | null) => {
    const id = uid();
    const ph = conv ? { local: conv.fam.local, norm: conv.fam.norm } : nextPhone();
    const pGender: "male" | "female" = conv ? conv.fam.gender : chance(0.62) ? "female" : "male";
    const familyName = conv ? conv.fam.familyName : pick(HO);
    const parentName = conv ? conv.fam.name : pGender === "male" ? personName("male", familyName) : personName("female", pick(HO));
    const kidsSpec: { id: string; name: string; grade: number; courseId: string | null; studentId: string | null }[] = conv
      ? conv.enrs.map((e) => ({ id: uid(), name: e.kid.name, grade: e.kid.grade, courseId: e.cls.course.id, studentId: e.kid.id }))
      : (() => {
          const g = weighted<number>([[1, 6], [2, 10], [3, 14], [4, 14], [5, 12], [6, 10], [7, 7], [8, 5], [9, 3]]);
          const list = [{ id: uid(), name: personName(chance(0.55) ? "male" : "female", familyName), grade: g, courseId: target === "new" && chance(0.4) ? null : courseForGrade(g).id, studentId: null }];
          if (chance(0.1)) {
            const g2 = Math.max(1, Math.min(9, g + pick([-3, -2, 2, 3])));
            list.push({ id: uid(), name: personName(chance(0.55) ? "male" : "female", familyName), grade: g2, courseId: courseForGrade(g2).id, studentId: null });
          }
          return list;
        })();
    const k0 = kidsSpec[0]!;
    const src = weighted(SOURCES);
    const sales = centerId ? salesOf(centerId) : [];
    const firstEnr = conv?.enrs[0];
    const assignee = centerId === null || sales.length === 0 ? null : firstEnr ? firstEnr.createdBy : target === "new" && chance(0.22) ? null : pick(sales);
    const acts: { type: LeadActType; content: string | null; meta: Record<string, unknown> | null; at: Date; actor: string | null }[] = [];
    // Trạng thái hiện tại được đổi trong closure → giữ trong object để TS không thu hẹp kiểu theo giá trị khởi tạo
    const L: { cur: LeadStatus; firstCall: Date | null } = { cur: "new", firstCall: null };
    let nextActionAt: Date | null = null;
    let lostReason: string | null = null;
    const trans = (to: LeadStatus, event: string, at: Date, content: string | null, type: LeadActType = "status_change", extra: Record<string, unknown> = {}) => {
      acts.push({ type, content, meta: { ...extra, from: L.cur, to, event }, at, actor: assignee });
      L.cur = to;
    };
    const touch = (type: "call" | "message" | "note", content: string, at: Date) => {
      acts.push({ type, content, meta: null, at, actor: assignee });
    };
    const book = (s: SessPlan, at: Date, status: "booked" | "attended" | "no_show", to: LeadStatus, event: string, resultAt: Date | null) => {
      const cls = planOfSession(s);
      const bookingId = uid();
      trialIns.push({
        id: bookingId, leadId: id, childId: k0.id, sessionId: s.id, centerId: cls?.centerId ?? centerId, status, childName: k0.name,
        note: chance(0.3) ? "PH đưa đón (mẫu)" : null, resultNote: status === "attended" ? pick(["Con hào hứng, lắp xong mô hình", "Con hơi rụt rè nhưng làm được bài", "Con tiếp thu nhanh"]) : status === "no_show" ? "PH báo bận đột xuất" : null,
        resultBy: resultAt ? s.teacherUserId : null, resultAt, bookedBy: assignee, createdAt: at,
      });
      trans(to, event, at, `Xếp học thử ${cls?.code ?? ""} buổi ${s.seq} (${ddmmyyyy(s.date)} ${s.start})`, "trial_booked", { trialBookingId: bookingId, sessionId: s.id, trialAt: sessStart(s).toISOString() });
      return bookingId;
    };
    const result = (s: SessPlan, bookingId: string, at: Date, attended: boolean, to: LeadStatus, event: string) => {
      trans(to, event, at, `${attended ? "Đã học thử" : "Không đến học thử"} ${planOfSession(s)?.code ?? ""} ${ddmmyyyy(s.date)}`, "status_change", { trialBookingId: bookingId, sessionId: s.id });
    };

    // Mốc tạo lead theo trạng thái / buổi học thử
    const centerKey = centerId ?? cs1.id;
    let createdAt: Date;
    let trialPast: { s: SessPlan; cls: ClassPlan } | null = null;
    let trialFuture: { s: SessPlan; cls: ClassPlan } | null = null;
    let status = target;
    let convAt: Date | null = null;
    if (conv && firstEnr) {
      convAt = firstEnr.enrolledAt;
      createdAt = new Date(Math.max(convAt.getTime() - int(2, 18) * 86400e3 - int(0, 600) * 60e3, now - 100 * 86400e3));
      if (firstEnr.startSeq > 1 && firstEnr.cls.status === "running") {
        const prev = firstEnr.cls.sessions.find((z) => z.seq === firstEnr.startSeq - 1);
        if (prev && prev.status === "completed" && sessEnd(prev).getTime() < convAt.getTime() && prev.date > vnDate(createdAt)) {
          trialPast = { s: prev, cls: firstEnr.cls };
          trialSeat.set(prev.id, (trialSeat.get(prev.id) ?? 0) + 1);
        }
      }
    } else if (target === "trial_scheduled" || target === "trial_in_progress" || target === "trial_done" || (target === "deciding" && chance(0.6)) || (target === "nurturing" && chance(0.3)) || (target === "lost" && chance(0.25))) {
      const pastRange: Record<string, [number, number]> = { trial_in_progress: [7, 1], trial_done: [6, 1], deciding: [30, 4], nurturing: [45, 3], lost: [60, 5] };
      if (target === "trial_scheduled") trialFuture = findTrialSession(centerKey, k0.courseId, addDays(today, 1), addDays(today, 10), "future");
      else {
        const [a, b] = pastRange[target] ?? [10, 1];
        trialPast = findTrialSession(centerKey, k0.courseId, addDays(today, -a), addDays(today, -b), "past");
        if (trialPast && target === "trial_in_progress") {
          const tp = trialPast;
          const fut = tp.cls.sessions.filter((z) => z.status === "scheduled" && z.date > today && z.date <= addDays(today, 10) && (trialSeat.get(z.id) ?? 0) < 2);
          const f = fut[0];
          if (f) {
            trialFuture = { s: f, cls: tp.cls };
            trialSeat.set(f.id, (trialSeat.get(f.id) ?? 0) + 1);
          } else trialPast = null;
        }
      }
      const anchor = trialPast?.s ?? trialFuture?.s;
      if (anchor) createdAt = new Date(Math.min(vnAt(anchor.date, "07:00").getTime() - int(1, 10) * 86400e3 - int(0, 600) * 60e3, now - 3 * 3600e3));
      else {
        // Không còn buổi phù hợp → coi như đang tư vấn
        if (target === "trial_scheduled" || target === "trial_in_progress" || target === "trial_done") status = "consulting";
        createdAt = ago(int(24, 600));
      }
    } else {
      const H: Record<string, [number, number]> = { contacted: [6, 288], consulting: [24, 600], deciding: [120, 1000], nurturing: [240, 2150], lost: [120, 2150] };
      if (target === "new") {
        const band = weighted<[number, number]>([[[0, 3], 0.5], [[3, 48], 0.3], [[48, 144], 0.2]]);
        createdAt = new Date(now - (band[0] * 60 + int(2, (band[1] - band[0]) * 60)) * 60e3);
      } else {
        const [a, b] = H[target] ?? [24, 240];
        createdAt = ago(int(a, b));
      }
    }
    // Lead đã chốt: mọi tương tác trước khi ghi danh
    const ceiling = convAt ? convAt.getTime() - 5 * 60e3 : now - 60e3;
    const lt = (after: Date, minM: number, maxM: number) => new Date(Math.max(after.getTime() + 1000, Math.min(after.getTime() + int(minM, maxM) * 60e3, ceiling)));
    const capAt = (d: Date) => new Date(Math.min(d.getTime(), ceiling));
    const assignedAt = assignee ? lt(createdAt, 1, 12) : null;
    acts.push({ type: "system", content: `Tạo lead từ ${src}`, meta: null, at: createdAt, actor: null });
    if (assignee && assignedAt) acts.push({ type: "assignment", content: "Chia tự động (round_robin)", meta: { assignedToId: assignee, mode: "round_robin" }, at: assignedAt, actor: null });
    const base = assignedAt ?? createdAt;
    const contact = (maxMin: number) => {
      const t = lt(base, 3, Math.max(4, maxMin));
      touch("call", pick(CALL_OK), t);
      L.firstCall = t;
      trans("contacted", "contact", addMin(t, 1), null);
      return addMin(t, 2);
    };

    if (status !== "new") {
      if (trialPast || trialFuture) {
        const anchor = (trialPast ?? trialFuture)!.s;
        const bookBy = new Date(sessStart(anchor).getTime() - 3 * 3600e3);
        const maxMin = Math.max(5, Math.floor((bookBy.getTime() - base.getTime()) / 60e3 / 2));
        let t = contact(Math.min(maxMin, 3 * 24 * 60));
        const bt = new Date(Math.min(lt(t, 5, Math.max(6, maxMin)).getTime(), bookBy.getTime()));
        if (trialFuture && trialPast) {
          // Đang học thử: xếp 2 buổi cùng lúc, đã học buổi 1
          const b1 = book(trialPast.s, bt, "attended", "trial_scheduled", "schedule_trial", null);
          book(trialFuture.s, addMin(bt, 2), "booked", "trial_scheduled", "schedule_trial", null);
          const rAt = capAt(notFuture(addMin(sessEnd(trialPast.s), int(15, 90))));
          const last = trialIns.find((z) => z.id === b1);
          if (last) {
            last.resultAt = rAt;
            last.resultBy = trialPast.s.teacherUserId;
          }
          result(trialPast.s, b1, rAt, true, "trial_in_progress", "start_trial");
          nextActionAt = sessStart(trialFuture.s);
        } else if (trialFuture) {
          book(trialFuture.s, bt, "booked", "trial_scheduled", "schedule_trial", null);
          nextActionAt = sessStart(trialFuture.s);
          if (chance(0.5)) touch("message", "Nhắn nhắc lịch học thử", lt(bt, 60, 48 * 60));
          taskIns.push({ leadId: id, title: "Nhắc PH lịch học thử", dueAt: vnAt(addDays(trialFuture.s.date, -1), "18:00"), assigneeId: assignee, createdAt: bt });
        } else if (trialPast) {
          const s = trialPast.s;
          const noShow = status === "nurturing";
          const rAt = capAt(notFuture(addMin(sessEnd(s), int(15, 90))));
          const bId = book(s, bt, noShow ? "no_show" : "attended", "trial_scheduled", "schedule_trial", rAt);
          const tb = trialIns.find((z) => z.id === bId);
          if (tb) tb.resultBy = s.teacherUserId;
          result(s, bId, rAt, !noShow, noShow ? "nurturing" : "trial_done", noShow ? "trial_no_show" : "trial_attended");
          t = rAt;
          if (status === "trial_done") {
            taskIns.push({ leadId: id, title: "Gọi chốt sau học thử", dueAt: addMin(rAt, 24 * 60), assigneeId: assignee, createdByRule: "TRIAL_DONE_FOLLOWUP", createdAt: rAt });
          } else if (status === "deciding") {
            const c = lt(rAt, 60, 3 * 24 * 60);
            touch("call", "Gọi tư vấn sau học thử, PH hỏi lịch lớp", c);
            trans("deciding", "await_decision", addMin(c, 1), "PH cần bàn thêm với gia đình");
          } else if (status === "lost") {
            const c = lt(rAt, 120, 6 * 24 * 60);
            lostReason = pick(LOST_REASONS);
            touch("call", "Gọi chốt sau học thử", c);
            trans("lost", "lose", addMin(c, 1), lostReason, "status_change", { lostReason });
          } else if (status === "nurturing" && chance(0.5)) {
            touch("message", pick(MSGS), lt(rAt, 24 * 60, 10 * 24 * 60));
          } else if (status === "enrolled") {
            touch("call", "Tư vấn gói học sau buổi thử", lt(rAt, 30, 24 * 60));
          }
        }
      } else if (status === "nurturing" && chance(0.4)) {
        const c1 = lt(base, 5, 180);
        touch("call", pick(CALL_MISS), c1);
        const c2 = lt(c1, 20 * 60, 30 * 60);
        touch("call", pick(CALL_MISS), c2);
        L.firstCall = c1;
        trans("nurturing", "nurture", addMin(c2, 1), "Chưa liên lạc được, đưa vào nuôi dưỡng");
      } else {
        const t = contact(status === "contacted" ? 6 * 60 : 24 * 60);
        if (status === "contacted") {
          if (chance(0.5)) touch("message", pick(MSGS), lt(t, 60, 30 * 60));
        } else if (status === "consulting" || status === "deciding" || status === "enrolled") {
          const n1 = lt(t, 60, 3 * 24 * 60);
          touch("note", pick(NOTES_LEAD), n1);
          trans("consulting", "consult", addMin(n1, 1), null);
          if (status === "deciding") {
            const c = lt(n1, 60, 5 * 24 * 60);
            touch("call", "Gửi báo giá, PH hẹn trả lời", c);
            trans("deciding", "await_decision", addMin(c, 1), null);
          }
        } else if (status === "nurturing") {
          const c = lt(t, 60, 4 * 24 * 60);
          trans("nurturing", "nurture", c, pick(["PH muốn chờ khai giảng đợt sau", "Con đang ôn thi, hẹn liên hệ lại", "PH cân nhắc tài chính"]));
          if (chance(0.5)) touch("message", pick(MSGS), lt(c, 24 * 60, 14 * 24 * 60));
        } else if (status === "lost") {
          const c = lt(t, 60, 12 * 24 * 60);
          lostReason = pick(LOST_REASONS);
          trans("lost", "lose", c, lostReason, "status_change", { lostReason });
        }
      }
    }
    if (conv && convAt) {
      if (L.cur !== "consulting" && L.cur !== "trial_done" && L.cur !== "deciding") trans("consulting", "consult", new Date(Math.min(convAt.getTime() - 60e3, lt(base, 10, 60).getTime())), null);
      const sorted = [...conv.enrs].sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime());
      sorted.forEach((e, i) => {
        const isLast = i === sorted.length - 1;
        acts.push({
          type: "status_change", content: `Ghi danh ${e.kid.name} vào lớp ${e.cls.code}`, actor: assignee, at: new Date(Math.max(e.enrolledAt.getTime(), createdAt.getTime() + 60e3)),
          meta: { from: L.cur, to: isLast ? "enrolled" : L.cur, studentId: e.kid.id, enrollmentId: e.id, mediaConsent: conv.fam.mediaConsent },
        });
      });
      L.cur = "enrolled";
    }
    // Hẹn gọi lại / nuôi dưỡng
    const cur = L.cur;
    if (cur === "consulting" || cur === "deciding" || (cur === "nurturing" && chance(0.5))) {
      nextActionAt = cur === "nurturing" ? new Date(now + int(3, 20) * 86400e3) : chance(0.35) ? ago(int(1, 40)) : new Date(now + int(2, 96) * 3600e3);
      taskIns.push({ leadId: id, title: cur === "nurturing" ? "Gửi thông tin khai giảng" : "Gọi lại theo hẹn", dueAt: nextActionAt, assigneeId: assignee, createdAt: acts[acts.length - 1]?.at ?? createdAt });
    }
    // Việc "gọi lần đầu": mở nếu lead mới, đã xong nếu đã gọi
    const fc = L.firstCall;
    if (cur === "new") taskIns.push({ leadId: id, title: "Gọi tư vấn lần đầu", dueAt: addMin(createdAt, 15), assigneeId: assignee, createdByRule: "NEW_LEAD_FIRST_CALL", createdAt });
    else if (fc && assignee) {
      taskIns.push({ leadId: id, title: "Gọi tư vấn lần đầu", dueAt: addMin(createdAt, 15), assigneeId: assignee, doneAt: addMin(fc, 1), doneBy: assignee, createdByRule: "NEW_LEAD_FIRST_CALL", createdAt });
      acts.push({ type: "task_done", content: "Gọi tư vấn lần đầu", meta: null, at: addMin(fc, 1), actor: assignee });
    }
    acts.sort((a, b) => a.at.getTime() - b.at.getTime());
    const lastTouch = acts[acts.length - 1]?.at ?? createdAt;
    const utm = utmFor(src);
    const referrer = src === "referral" && chance(0.6) ? families.find((f) => f.centerId === centerKey && f.kids.length > 0 && f.parentId !== conv?.fam.parentId && chance(0.1)) : undefined;
    const convertedAt = conv ? (acts.filter((a) => a.type === "status_change" && a.content?.startsWith("Ghi danh")).pop()?.at ?? convAt) : null;
    leadIns.push({
      id, centerId, status: cur, parentName, phone: ph.local, phoneNormalized: ph.norm, email: conv?.fam.email ?? (chance(0.3) ? `lead${String(phoneSeq).padStart(5, "0")}@example.test` : null),
      childName: k0.name, childGrade: k0.grade, childBirthYear: syStart - 5 - k0.grade, school: chance(0.4) ? (k0.grade <= 5 ? `Tiểu học mẫu ${pick(QUAN)}` : `THCS mẫu ${pick(QUAN)}`) : null,
      interestedCourseId: k0.courseId, source: src, ...utm, referrerParentId: referrer?.parentId ?? null,
      referralCode: src === "referral" && centerId === cs1.id && chance(0.25) ? "PHAN01" : null,
      assignedToId: assignee, assignedAt, lastTouchAt: lastTouch, nextActionAt, lostReason,
      convertedParentId: conv ? conv.fam.parentId : null, convertedStudentId: conv ? (conv.enrs[0]?.kid.id ?? null) : null, convertedAt,
      consentAt: src === "web-form" || src === "facebook" || src === "tiktok" || src === "ads" ? createdAt : null,
      marketingOptOut: cur === "lost" && chance(0.08), notes: chance(0.15) ? pick(NOTES_LEAD) : null, createdAt, updatedAt: lastTouch,
    });
    for (const k of kidsSpec) childIns.push({ id: k.id, leadId: id, fullName: k.name, grade: k.grade, birthYear: syStart - 5 - k.grade, interestedCourseId: k.courseId, convertedStudentId: k.studentId, createdAt });
    for (const a of acts) actIns.push({ leadId: id, type: a.type, content: a.content, meta: a.meta, actorId: a.actor, createdAt: a.at });
    if (assignee && assignedAt) {
      const st = assignStats.get(assignee) ?? { n: 0, last: assignedAt };
      if (assignedAt.getTime() > now - 30 * 86400e3) st.n++;
      if (assignedAt.getTime() > st.last.getTime()) st.last = assignedAt;
      assignStats.set(assignee, st);
    }
    bump(`leads_${cur}`);
  };

  // Lead đã chốt: gắn với phụ huynh / học viên thật trong seed (ghi danh trong ~95 ngày)
  for (const f of families) {
    const enrs = f.kids.map((k) => k.enrs.filter((e) => !e.continuing).sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime())[0]).filter((e): e is EnrPlan => !!e);
    const first = [...enrs].sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime())[0];
    if (!first || first.enrolledAt.getTime() < now - 95 * 86400e3 || !chance(0.55)) continue;
    makeLead("enrolled", f.centerId, { fam: f, enrs: [first, ...enrs.filter((e) => e !== first)] });
  }
  const FUNNEL: [LeadStatus, number][] = [["new", 34], ["contacted", 34], ["consulting", 24], ["trial_scheduled", 18], ["trial_in_progress", 6], ["trial_done", 14], ["deciding", 20], ["nurturing", 40], ["lost", 62]];
  for (const [st, n] of FUNNEL) {
    for (let i = 0; i < n; i++) {
      const centerId = st === "new" && chance(0.1) ? null : chance(0.6) ? cs1.id : cs2.id;
      makeLead(st, centerId, null);
    }
  }
  await inChunks(leadIns, (p) => db.insert(leads).values(p));
  await inChunks(childIns, (p) => db.insert(leadChildren).values(p));
  await inChunks(trialIns, (p) => db.insert(trialBookings).values(p));
  await inChunks(actIns, (p) => db.insert(leadActivities).values(p), 500);
  await inChunks(taskIns, (p) => db.insert(leadTasks).values(p));
  bump("leads", leadIns.length);
  bump("lead_activities", actIns.length);
  bump("lead_tasks", taskIns.length);
  bump("trial_bookings", trialIns.length);
  const statOf = (u: string) => assignStats.get(u);
  await db.insert(leadAssignees).values([
    ...[uidOf("sale3"), uidOf("sale4")].map((u) => ({ userId: u, centerId: cs1.id, isAvailable: true, roundsReceived: statOf(u)?.n ?? 0, lastAssignedAt: statOf(u)?.last ?? null })),
    ...sales2.map((u) => ({ userId: u, centerId: cs2.id, isAvailable: true, roundsReceived: statOf(u)?.n ?? 0, lastAssignedAt: statOf(u)?.last ?? null })),
    { userId: uidOf("mgr2"), centerId: cs2.id, isAvailable: false, note: "Chỉ nhận khi thiếu người" },
  ]);
  for (const u of [x.sale1U.id, x.sale2U.id]) {
    const s = statOf(u);
    if (s) await db.update(leadAssignees).set({ roundsReceived: s.n, lastAssignedAt: s.last }).where(and(eq(leadAssignees.userId, u), eq(leadAssignees.centerId, cs1.id)));
  }

  /* ---------------- Tài chính: đơn học phí, kế hoạch trả góp, khoản thu, hoàn tiền, hoa hồng ---------------- */
  const pmCash2Id = uid();
  await db.insert(paymentMethods).values({ id: pmCash2Id, code: "TM-CS2", name: "Tiền mặt tại CS2", kind: "cash", centerId: cs2.id, allowFor: ["course", "product"], sortOrder: 1 });
  const cashOf = (centerId: string) => (centerId === cs1.id ? x.pmCashCS1Id : pmCash2Id);
  type Scenario = "normal" | "overdue" | "partial" | "pending" | "prepay" | "unpaid" | "full" | "cancel";
  interface PayTmp {
    row: typeof payments.$inferInsert;
    centerId: string;
    decidedAt: Date | null;
    amount: number;
    status: "confirmed" | "recorded" | "rejected";
  }
  interface OrderTmp {
    row: typeof orders.$inferInsert & { id: string; total: number; centerId: string };
    enr: EnrPlan;
    pays: PayTmp[];
    createdAt: Date;
    cancelledAt: Date | null;
  }
  const orderList: OrderTmp[] = [];
  const itemIns: (typeof orderItems.$inferInsert)[] = [];
  const instIns: (typeof orderInstallments.$inferInsert)[] = [];
  let orderSeq = x.seq.order;
  let noOrder = 0;
  const sortedEnrs = [...allEnrs].sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime());
  for (const e of sortedEnrs) {
    if (e.status === "trial") continue;
    if (e.status === "active" && chance(0.05)) {
      noOrder++; // "Thiếu học phí: chưa lập đơn"
      continue;
    }
    const centerId = e.cls.centerId;
    const crs = e.cls.course;
    const subtotal = packagePrice(crs.listPrice, crs.totalSessions, e.pkg);
    const sibling = e.kid.fam.kids.length > 1 && e.kid.fam.kids[0] !== e.kid;
    const disc = sibling ? { type: "percent" as const, value: 10, note: "Ưu đãi anh chị em 10%" } : chance(0.15) ? (chance(0.5) ? { type: "amount" as const, value: 500_000, note: "Ưu đãi đăng ký sớm" } : { type: "percent" as const, value: 5, note: "Khuyến mãi tháng khai giảng" }) : null;
    const discountAmount = disc ? (disc.type === "percent" ? Math.round((subtotal * disc.value) / 100) : Math.min(disc.value, subtotal)) : 0;
    const total = subtotal - discountAmount;
    const orderAt = notFuture(later(e.enrolledAt, 5, 180));
    const orderDate = vnDate(orderAt);
    const nInst = e.pkg >= 24 ? weighted<number>([[1, 0.55], [2, 0.3], [3, 0.15]]) : 1;
    const plan = buildInstallmentPlan(total, nInst, addDays(orderDate, int(0, 3)));
    const oid = uid();
    const method = chance(0.45) ? cashOf(centerId) : x.pmBankId;
    const fam = e.kid.fam;
    const tmp: OrderTmp = {
      row: {
        id: oid, code: orderCode(yr, ++orderSeq), type: "course", status: "pending_payment", centerId, parentId: fam.parentId, studentId: e.kid.id, enrollmentId: e.id,
        customerName: fam.name, customerPhone: fam.norm, customerEmail: fam.email, subtotal, discountType: disc?.type ?? null, discountValue: disc?.value ?? null,
        discountAmount, total, paymentMethodId: method, internalNote: disc?.note ?? null, createdBy: e.createdBy, createdAt: orderAt,
      },
      enr: e, pays: [], createdAt: orderAt, cancelledAt: null,
    };
    orderList.push(tmp);
    itemIns.push({ orderId: oid, courseId: crs.id, description: `Học phí ${crs.code} — gói ${e.pkg} buổi`, quantity: 1, unitPrice: subtotal, amount: subtotal, discountAmount, netAmount: total, packageSessions: e.pkg, studentId: e.kid.id, enrollmentId: e.id });
    for (const p of plan) instIns.push({ orderId: oid, seq: p.seq, amount: p.amount, dueDate: p.dueDate });

    const endDate = e.endedAt ? vnDate(e.endedAt) : today;
    let scen: Scenario;
    if (e.status === "completed") scen = "full";
    else if (e.status === "withdrawn") scen = chance(0.3) ? "cancel" : "full";
    else scen = weighted<Scenario>([["normal", 0.64], ["overdue", 0.12], ["partial", 0.06], ["pending", 0.08], ["prepay", 0.07], ["unpaid", 0.03]]);
    if (scen === "cancel") {
      tmp.row.status = "cancelled";
      tmp.row.cancelReason = "Học viên nghỉ trước khi đóng học phí";
      tmp.cancelledAt = e.endedAt ? later(e.endedAt, 60, 2 * 24 * 60) : later(orderAt, 60, 24 * 60);
      continue;
    }
    const dueNow = plan.filter((p) => p.dueDate <= today);
    const lastDue = dueNow[dueNow.length - 1];
    const mkPay = (amount: number, paidDate: string, status: "confirmed" | "recorded" | "rejected") => {
      const recordedAt = notFuture(maxDateOf(vnAt(paidDate, hm()), orderAt));
      const decidedAt = status === "recorded" ? null : later(recordedAt, 30, 26 * 60);
      const recorder = pick(salesOf(centerId));
      const pm = chance(0.5) ? cashOf(centerId) : x.pmBankId;
      tmp.pays.push({
        centerId, decidedAt, amount, status,
        row: {
          id: uid(), orderId: oid, centerId, recordedAmount: amount, amount, paymentMethodId: pm, paidAt: paidDate, status, source: "manual",
          payerName: fam.name, note: pm === x.pmBankId ? `CK ${tmp.row.code}` : null, recordedBy: recorder, recordedAt,
          decidedBy: decidedAt ? accOf(centerId) : null, decidedAt, decisionReason: status === "rejected" ? "Không thấy tiền về tài khoản — kiểm tra lại (mẫu)" : null, createdAt: recordedAt,
        },
      });
    };
    for (const p of plan) {
      const isDue = p.dueDate <= today;
      let pay = isDue;
      if (scen === "full") pay = e.status === "completed" || p.seq === 1 || p.dueDate <= endDate;
      if (scen === "prepay" && !isDue && p.seq === dueNow.length + 1) pay = true;
      if (scen === "overdue" && p === lastDue) pay = false;
      if (scen === "unpaid") pay = false;
      if (scen === "pending" && !lastDue && p.seq === 1) pay = true;
      if (!pay) continue;
      let amount = p.amount;
      let status: "confirmed" | "recorded" = "confirmed";
      if (scen === "partial" && p === lastDue) amount = Math.max(1000, Math.floor(p.amount / 2 / 1000) * 1000);
      if (scen === "pending" && (p === lastDue || (!lastDue && p.seq === 1))) status = "recorded";
      const paidDate = status === "recorded" ? maxISO(addDays(today, -int(0, 2)), orderDate) : minISO(today, maxISO(orderDate, addDays(p.dueDate, -int(0, 4))));
      if (status === "confirmed" && chance(0.025)) mkPay(amount, paidDate, "rejected");
      mkPay(amount, paidDate, status);
    }
  }
  // Số phiếu thu theo thứ tự thời gian xác nhận, riêng từng cơ sở
  const rcSeq: Record<string, number> = { CS1: x.seq.receiptCS1, CS2: 0 };
  const confirmedPays = orderList.flatMap((o) => o.pays).filter((p) => p.status === "confirmed" && p.decidedAt).sort((a, b) => (a.decidedAt?.getTime() ?? 0) - (b.decidedAt?.getTime() ?? 0));
  for (const p of confirmedPays) {
    const cc = ccOf(p.centerId);
    rcSeq[cc] = (rcSeq[cc] ?? 0) + 1;
    p.row.receiptNo = receiptNumber(cc, yr, rcSeq[cc]!);
  }
  const orderEvIns: (typeof orderEvents.$inferInsert)[] = [];
  const ledgerIns: (typeof financeLedger.$inferInsert)[] = [];
  const refundIns: (typeof refunds.$inferInsert)[] = [];
  const commIns: (typeof commissions.$inferInsert)[] = [];
  const curPeriod = periodOf(today);
  const prevPeriod = toISODate(new Date(Date.UTC(yr, Number(today.slice(5, 7)) - 2, 1))).slice(0, 7);
  const refundPlan = ["paid", "approved", "pending", "rejected", "pending", "paid", "approved"] as const;
  let refundIdx = 0;
  for (const o of orderList) {
    const { row } = o;
    const centerId = row.centerId;
    const acc = accOf(centerId);
    orderEvIns.push({ orderId: row.id, event: "create", toStatus: "pending_payment", note: row.discountAmount ? `Giảm ${row.discountAmount.toLocaleString("vi-VN")}đ` : null, actorId: row.createdBy ?? null, createdAt: o.createdAt });
    ledgerIns.push({ orderId: row.id, centerId, entryType: "charge", amount: row.total, refId: row.id, note: `Tạo đơn ${row.code}`, actorId: row.createdBy ?? null, createdAt: o.createdAt });
    if (o.cancelledAt) {
      orderEvIns.push({ orderId: row.id, event: "cancel", fromStatus: "pending_payment", toStatus: "cancelled", note: row.cancelReason ?? null, actorId: mgrOf(centerId), createdAt: o.cancelledAt });
      ledgerIns.push({ orderId: row.id, centerId, entryType: "cancel", amount: -row.total, refId: row.id, note: `Huỷ đơn: ${row.cancelReason ?? ""}`, actorId: mgrOf(centerId), createdAt: o.cancelledAt });
      continue;
    }
    let confirmed = 0;
    let status: "pending_payment" | "partially_paid" | "paid" = "pending_payment";
    let paidAt: Date | null = null;
    const done = o.pays.filter((p) => p.status === "confirmed" && p.decidedAt).sort((a, b) => (a.decidedAt?.getTime() ?? 0) - (b.decidedAt?.getTime() ?? 0));
    for (const p of done) {
      const at = p.decidedAt ?? o.createdAt;
      confirmed += p.amount;
      ledgerIns.push({ orderId: row.id, centerId, entryType: "payment", amount: -p.amount, refId: p.row.id ?? null, note: p.row.receiptNo ?? null, actorId: acc, createdAt: at });
      const next = confirmed >= row.total ? "paid" : "partially_paid";
      if (next !== status) {
        orderEvIns.push({ orderId: row.id, event: "status", fromStatus: status, toStatus: next, note: `Xác nhận ${p.row.receiptNo ?? ""}`, actorId: acc, createdAt: at });
        status = next;
        if (next === "paid") paidAt = at;
      }
    }
    let finalStatus: "pending_payment" | "partially_paid" | "paid" | "refunded" = status;
    // Hoàn tiền cho HV nghỉ giữa chừng đã đóng tiền
    const e = o.enr;
    let refunded = false;
    if (e.status === "withdrawn" && confirmed > 0 && e.endedAt) {
      const prop = refundProposal({ paid: confirmed, packageValue: row.total, packageSessions: e.pkg, consumedSessions: e.consumed + e.carried, alreadyRefunded: 0 });
      if (prop.refundable > 0) {
        const rs = refundPlan[refundIdx++ % refundPlan.length] ?? "pending";
        const amount = rs === "approved" || rs === "paid" ? Math.max(1000, Math.floor((prop.refundable * (chance(0.5) ? 1 : 0.9)) / 1000) * 1000) : prop.refundable;
        const reqAt = later(e.endedAt, 60, 3 * 24 * 60);
        const decAt = rs === "pending" ? null : later(reqAt, 120, 2 * 24 * 60);
        const payAt = rs === "paid" && decAt ? later(decAt, 120, 3 * 24 * 60) : null;
        const refundId = uid();
        refundIns.push({
          id: refundId, orderId: row.id, enrollmentId: e.id, centerId, status: rs, amount, proposedAmount: prop.refundable, sessionsUsed: prop.usedSessions, sessionsTotal: e.pkg,
          reason: e.endReason ?? "Học viên nghỉ học", requestedBy: e.createdBy, decidedBy: decAt ? mgrOf(centerId) : null, decidedAt: decAt,
          decisionNote: rs === "rejected" ? "Đã quá 30 ngày kể từ ngày nghỉ theo chính sách (mẫu)" : decAt ? "Đồng ý hoàn theo số buổi còn lại" : null,
          paidBy: payAt ? acc : null, paidAt: payAt, paymentMethodId: payAt ? x.pmBankId : null, payoutRef: payAt ? `FT${yr}${int(100000, 999999)}` : null, createdAt: reqAt,
        });
        if (payAt) {
          refunded = true;
          ledgerIns.push({ orderId: row.id, centerId, entryType: "refund", amount, refId: refundId, note: "Chi hoàn Chuyển khoản", actorId: acc, createdAt: payAt });
          const fully = amount >= confirmed;
          orderEvIns.push({ orderId: row.id, event: "refund_paid", fromStatus: status, toStatus: fully ? "refunded" : status, note: `${amount.toLocaleString("vi-VN")}đ · Chuyển khoản`, actorId: acc, createdAt: payAt });
          if (fully) finalStatus = "refunded";
        }
      }
    }
    row.status = finalStatus;
    row.updatedAt = o.pays.reduce((m, p) => maxDateOf(m, p.decidedAt ?? p.row.recordedAt ?? m), o.createdAt);
    // Hoa hồng tư vấn cho đơn đã thu đủ
    if (finalStatus === "paid" && paidAt && !refunded && row.createdBy) {
      const amount = computeCommission(x.saleRule, row.total);
      const period = periodOf(vnDate(paidAt));
      if (amount > 0) {
        const cst = period === curPeriod ? "accrued" : period === prevPeriod ? "approved" : "paid";
        const apprAt = cst === "accrued" ? null : notFuture(vnAt(`${period}-28`, "16:00"));
        commIns.push({
          orderId: row.id, centerId, kind: "sale", ruleId: x.saleRule.id, beneficiaryUserId: row.createdBy, beneficiaryName: userName.get(row.createdBy) ?? "Tư vấn viên",
          baseAmount: row.total, rateLabel: describeRule(x.saleRule), originalAmount: amount, amount, period, status: cst,
          approvedBy: apprAt ? mgrOf(centerId) : null, approvedAt: apprAt, paidBy: cst === "paid" ? acc : null,
          paidAt: cst === "paid" && apprAt ? notFuture(new Date(apprAt.getTime() + 7 * 86400e3)) : null, payoutRef: cst === "paid" ? `HH-${period}` : null, createdAt: paidAt,
        });
      }
    }
  }
  const payIns = orderList.flatMap((o) => o.pays.map((p) => p.row));
  await inChunks(orderList.map((o) => o.row), (p) => db.insert(orders).values(p));
  await inChunks(itemIns, (p) => db.insert(orderItems).values(p));
  await inChunks(instIns, (p) => db.insert(orderInstallments).values(p));
  await inChunks(payIns, (p) => db.insert(payments).values(p));
  await inChunks(orderEvIns, (p) => db.insert(orderEvents).values(p));
  await inChunks(ledgerIns, (p) => db.insert(financeLedger).values(p));
  if (refundIns.length) await db.insert(refunds).values(refundIns);
  if (commIns.length) await inChunks(commIns, (p) => db.insert(commissions).values(p));
  bump("orders", orderList.length);
  bump("payments", payIns.length);
  bump("refunds", refundIns.length);
  bump("commissions", commIns.length);
  bump("enrollments_without_order", noOrder);

  /* ---------------- Học bạ theo mốc & chứng nhận hoàn thành ---------------- */
  const rcIns: (typeof reportCards.$inferInsert)[] = [];
  const rcScoreIns: (typeof reportCardScores.$inferInsert)[] = [];
  const avgByEnr = new Map<string, number[]>();
  type RcState = "published" | "approved" | "submitted" | "returned" | "draft" | "none";
  for (const cls of plans) {
    if (cls.status !== "running" && cls.status !== "finished") continue;
    for (const m of reportCardMilestones(cls.planned)) {
      const s = cls.sessions.find((z) => z.seq === m);
      if (!s || s.status !== "completed" || s.date > addDays(today, -2)) continue;
      const fresh = s.date > addDays(today, -10);
      for (const e of cls.enrs) {
        if (e.status === "trial" || e.startSeq > m || (e.cutDate !== null && s.date >= e.cutDate)) continue;
        const state = fresh
          ? weighted<RcState>([["published", 0.3], ["approved", 0.1], ["submitted", 0.25], ["draft", 0.15], ["none", 0.2]])
          : weighted<RcState>([["published", 0.86], ["approved", 0.04], ["submitted", 0.03], ["returned", 0.02], ["none", 0.05]]);
        if (state === "none") continue;
        const scores = cls.course.criteriaIds.map(() => (chance(0.1) ? 2 : int(3, 5)));
        const avg = averageScore(scores);
        if (avg !== null) avgByEnr.set(e.id, [...(avgByEnr.get(e.id) ?? []), avg]);
        const rcId = uid();
        const submittedAt = state === "draft" ? null : notFuture(vnAt(addDays(s.date, int(1, 3)), "21:00"));
        const reviewedAt = (state === "published" || state === "approved" || state === "returned") && submittedAt ? later(submittedAt, 60, 3 * 24 * 60) : null;
        rcIns.push({
          id: rcId, enrollmentId: e.id, milestoneSeq: m, sessionId: s.id, status: state, teacherComment: pick(RC_COMMENTS),
          strengths: pick(["Tư duy logic tốt", "Lắp ráp chắc chắn", "Tự tin thuyết trình", "Hợp tác nhóm tốt"]), improvements: pick(["Cần cẩn thận hơn khi đi dây", "Cần tập trung hơn cuối buổi", "Luyện thêm vòng lặp", "Mạnh dạn phát biểu hơn"]),
          averageScore: state === "draft" || avg === null ? null : avg.toFixed(1), authorId: s.teacherUserId, submittedAt,
          reviewedBy: reviewedAt ? gvuOf(cls.centerId) : null, reviewedAt, returnReason: state === "returned" ? "Nhận xét chưa cụ thể, bổ sung ví dụ trong buổi học" : null,
          publishedAt: state === "published" && reviewedAt ? later(reviewedAt, 5, 120) : null, createdAt: vnAt(s.date, "21:00"),
        });
        cls.course.criteriaIds.forEach((criterionId, k) => {
          rcScoreIns.push({ reportCardId: rcId, criterionId, score: scores[k] ?? null });
        });
      }
    }
  }
  await inChunks(rcIns, (p) => db.insert(reportCards).values(p));
  await inChunks(rcScoreIns, (p) => db.insert(reportCardScores).values(p), 500);
  bump("report_cards", rcIns.length);
  const complIns: (typeof courseCompletions.$inferInsert)[] = [];
  const certSeq = new Map<string, number>();
  for (const e of allEnrs) {
    if (e.status !== "completed" || !e.endedAt) continue;
    const avgs = avgByEnr.get(e.id) ?? [];
    const avg = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null;
    const n = (certSeq.get(e.cls.course.code) ?? 0) + 1;
    certSeq.set(e.cls.course.code, n);
    complIns.push({
      enrollmentId: e.id, courseId: e.cls.course.id, grade: gradeFromAverage(avg), teacherEvaluation: pick(RC_COMMENTS), averageScore: avg === null ? null : avg.toFixed(1),
      certificateNo: certificateNumber(e.cls.course.code, Number(vnDate(e.endedAt).slice(0, 4)), n), nextCourseId: e.cls.course.nextCourseId, issuedAt: e.endedAt, issuedBy: mgrOf(e.cls.centerId), createdAt: e.endedAt,
    });
  }
  if (complIns.length) await db.insert(courseCompletions).values(complIns);
  bump("course_completions", complIns.length);

  /* ---------------- Chăm sóc: việc rủi ro, tái tục, yêu cầu PH, đánh giá, thông báo ---------------- */
  const careIns: (typeof careTasks.$inferInsert)[] = [];
  for (const e of allEnrs) {
    if (e.cls.status !== "running" || (e.status !== "active" && e.status !== "trial") || e.recs.length === 0) continue;
    const records = e.recs.map((r) => ({ sessionDate: r.sess.date, sequenceNo: r.sess.seq, status: r.status }));
    const lastRec = e.recs[e.recs.length - 1]!;
    for (const sig of detectRisks(records)) {
      const createdAt = notFuture(addMin(vnAt(lastRec.sess.date, lastRec.sess.end), int(30, 180)));
      const inProgress = chance(0.3);
      careIns.push({
        studentId: e.kid.id, enrollmentId: e.id, centerId: e.cls.centerId, code: sig.code, title: `Chăm sóc: ${sig.detail}`, severity: sig.severity,
        status: inProgress ? "in_progress" : "open", dueAt: addMin(createdAt, (sig.severity === 1 ? 24 : 72) * 60),
        assigneeId: inProgress || chance(0.5) ? pick(salesOf(e.cls.centerId)) : null, dedupeKey: `${e.id}:${sig.code}`, createdAt,
      });
    }
  }
  for (const e of rShuffle(rng, allEnrs.filter((z) => z.cls.status === "running" && z.recs.length >= 6)).slice(0, 14)) {
    const r = e.recs[int(1, e.recs.length - 4)];
    if (!r) continue;
    const createdAt = addMin(vnAt(r.sess.date, r.sess.end), 60);
    const who = pick(salesOf(e.cls.centerId));
    careIns.push({
      studentId: e.kid.id, enrollmentId: e.id, centerId: e.cls.centerId, code: "CONSECUTIVE_ABSENCE", title: "Chăm sóc: Nghỉ 2 buổi liên tiếp", severity: 1, status: "done",
      dueAt: addMin(createdAt, 24 * 60), assigneeId: who, outcome: pick(["Đã gọi PH: con ốm, đã sắp xếp học bù", "PH đi công tác, con quay lại học tuần sau", "Đã nhắn Zalo, PH xác nhận"]),
      resolvedAt: later(createdAt, 60, 20 * 60), resolvedBy: who, dedupeKey: `${e.id}:CONSECUTIVE_ABSENCE`, createdAt,
    });
  }
  for (const e of allEnrs) {
    if (e.status !== "completed" || !e.endedAt) continue;
    const cont = e.kid.enrs.some((z) => z.continuing);
    const st = cont ? "done" : weighted<"open" | "done" | "dismissed">([["open", 0.35], ["done", 0.45], ["dismissed", 0.2]]);
    const who = pick(salesOf(e.cls.centerId));
    careIns.push({
      studentId: e.kid.id, enrollmentId: e.id, centerId: e.cls.centerId, code: "RENEWAL", title: e.cls.course.nextCourseId ? "Tư vấn tái tục: gợi ý khoá tiếp theo" : "Tư vấn tái tục sau hoàn thành khoá", severity: 2,
      status: st, dueAt: addMin(e.endedAt, 72 * 60), assigneeId: st === "open" && chance(0.5) ? null : who,
      outcome: cont ? "PH đăng ký học tiếp khoá sau" : st === "done" ? pick(["PH hẹn đăng ký sau kỳ thi", "Chưa có nhu cầu, gửi ưu đãi qua Zalo"]) : st === "dismissed" ? "Gia đình chuyển nơi ở" : null,
      resolvedAt: st === "open" ? null : later(e.endedAt, 24 * 60, 10 * 24 * 60), resolvedBy: st === "open" ? null : who, dedupeKey: `${e.id}:RENEWAL`, createdAt: e.endedAt,
    });
  }
  await inChunks(careIns, (p) => db.insert(careTasks).values(p));
  bump("care_tasks", careIns.length);

  // Yêu cầu phụ huynh
  let reqSeq = x.seq.request;
  const reqIns: (typeof parentRequests.$inferInsert)[] = [];
  const reqEvIns: (typeof parentRequestEvents.$inferInsert)[] = [];
  const activeRun = rShuffle(rng, allEnrs.filter((e) => e.cls.status === "running" && e.status === "active"));
  let ri = 0;
  const nextActive = () => activeRun[ri++ % Math.max(1, activeRun.length)];
  type ReqType = "absence" | "pause" | "schedule_change" | "makeup" | "refund" | "complaint" | "other";
  type ReqStatus = "new" | "in_progress" | "approved" | "rejected" | "done" | "cancelled";
  const addRequest = (e: EnrPlan, type: ReqType, status: ReqStatus, channel: "phone" | "zalo" | "walk_in" | "app" | "email", content: string, createdAt: Date, extra: Partial<typeof parentRequests.$inferInsert> = {}) => {
    const reqId = uid();
    const staffId = pick(salesOf(e.cls.centerId));
    const mgr = mgrOf(e.cls.centerId);
    const assigned = status !== "new";
    const decided = status === "approved" || status === "rejected" || (status === "done" && ["absence", "pause", "schedule_change", "makeup", "refund"].includes(type));
    const decidedAt = decided ? later(createdAt, 20, 6 * 60) : null;
    const completedAt = status === "done" ? later(decidedAt ?? createdAt, 20, 12 * 60) : null;
    reqIns.push({
      id: reqId, code: requestCode(yr, ++reqSeq), type, status, channel, centerId: e.cls.centerId, studentId: e.kid.id, parentId: e.kid.fam.parentId,
      enrollmentId: type === "complaint" || type === "other" ? null : e.id, content, dueAt: slaDue(createdAt, type), assigneeId: assigned ? staffId : null,
      decidedBy: decided ? mgr : null, decidedAt, completedAt, resolution: status === "done" ? pick(["Đã xử lý và báo PH qua Zalo", "Đã xếp lịch, PH xác nhận", "Đã phản hồi PH"]) : status === "rejected" ? "Không đáp ứng điều kiện theo chính sách" : null,
      createdBy: staffId, createdAt, ...extra,
    });
    reqEvIns.push({ requestId: reqId, action: "create", toStatus: "new", note: content, actorId: staffId, createdAt });
    if (assigned) reqEvIns.push({ requestId: reqId, action: "assign", fromStatus: "new", toStatus: "in_progress", note: `Giao cho ${userName.get(staffId) ?? ""}`, actorId: mgr, createdAt: addMin(createdAt, 5) });
    if (decided && decidedAt) reqEvIns.push({ requestId: reqId, action: status === "rejected" ? "reject" : "approve", fromStatus: "in_progress", toStatus: status === "rejected" ? "rejected" : "approved", actorId: mgr, createdAt: decidedAt });
    if (completedAt) reqEvIns.push({ requestId: reqId, action: "complete", fromStatus: decided ? "approved" : "in_progress", toStatus: "done", actorId: staffId, createdAt: completedAt });
  };
  const futureOf = (e: EnrPlan) => e.cls.sessions.find((s) => s.date > today && s.status === "scheduled");
  for (const [status, hours] of [["new", 2], ["approved", 20], ["done", 150]] as const) {
    const e = nextActive();
    const fs = e ? futureOf(e) : undefined;
    if (e && fs) addRequest(e, "absence", status, pick(["zalo", "app", "phone"] as const), `Con có việc gia đình, xin nghỉ buổi ${ddmmyyyy(fs.date)} (mẫu)`, ago(Math.min(hours, 30)), { sessionId: fs.id });
  }
  for (const e of allEnrs.filter((z) => z.status === "paused" && z.pausedAt).slice(0, 4)) {
    addRequest(e, "pause", "done", "phone", "Gia đình xin bảo lưu cho con (mẫu)", vnAt(addDays(e.pausedAt ?? today, -2), "10:00"), { dateFrom: e.pausedAt, dateTo: e.pauseUntil });
  }
  {
    const e = nextActive();
    if (e) addRequest(e, "pause", "in_progress", "walk_in", "PH xin bảo lưu 1 tháng vì con ôn thi (mẫu)", ago(10), { dateFrom: addDays(today, 7), dateTo: addDays(today, 37) });
  }
  for (const status of ["new", "in_progress"] as const) {
    const e = nextActive();
    if (e) addRequest(e, "schedule_change", status, "zalo", "PH muốn chuyển sang lớp cuối tuần (mẫu)", ago(status === "new" ? 30 : 12));
  }
  let makeups = 0;
  for (const e of activeRun) {
    if (makeups >= 3) break;
    const miss = [...e.recs].reverse().find((r) => r.status === "absent_excused");
    if (!miss) continue;
    makeups++;
    addRequest(e, "makeup", makeups === 1 ? "approved" : makeups === 2 ? "done" : "new", "app", `Xin học bù buổi ${ddmmyyyy(miss.sess.date)} (mẫu)`, notFuture(addMin(vnAt(miss.sess.date, "20:00"), 60 * int(2, 20))), { missedSessionId: miss.sess.id });
  }
  for (const r of refundIns.filter((z) => z.status === "pending").slice(0, 2)) {
    const e = allEnrs.find((z) => z.id === r.enrollmentId);
    if (e) addRequest(e, "refund", "in_progress", "phone", "PH đề nghị hoàn học phí các buổi chưa học (mẫu)", r.createdAt instanceof Date ? r.createdAt : ago(48), { linked: { kind: "refund", id: r.id ?? "", href: "/hoan-tien" } });
  }
  for (const [status, hours] of [["new", 30], ["in_progress", 8], ["done", 200]] as const) {
    const e = nextActive();
    if (e) addRequest(e, "complaint", status, pick(["phone", "walk_in", "zalo"] as const), `${pick(FEEDBACK_BAD)} (mẫu)`, ago(hours));
  }
  {
    const e = nextActive();
    if (e) addRequest(e, "other", "done", "app", "Hỏi lịch nghỉ lễ và lịch học bù (mẫu)", ago(96));
  }
  await db.insert(parentRequests).values(reqIns);
  await db.insert(parentRequestEvents).values(reqEvIns);
  bump("parent_requests", reqIns.length);

  // Đánh giá của phụ huynh về buổi học gần đây
  const fbIns: (typeof parentFeedback.$inferInsert)[] = [];
  const fbCare: (typeof careTasks.$inferInsert)[] = [];
  for (const e of rShuffle(rng, allEnrs.filter((z) => z.cls.status === "running" && z.status === "active" && z.recs.length > 0)).slice(0, 34)) {
    const r = [...e.recs].reverse().find((z) => z.status === "present" && z.sess.status === "completed" && z.sess.date >= addDays(today, -21));
    if (!r) continue;
    const rating = weighted<number>([[5, 0.55], [4, 0.28], [3, 0.1], [2, 0.05], [1, 0.02]]);
    const teacherRating = Math.max(1, Math.min(5, rating + pick([0, 0, 0, 1, -1])));
    const createdAt = notFuture(addMin(vnAt(r.sess.date, r.sess.end), int(60, 30 * 60)));
    const low = Math.min(rating, teacherRating) <= 2;
    const fid = uid();
    let careTaskId: string | null = null;
    if (low) {
      careTaskId = uid();
      fbCare.push({ id: careTaskId, studentId: e.kid.id, enrollmentId: e.id, centerId: e.cls.centerId, code: "LOW_FEEDBACK", title: `PH đánh giá thấp (${Math.min(rating, teacherRating)}★) — gọi lại trong 24h`, severity: 2, dueAt: addMin(createdAt, 24 * 60), dedupeKey: `feedback:${fid}`, createdAt });
    }
    const status = low ? "new" : rating === 3 ? "acknowledged" : chance(0.6) ? "resolved" : "new";
    const who = pick(salesOf(e.cls.centerId));
    fbIns.push({
      id: fid, centerId: e.cls.centerId, studentId: e.kid.id, parentId: e.kid.fam.parentId, classId: e.cls.id, sessionId: r.sess.id, teacherId: r.sess.teacherId,
      rating, teacherRating, tags: rating >= 4 ? [pick(["teacher", "result", "content"])] : [pick(["facility", "schedule", "communication", "content"])],
      comment: rating >= 4 ? pick(FEEDBACK_GOOD) : pick(FEEDBACK_BAD), channel: pick(["app", "zalo", "phone"] as const), status,
      response: status === "resolved" ? "Cảm ơn anh/chị đã góp ý!" : null, respondedBy: status === "resolved" ? who : null, respondedAt: status === "resolved" ? later(createdAt, 30, 24 * 60) : null,
      careTaskId, createdBy: who, createdAt,
    });
  }
  if (fbCare.length) await db.insert(careTasks).values(fbCare);
  if (fbIns.length) await db.insert(parentFeedback).values(fbIns);
  bump("care_tasks", fbCare.length);
  bump("parent_feedback", fbIns.length);

  // Thông báo cho PH: tóm tắt buổi học 10 ngày gần nhất
  const notifIns: (typeof parentNotifications.$inferInsert)[] = [];
  for (const e of allEnrs) {
    for (const r of e.recs) {
      if (r.sess.status !== "completed" || r.sess.date < addDays(today, -10)) continue;
      const cls = e.cls;
      const sentAt = notFuture(addMin(vnAt(r.sess.date, r.sess.end), int(15, 120)));
      const present = r.status === "present" || r.status === "late";
      const recipients = [e.kid.fam.parentId, ...(e.kid.fam.second ? [e.kid.fam.second.id] : [])];
      for (const parentId of recipients) {
        const read = parentId === e.kid.fam.parentId && e.kid.fam.accountStatus === "active" && chance(0.6);
        notifIns.push({
          parentId, studentId: e.kid.id, channel: "in_app", template: "SESSION_SUMMARY", title: `Buổi ${r.sess.seq} · ${cls.name}`,
          body: `${present ? "Con có mặt" : "Con vắng"}${r.sess.topic ? ` · ${r.sess.topic}` : ""}`, link: "/parent/comments",
          params: { sessionId: r.sess.id, date: r.sess.date, studentId: e.kid.id }, status: read ? "read" : "sent", sentAt, readAt: read ? later(sentAt, 10, 24 * 60) : null, createdAt: sentAt,
        });
      }
    }
  }
  await inChunks(notifIns, (p) => db.insert(parentNotifications).values(p), 500);
  bump("parent_notifications", notifIns.length);

  /* ---------------- Nhân sự: ca làm, phân ca, chấm công 30 ngày, đơn từ ---------------- */
  const shS2Id = uid();
  const shC2Id = uid();
  await db.insert(workShifts).values([
    { id: shS2Id, centerId: cs2.id, code: "S2", name: "Ca sáng CS2", kind: "timed" as const, units: 0.5, segments: [{ from: "07:30", to: "11:30" }], plannedMinutes: 240, workplace: "own_center" as const, punchRequired: true },
    { id: shC2Id, centerId: cs2.id, code: "C2", name: "Ca chiều tối CS2", kind: "timed" as const, units: 1, segments: [{ from: "13:30", to: "21:00" }], plannedMinutes: 450, workplace: "own_center" as const, punchRequired: true },
  ]);
  const clockOf = (sh: { segments: { from: string; to: string; paid?: boolean }[] }) => {
    const segs = workSegments(sh.segments ?? []);
    return { start: segs[0]?.from ?? 480, end: segs[segs.length - 1]?.to ?? 1020 };
  };
  const hcClock = clockOf(x.shHC);
  const c1Clock = clockOf(x.shC1);
  const shiftFor = (p: { centerId: string; kind: HrKind }) =>
    p.kind === "office" ? { id: x.shHC.id, ...hcClock } : p.centerId === cs1.id ? { id: x.shC1.id, ...c1Clock } : { id: shC2Id, start: 810, end: 1260 };
  const workDays = (kind: HrKind) => (kind === "office" ? [1, 2, 3, 4, 5, 6] : kind === "teacher" ? [2, 3, 4, 5, 6, 7] : [2, 4, 6]);
  const coords = (centerId: string) => (centerId === cs1.id ? { lat: 16.0336, lng: 108.2212 } : { lat: 16.0678, lng: 108.2208 });
  const asgIns: (typeof shiftAssignments.$inferInsert)[] = [];
  const punchIns: (typeof attendancePunches.$inferInsert)[] = [];
  const reqHrIns: (typeof staffRequests.$inferInsert)[] = [];
  const workingDates = (p: { kind: HrKind }, from: number, to: number) => {
    const out: string[] = [];
    for (let k = from; k <= to; k++) {
      const d = addDays(today, k);
      if (workDays(p.kind).includes(weekdayOf(d))) out.push(d);
    }
    return out;
  };
  // Nghỉ phép đã duyệt (quá khứ) → không có lượt chấm công ngày đó
  const leaveSet = new Set<string>();
  const hrShuffled = rShuffle(rng, hrPeople);
  const hrRequest = (p: (typeof hrPeople)[number], v: Omit<typeof staffRequests.$inferInsert, "staffId" | "centerId" | "createdBy">) => {
    reqHrIns.push({ staffId: p.staffId, centerId: p.centerId, createdBy: p.userId, ...v });
  };
  hrShuffled.slice(0, 3).forEach((p, i) => {
    const d = pick(workingDates(p, -25, -3));
    leaveSet.add(`${p.staffId}|${d}`);
    const created = vnAt(addDays(d, -int(2, 6)), "09:00");
    hrRequest(p, { kind: "leave", status: "approved", dateFrom: d, dateTo: d, portion: "full", leaveType: i === 2 ? "unpaid" : "annual", leavePaid: i !== 2, days: 1, effectPreview: "→ P", appliedAt: vnAt(d, "09:00"), reason: pick(["Việc gia đình (mẫu)", "Đưa con đi khám (mẫu)", "Về quê dự đám cưới (mẫu)"]), decidedBy: mgrOf(p.centerId), decidedAt: later(created, 60, 20 * 60), createdAt: created });
  });
  {
    const p = hrShuffled[3];
    if (p) {
      const ds = workingDates(p, -18, -12).slice(0, 2);
      const from = ds[0];
      const to = ds[ds.length - 1];
      if (from && to) {
        for (const d of ds) leaveSet.add(`${p.staffId}|${d}`);
        const created = vnAt(from, "07:15");
        hrRequest(p, { kind: "leave", status: "approved", dateFrom: from, dateTo: to, portion: "full", leaveType: "sick_insurance", leavePaid: false, days: leaveDays(from, to, "full"), effectPreview: "→ P", reason: "Sốt xuất huyết, có giấy bác sĩ (mẫu)", decidedBy: mgrOf(p.centerId), decidedAt: later(created, 30, 6 * 60), createdAt: created });
      }
    }
  }
  hrShuffled.slice(4, 6).forEach((p) => {
    const ds = workingDates(p, 4, 25);
    const from = pick(ds);
    const to = ds.find((d) => d > from && chance(0.5)) ?? from;
    hrRequest(p, { kind: "leave", status: "pending", dateFrom: from, dateTo: to, portion: "full", leaveType: "annual", leavePaid: true, days: leaveDays(from, to, "full"), effectPreview: "→ P", reason: "Nghỉ phép năm (mẫu)", createdAt: ago(int(2, 60)) });
  });
  {
    const p = hrShuffled[6];
    if (p) {
      const d = pick(workingDates(p, 3, 14));
      hrRequest(p, { kind: "leave", status: "pending", dateFrom: d, dateTo: d, portion: "pm", leaveType: "compensatory", leavePaid: true, days: 0.5, effectPreview: "Nghỉ nửa ngày — giữ ca, trừ 0,5 ngày phép", reason: "Họp phụ huynh ở trường của con (mẫu)", createdAt: ago(int(1, 30)) });
    }
    const q = hrShuffled[7];
    if (q) {
      const d = pick(workingDates(q, -20, -8));
      const created = vnAt(addDays(d, -3), "10:00");
      hrRequest(q, { kind: "leave", status: "rejected", dateFrom: d, dateTo: d, portion: "full", leaveType: "annual", leavePaid: true, days: 1, effectPreview: "→ P", reason: "Việc cá nhân (mẫu)", decidedBy: mgrOf(q.centerId), decidedAt: later(created, 60, 12 * 60), decisionNote: "Ngày này thiếu người trực, đề nghị chọn ngày khác", createdAt: created });
    }
  }
  const lateDays: { p: (typeof hrPeople)[number]; d: string; min: number }[] = [];
  const missOut: { p: (typeof hrPeople)[number]; d: string; out: number }[] = [];
  const otDays: { p: (typeof hrPeople)[number]; d: string; from: number; to: number }[] = [];
  for (const p of hrPeople) {
    const sh = shiftFor(p);
    const s0 = sh.start;
    const e0 = sh.end;
    const { lat, lng } = coords(p.centerId);
    const hrAdmin = p.centerId === cs1.id ? x.hrU.id : uidOf("mgr2");
    for (let k = -30; k <= 7; k++) {
      const day = addDays(today, k);
      if (!workDays(p.kind).includes(weekdayOf(day))) continue;
      asgIns.push({ staffId: p.staffId, date: day, shiftId: sh.id, centerId: p.centerId, origin: "template" as const, createdBy: hrAdmin, createdAt: notFuture(vnAt(addDays(day, -7), "16:00")) });
      if (k > 0 || leaveSet.has(`${p.staffId}|${day}`)) continue;
      let inMin: number | null = s0 - int(1, 12);
      let outMin: number | null = e0 + int(0, 12);
      const r = rng();
      if (k < 0) {
        if (r < 0.015) {
          inMin = null;
          outMin = null;
        } else if (r < 0.075) {
          inMin = s0 + int(8, 40);
          lateDays.push({ p, d: day, min: inMin - s0 });
        } else if (r < 0.095) {
          outMin = null;
          missOut.push({ p, d: day, out: e0 + int(0, 15) });
        } else if (r < 0.105) inMin = null;
        else if (r < 0.125) outMin = e0 - int(20, 60);
        else if (r < 0.16 && p.kind === "office") {
          outMin = e0 + int(60, 150);
          otDays.push({ p, d: day, from: e0, to: outMin });
        }
      } else {
        // Hôm nay: chỉ chấm những mốc đã qua
        if (vnAt(day, fmtMin(inMin)).getTime() > now) inMin = null;
        if (vnAt(day, fmtMin(outMin)).getTime() > now) outMin = null;
      }
      const jitter = () => (rng() - 0.5) * 0.0004;
      if (inMin !== null) punchIns.push({ staffId: p.staffId, centerId: p.centerId, kind: "in", at: vnAt(day, fmtMin(inMin)), source: "qr", flags: [], lat: lat + jitter(), lng: lng + jitter(), accuracyM: int(8, 35), distanceM: int(3, 60), createdBy: p.userId, createdAt: vnAt(day, fmtMin(inMin)) });
      if (outMin !== null) punchIns.push({ staffId: p.staffId, centerId: p.centerId, kind: "out", at: vnAt(day, fmtMin(outMin)), source: "qr", flags: [], lat: lat + jitter(), lng: lng + jitter(), accuracyM: int(8, 35), distanceM: int(3, 60), createdBy: p.userId, createdAt: vnAt(day, fmtMin(outMin)) });
    }
  }
  const recent = (d: string) => d >= addDays(today, -7);
  lateDays.filter((z) => recent(z.d)).slice(0, 4).forEach((z, i) => {
    const created = later(vnAt(z.d, "12:00"), 0, 8 * 60);
    const approved = i === 0;
    hrRequest(z.p, { kind: "late_early", status: approved ? "approved" : "pending", dateFrom: z.d, dateTo: z.d, lateEarlyKind: "late" as const, atTime: fmtMin(z.min + 8 * 60), lateSubmission: true, effectPreview: "Đi muộn — bỏ qua cờ", reason: pick(["Kẹt xe do mưa lớn (mẫu)", "Xe hỏng dọc đường (mẫu)", "Đưa con đi học muộn (mẫu)"]), decidedBy: approved ? mgrOf(z.p.centerId) : null, decidedAt: approved ? later(created, 30, 6 * 60) : null, createdAt: created });
  });
  missOut.filter((z) => recent(z.d)).slice(0, 3).forEach((z) => {
    hrRequest(z.p, { kind: "timesheet_fix", status: "pending", dateFrom: z.d, dateTo: z.d, punchOut: fmtMin(z.out), lateSubmission: true, effectPreview: `Thêm mốc ra ${fmtMin(z.out)}`, reason: "Quên chấm ra do điện thoại hết pin (mẫu)", createdAt: later(vnAt(z.d, "21:30"), 0, 12 * 60) });
  });
  otDays.slice(0, 3).forEach((z, i) => {
    const created = vnAt(z.d, fmtMin(Math.min(z.to, 23 * 60)));
    const approved = i !== 2;
    hrRequest(z.p, { kind: "overtime", status: approved ? "approved" : "pending", dateFrom: z.d, dateTo: z.d, startTime: fmtMin(z.from), endTime: fmtMin(z.to), minutes: z.to - z.from, effectPreview: `Thêm giờ ${fmtMin(z.from)}–${fmtMin(z.to)}`, reason: "Hỗ trợ chốt học phí cuối tháng (mẫu)", decidedBy: approved ? mgrOf(z.p.centerId) : null, decidedAt: approved ? later(created, 60, 24 * 60) : null, createdAt: created });
  });
  await inChunks(asgIns, (p) => db.insert(shiftAssignments).values(p), 500);
  await inChunks(punchIns, (p) => db.insert(attendancePunches).values(p), 500);
  if (reqHrIns.length) await db.insert(staffRequests).values(reqHrIns);
  bump("shift_assignments", asgIns.length);
  bump("attendance_punches", punchIns.length);
  bump("staff_requests", reqHrIns.length);

  const order = ["users", "teachers", "staff", "rooms", "courses", "classes", "sessions", "parents", "students", "enrollments", "attendance", "leads", "lead_activities", "lead_tasks", "trial_bookings", "orders", "payments", "refunds", "commissions", "report_cards", "course_completions", "care_tasks", "parent_requests", "parent_feedback", "parent_notifications", "shift_assignments", "attendance_punches", "staff_requests"];
  console.log(`✔ Demo volume (${((Date.now() - t0) / 1000).toFixed(1)}s): ${order.map((k) => `${counts[k] ?? 0} ${k}`).join(", ")}`);
  console.log(`  Lead theo trạng thái: ${Object.entries(counts).filter(([k]) => k.startsWith("leads_")).map(([k, v]) => `${k.slice(6)}=${v}`).join(", ")} · Ghi danh chưa lập đơn: ${counts.enrollments_without_order ?? 0}`);
}

function maxDateOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
