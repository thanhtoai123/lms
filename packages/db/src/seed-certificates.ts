/**
 * DỮ LIỆU MẪU — LỘ TRÌNH HỌC & GIẤY CHỨNG NHẬN (docs/CHUNG-NHAN-LO-TRINH.md). Chạy ở CUỐI `seed.ts`.
 * Chỉ dùng dữ liệu giả đã có (Học viên mẫu 11–14 của trung tâm online ONL, "Quản lý trung tâm (mẫu)").
 *
 *  - Mẫu chứng nhận mặc định dùng NỀN DỰNG SẴN `builtin/th-steam-mac-dinh.svg` (apps/web/public/mau-chung-nhan/),
 *    vẽ bằng SVG — riêng mẫu mặc định được phép nền SVG vì do máy chủ phát, không phải tệp người dùng tải lên.
 *  - Lộ trình chuẩn "Lập trình Robotics AI · Tiểu học" (ROBO-TH, do danh mục chuẩn tạo): Năm 1 ROBO-TH-N1 (bắt buộc)
 *    → Năm 2 ROBO-TH-N2 (bắt buộc) → các khoá Luyện thi (tự chọn).
 *  - Hai lớp ĐÃ KẾT THÚC (năm học 2024–2025 và 2025–2026): HV mẫu 11–13 hoàn thành cả hai năm (đủ điều kiện),
 *    HV mẫu 14 mới hoàn thành Năm 1. Hoàn thành khoá ĐÃ DUYỆT, có số chứng nhận như luồng thật.
 *  - MỘT giấy chứng nhận lộ trình đã cấp cho HV mẫu 11, token xác thực CỐ ĐỊNH để xem thử /cn/<token>.
 *  - Sổ chứng nhận: mọi hoàn thành khoá đã duyệt (kể cả khối lượng demo) có một dòng `certificates` kind='course'.
 */
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import {
  tenants, centers, users, courses, classes, enrollments, students, courseCompletions,
  certificateTemplates, learningPaths, certificates,
} from "./schema/index";
import {
  buildClassCode, certificateNumber, defaultTemplateFields, buildCertificateSnapshot, certificatePrefix, pathCertificateNumber,
  nextCertificateSeq, TH_BRAND, type TemplateField,
} from "@satarobo/core";
import type { Database } from "./index";
import { randomBytes } from "node:crypto";

/** Token CỐ ĐỊNH, dễ nhớ của giấy chứng nhận mẫu — xem thử tại /cn/<token> (chỉ dữ liệu mẫu) */
export const DEMO_CERTIFICATE_TOKEN = "xem-thu-giay-chung-nhan-th-steam-mau";
const PATH_CODE = "ROBO-TH";
const BUILTIN_BG = "builtin/th-steam-mac-dinh.svg";
type CourseRow = typeof courses.$inferSelect;
type ClassRow = typeof classes.$inferSelect;

function seedFields(): TemplateField[] {
  return defaultTemplateFields("landscape").map((f) =>
    f.key === "signerName" ? { ...f, text: "Quản lý trung tâm" }
      : f.key === "issuedDate" ? { ...f, place: "Đà Nẵng" }
        : f,
  );
}

