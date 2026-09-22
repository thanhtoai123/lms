/**
 * DỮ LIỆU MẪU — LỘ TRÌNH HỌC & GIẤY CHỨNG NHẬN (docs/CHUNG-NHAN-LO-TRINH.md). Chạy ở CUỐI `seed.ts`.
 * Chỉ dùng dữ liệu giả đã có (Học viên mẫu 11–14 ở Cơ sở 2, "Quản lý CS1").
 *
 *  - Mẫu chứng nhận mặc định dùng NỀN DỰNG SẴN `builtin/sata-mac-dinh.svg` (apps/web/public/mau-chung-nhan/),
 *    vẽ bằng SVG — riêng mẫu mặc định được phép nền SVG vì do máy chủ phát, không phải tệp người dùng tải lên.
 *  - Lộ trình "Lộ trình Robotics nền tảng" (LT-ROBO-NT): Sata1 (bắt buộc) → Sata4 (bắt buộc) → Sata6 (tuỳ chọn).
 *  - Hai lớp ĐÃ KẾT THÚC năm 2025 ở CS2 (Sata1, Sata4): HV mẫu 11–13 hoàn thành cả hai (đủ điều kiện),
 *    HV mẫu 14 mới hoàn thành Sata1 (đang học 1/2). Hoàn thành khoá ĐÃ DUYỆT, có số SR-… như luồng thật.
 *  - MỘT giấy chứng nhận lộ trình đã cấp cho HV mẫu 11, token xác thực CỐ ĐỊNH để xem thử /cn/<token>.
 *  - Sổ chứng nhận: mọi hoàn thành khoá đã duyệt (kể cả khối lượng demo) có một dòng `certificates` kind='course'.
 */
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import {
  tenants, centers, users, courses, classes, enrollments, students, courseCompletions,
  certificateTemplates, learningPaths, learningPathCourses, certificates,
} from "./schema/index";
import {
  buildClassCode, certificateNumber, defaultTemplateFields, buildCertificateSnapshot, certificatePrefix, pathCertificateNumber,
  nextCertificateSeq, type TemplateField,
} from "@satarobo/core";
import type { Database } from "./index";
import { randomBytes } from "node:crypto";

/** Token CỐ ĐỊNH, dễ nhớ của giấy chứng nhận mẫu — xem thử tại /cn/<token> (chỉ dữ liệu mẫu) */
export const DEMO_CERTIFICATE_TOKEN = "xem-thu-giay-chung-nhan-sata-robo-mau";
const PATH_CODE = "LT-ROBO-NT";
const BUILTIN_BG = "builtin/sata-mac-dinh.svg";
type CourseRow = typeof courses.$inferSelect;
type ClassRow = typeof classes.$inferSelect;

function seedFields(): TemplateField[] {
  return defaultTemplateFields("landscape").map((f) =>
    f.key === "signerName" ? { ...f, text: "Quản lý CS1" }
      : f.key === "issuedDate" ? { ...f, place: "Đà Nẵng" }
        : f,
  );
}