export async function seedCertificates(db: Database) {
  const [tTh] = await db.select().from(tenants).where(eq(tenants.isDefault, true)).limit(1);
  const [onl] = await db.select().from(centers).where(eq(centers.code, "ONL")).limit(1);
  const [mgr] = await db.select({ id: users.id }).from(users).where(eq(users.email, "manager.cs1@example.test")).limit(1);
  if (!tTh || !onl) return { token: null as string | null, courseCertificates: 0 };
  const tenantId = tTh.id;
  const issuedBy = mgr?.id ?? null;

  const cs = await db.select().from(courses).where(inArray(courses.code, ["ROBO-TH-N1", "ROBO-TH-N2"]));
  const year1 = cs.find((c) => c.code === "ROBO-TH-N1");
  const year2 = cs.find((c) => c.code === "ROBO-TH-N2");
  if (!year1 || !year2) return { token: null as string | null, courseCertificates: 0 };
  const courseTenant = year2.tenantId ?? tenantId;

  // ---- Mẫu chứng nhận mặc định (nền dựng sẵn) ----
  let [tpl] = await db.select().from(certificateTemplates)
    .where(and(eq(certificateTemplates.isDefault, true), eq(certificateTemplates.tenantId, courseTenant))).limit(1);
  if (!tpl) {
    [tpl] = await db.insert(certificateTemplates).values({
      tenantId: courseTenant, name: "Mẫu mặc định TH STEAM Academy (A4 ngang)", orientation: "landscape", backgroundKey: BUILTIN_BG,
      widthPx: 3508, heightPx: 2480, fields: seedFields(), isDefault: true, createdBy: issuedBy,
    }).returning();
  } else if (!Array.isArray(tpl.fields) || tpl.fields.length === 0) {
    [tpl] = await db.update(certificateTemplates).set({ fields: seedFields() }).where(eq(certificateTemplates.id, tpl.id)).returning();
  }
  if (!tpl) return { token: null as string | null, courseCertificates: 0 };
  const fields = Array.isArray(tpl.fields) && tpl.fields.length ? tpl.fields : seedFields();

  // ---- Lộ trình chuẩn (danh mục đã tạo) → gắn mẫu chứng nhận ----
  const [path] = await db.update(learningPaths).set({ certificateTemplateId: tpl.id, updatedBy: issuedBy })
    .where(eq(learningPaths.code, PATH_CODE)).returning();
  if (!path) return { token: null as string | null, courseCertificates: 0 };

  // ---- Hai lớp đã kết thúc của trung tâm online + hoàn thành khoá đã duyệt ----
  const names = ["Học viên mẫu 11", "Học viên mẫu 12", "Học viên mẫu 13", "Học viên mẫu 14"];
  const studs = await db.select({ id: students.id, fullName: students.fullName, code: students.code }).from(students).where(inArray(students.fullName, names));
  const st = names.map((n) => studs.find((s) => s.fullName === n)).filter((s): s is NonNullable<typeof s> => !!s);
  if (st.length < 4) return { token: null as string | null, courseCertificates: 0 };

  const mkClass = async (course: CourseRow, seq: number, name: string, start: string, end: string) => {
    const [c] = await db.insert(classes).values({
      tenantId: onl.tenantId ?? tenantId, code: buildClassCode(onl.code, course.code, Number(start.slice(0, 4)), seq), name, courseId: course.id, centerId: onl.id,
      capacity: 8, plannedSessions: course.totalSessions, startDate: start, expectedEndDate: end, status: "finished",
      description: "Lớp online đã kết thúc — dữ liệu mẫu cho lộ trình học & giấy chứng nhận",
    }).returning();
    if (!c) throw new Error("Không tạo được lớp mẫu");
    return c;
  };
  const c1 = await mkClass(year1, 91, "Robotics Tiểu học Năm 1 · 2024–2025 (đã kết thúc)", "2024-09-08", "2025-08-24");
  const c4 = await mkClass(year2, 92, "Robotics Tiểu học Năm 2 · 2025–2026 (đã kết thúc)", "2025-09-07", "2026-08-23");

  const vn = (d: string) => new Date(`${d}T17:00:00+07:00`);
  const EVAL = "Con hoàn thành đầy đủ các học phần, tự lập trình được robot ảo theo yêu cầu và tự tin trình bày dự án trước phụ huynh (dữ liệu mẫu).";
  const complete = async (cls: ClassRow, course: CourseRow, who: typeof st, endDate: string, seqStart: number, grades: string[]) => {
    let n = seqStart;
    for (const [i, s] of who.entries()) {
      const [e] = await db.insert(enrollments).values({
        tenantId: onl.tenantId ?? tenantId, studentId: s.id, classId: cls.id, status: "completed", packageSessions: course.totalSessions,
        enrolledAt: vn(cls.startDate ?? endDate), endedAt: vn(endDate), endReason: "Hoàn thành khoá", createdBy: issuedBy,
      }).returning();
      const at = vn(endDate);
      await db.insert(courseCompletions).values({
        enrollmentId: e!.id, courseId: course.id, status: "approved", grade: grades[i % grades.length]!, teacherEvaluation: EVAL, averageScore: "2.7",
        certificateNo: certificateNumber(course.code, Number(endDate.slice(0, 4)), n++), proposedBy: issuedBy, proposedAt: at, decidedBy: issuedBy, decidedAt: at,
        issuedAt: at, issuedBy, createdAt: at,
      });
    }
  };
  await complete(c1, year1, st, "2025-08-24", 901, ["Hoàn thành tốt", "Hoàn thành tốt", "Hoàn thành", "Hoàn thành tốt"]);
  await complete(c4, year2, st.slice(0, 3), "2026-08-23", 901, ["Hoàn thành tốt", "Hoàn thành tốt", "Hoàn thành"]);

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
  const prefix = certificatePrefix(onl.code, year);
  const [mx] = await db.select({ m: sql<string | null>`max(${certificates.number})` }).from(certificates).where(like(certificates.number, `${prefix}%`));
  const number = pathCertificateNumber(onl.code, year, nextCertificateSeq(mx?.m ?? null, prefix));
  const winner = st[0]!;
  await db.insert(certificates).values({
    tenantId: onl.tenantId ?? tenantId, kind: "path", learningPathId: path.id, studentId: winner.id, centerId: onl.id, templateId: tpl.id,
    number, verifyToken: DEMO_CERTIFICATE_TOKEN, issuedAt: now, issuedBy, status: "valid",
    snapshot: buildCertificateSnapshot({
      kind: "path", certificateNo: number, student: { fullName: winner.fullName, code: winner.code },
      achievement: { name: path.name, description: path.description, criteriaText: path.criteriaText },
      courses: [{ code: year1.code, name: year1.name }, { code: year2.code, name: year2.name }],
      issuedAt: now, grade: "Hoàn thành tốt",
      center: { name: onl.name, address: onl.address, phone: onl.phone }, issuerName: TH_BRAND.name, template: { fields },
    }),
  });
  return { token: DEMO_CERTIFICATE_TOKEN as string | null, courseCertificates: courseRows.length, pathCode: PATH_CODE };
}