export async function seedCertificates(db: Database) {
  const [tSata] = await db.select().from(tenants).where(eq(tenants.code, "SATA")).limit(1);
  const [cs2] = await db.select().from(centers).where(eq(centers.code, "CS2")).limit(1);
  const [mgr] = await db.select({ id: users.id }).from(users).where(eq(users.email, "manager.cs1@example.test")).limit(1);
  if (!tSata || !cs2) return { token: null as string | null, courseCertificates: 0 };
  const tenantId = tSata.id;
  const issuedBy = mgr?.id ?? null;

  // Khoá của chuỗi gốc (theo slug; bản Huế có slug riêng)
  const cs = await db.select().from(courses).where(inArray(courses.slug, ["sata1", "sata4", "sata6"]));
  const byCode = (code: string) => cs.find((c) => c.code === code);
  const sata1 = byCode("SATA1");
  const sata4 = byCode("SATA4");
  const sata6 = byCode("SATA6");
  if (!sata1 || !sata4) return { token: null as string | null, courseCertificates: 0 };
  const courseTenant = sata4.tenantId ?? tenantId;

  // ---- Mẫu chứng nhận mặc định (nền dựng sẵn) ----
  let [tpl] = await db.select().from(certificateTemplates)
    .where(and(eq(certificateTemplates.isDefault, true), eq(certificateTemplates.tenantId, courseTenant))).limit(1);
  if (!tpl) {
    [tpl] = await db.insert(certificateTemplates).values({
      tenantId: courseTenant, name: "Mẫu mặc định Sata Robo (A4 ngang)", orientation: "landscape", backgroundKey: BUILTIN_BG,
      widthPx: 3508, heightPx: 2480, fields: seedFields(), isDefault: true, createdBy: issuedBy,
    }).returning();
  } else if (!Array.isArray(tpl.fields) || tpl.fields.length === 0) {
    [tpl] = await db.update(certificateTemplates).set({ fields: seedFields() }).where(eq(certificateTemplates.id, tpl.id)).returning();
  }
  if (!tpl) return { token: null as string | null, courseCertificates: 0 };
  const fields = Array.isArray(tpl.fields) && tpl.fields.length ? tpl.fields : seedFields();

  // ---- Lộ trình mẫu ----
  const [path] = await db.insert(learningPaths).values({
    tenantId: courseTenant, code: PATH_CODE, name: "Lộ trình Robotics nền tảng",
    description: "Từ luyện thi RoboSim đến robot tự hành: nền tảng lắp ráp, cảm biến và lập trình cho học sinh tiểu học (dữ liệu mẫu).",
    criteriaText: "Hoàn thành 2 khoá bắt buộc Sata1 — Luyện thi RoboSim và Sata4 — Bứt Phá Giới Hạn, được giáo viên đánh giá đạt yêu cầu cuối khoá.",
    certificateTemplateId: tpl.id, createdBy: issuedBy, updatedBy: issuedBy,
  }).onConflictDoNothing().returning();
  if (!path) return { token: null as string | null, courseCertificates: 0 };
  await db.insert(learningPathCourses).values([
    { pathId: path.id, courseId: sata1.id, seq: 1, required: true },
    { pathId: path.id, courseId: sata4.id, seq: 2, required: true },
    ...(sata6 ? [{ pathId: path.id, courseId: sata6.id, seq: 3, required: false }] : []),
  ]);

  // ---- Hai lớp đã kết thúc năm 2025 ở CS2 + hoàn thành khoá đã duyệt ----
  const names = ["Học viên mẫu 11", "Học viên mẫu 12", "Học viên mẫu 13", "Học viên mẫu 14"];
  const studs = await db.select({ id: students.id, fullName: students.fullName, code: students.code }).from(students).where(inArray(students.fullName, names));
  const st = names.map((n) => studs.find((s) => s.fullName === n)).filter((s): s is NonNullable<typeof s> => !!s);
  if (st.length < 4) return { token: null as string | null, courseCertificates: 0 };

  const mkClass = async (course: CourseRow, seq: number, name: string, start: string, end: string) => {
    const [c] = await db.insert(classes).values({
      tenantId: cs2.tenantId ?? tenantId, code: buildClassCode("CS2", course.code, 2025, seq), name, courseId: course.id, centerId: cs2.id,
      capacity: 12, plannedSessions: course.totalSessions, startDate: start, expectedEndDate: end, status: "finished",
      description: "Lớp đã kết thúc — dữ liệu mẫu cho lộ trình học & giấy chứng nhận",
    }).returning();
    if (!c) throw new Error("Không tạo được lớp mẫu");
    return c;
  };
  const c1 = await mkClass(sata1, 91, "Sata1 hè 2025 CS2 (đã kết thúc)", "2025-06-07", "2025-08-30");
  const c4 = await mkClass(sata4, 92, "Sata4 năm học 2025 CS2 (đã kết thúc)", "2025-09-06", "2026-06-27");

  const vn = (d: string) => new Date(`${d}T17:00:00+07:00`);
  const EVAL = "Con hoàn thành đầy đủ các bài thực hành, tự lắp và lập trình được robot theo yêu cầu, tích cực làm việc nhóm (dữ liệu mẫu).";
  const complete = async (cls: ClassRow, course: CourseRow, who: typeof st, endDate: string, seqStart: number, grades: string[]) => {
    let n = seqStart;
    for (const [i, s] of who.entries()) {
      const [e] = await db.insert(enrollments).values({
        tenantId: cs2.tenantId ?? tenantId, studentId: s.id, classId: cls.id, status: "completed", packageSessions: course.totalSessions,
        enrolledAt: vn(cls.startDate ?? endDate), endedAt: vn(endDate), endReason: "Hoàn thành khoá", createdBy: issuedBy,
      }).returning();
      const at = vn(endDate);
      await db.insert(courseCompletions).values({
        enrollmentId: e!.id, courseId: course.id, status: "approved", grade: grades[i % grades.length]!, teacherEvaluation: EVAL, averageScore: "4.3",
        certificateNo: certificateNumber(course.code, Number(endDate.slice(0, 4)), n++), proposedBy: issuedBy, proposedAt: at, decidedBy: issuedBy, decidedAt: at,
        issuedAt: at, issuedBy, createdAt: at,
      });
    }
  };
  await complete(c1, sata1, st, "2025-08-30", 901, ["Giỏi", "Xuất sắc", "Khá", "Giỏi"]);
  await complete(c4, sata4, st.slice(0, 3), "2026-06-27", 901, ["Xuất sắc", "Giỏi", "Giỏi"]);

  // ---- Sổ chứng nhận: mọi hoàn thành khoá đã duyệt chưa có dòng certificates (như backfill của 0012) ----
  const pending = await db
    .select({
      id: courseCompletions.id, number: courseCompletions.certificateNo, issuedAt: courseCompletions.issuedAt, decidedAt: courseCompletions.decidedAt,
      createdAt: courseCompletions.createdAt, issuedBy: courseCompletions.issuedBy, grade: courseCompletions.grade,
      studentId: students.id, fullName: students.fullName, studentCode: students.code,
      courseCode: courses.code, courseName: courses.name, totalSessions: courses.totalSessions,
      centerId: centers.id, centerName: centers.name, centerAddress: centers.address, centerPhone: centers.phone, centerTenant: centers.tenantId,
    })
    .from(courseCompletions)
    .innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, courseCompletions.courseId))
    .where(and(
      eq(courseCompletions.status, "approved"), sql`${courseCompletions.certificateNo} is not null`, isNull(courseCompletions.revokedAt),
      sql`not exists (select 1 from ${certificates} x where x.course_completion_id = ${courseCompletions.id})`,
    ));
  const courseRows = pending.flatMap((r) => {
    if (!r.number) return [];
    const at = r.issuedAt ?? r.decidedAt ?? r.createdAt;
    return [{
      tenantId: r.centerTenant, kind: "course" as const, courseCompletionId: r.id, studentId: r.studentId, centerId: r.centerId, templateId: null,
      number: r.number, verifyToken: randomBytes(32).toString("base64url"), issuedAt: at, issuedBy: r.issuedBy, status: "valid" as const,
      snapshot: buildCertificateSnapshot({
        kind: "course", certificateNo: r.number, student: { fullName: r.fullName, code: r.studentCode },
        achievement: { name: r.courseName, criteriaText: `Hoàn thành chương trình khoá học ${r.courseName} (${r.totalSessions} buổi)` },
        courses: [{ code: r.courseCode, name: r.courseName }], issuedAt: at, grade: r.grade,
        center: { name: r.centerName, address: r.centerAddress, phone: r.centerPhone }, template: { fields },
      }),
    }];
  });
  for (let i = 0; i < courseRows.length; i += 300) await db.insert(certificates).values(courseRows.slice(i, i + 300));

  // ---- MỘT giấy chứng nhận lộ trình đã cấp (HV mẫu 11), token cố định để xem thử ----
  const now = new Date();
  const year = Number(new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 4));
  const prefix = certificatePrefix(cs2.code, year);
  const [mx] = await db.select({ m: sql<string | null>`max(${certificates.number})` }).from(certificates).where(like(certificates.number, `${prefix}%`));
  const number = pathCertificateNumber(cs2.code, year, nextCertificateSeq(mx?.m ?? null, prefix));
  const winner = st[0]!;
  await db.insert(certificates).values({
    tenantId: cs2.tenantId ?? tenantId, kind: "path", learningPathId: path.id, studentId: winner.id, centerId: cs2.id, templateId: tpl.id,
    number, verifyToken: DEMO_CERTIFICATE_TOKEN, issuedAt: now, issuedBy, status: "valid",
    snapshot: buildCertificateSnapshot({
      kind: "path", certificateNo: number, student: { fullName: winner.fullName, code: winner.code },
      achievement: { name: path.name, description: path.description, criteriaText: path.criteriaText },
      courses: [{ code: sata1.code, name: sata1.name }, { code: sata4.code, name: sata4.name }],
      issuedAt: now, grade: "Giỏi",
      center: { name: cs2.name, address: cs2.address, phone: cs2.phone }, issuerName: "Sata Robo", template: { fields },
    }),
  });
  return { token: DEMO_CERTIFICATE_TOKEN as string | null, courseCertificates: courseRows.length, pathCode: PATH_CODE };
}
