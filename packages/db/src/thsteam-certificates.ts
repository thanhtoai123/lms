/**
 * CHUẨN HOÁ GIẤY CHỨNG NHẬN TH STEAM (chạy trong `pnpm db:seed-thsteam`, chạy lại an toàn).
 *
 * 1. Mẫu dùng NỀN DỰNG SẴN (builtin/th-steam-mac-dinh.svg, bố cục v2): đặt lại ô trường theo bố cục chuẩn
 *    (`standardTemplateFields`) nếu mẫu còn bố cục cũ (chưa có ô "Ngày sinh"). Giữ người ký / chức danh / địa danh
 *    trung tâm đã tự nhập; chỉ thay chữ giữ chỗ cũ ("Quản lý trung tâm", trống). Mẫu nền tải lên riêng: không động vào.
 * 2. Bản chụp nội dung của giấy ĐÃ CẤP trước khi chuẩn hoá (chưa có `std`): ghi lại tên khoá / lộ trình, dòng chuyên
 *    ngành, thời lượng theo chuẩn, thêm ngày sinh; giữ nguyên số chứng nhận, ngày cấp, xếp loại, tên học viên, cơ sở.
 *    Mỗi giấy chỉ chuẩn hoá MỘT lần (có `std` rồi thì bỏ qua) — sau đó bản chụp lại bất biến như thiết kế.
 *    Trigger `certificates_immutable` (sql/0020) chỉ cho phép đúng việc này khi phiên bật `satarobo.chuan_hoa_chung_nhan`,
 *    và mỗi giấy được ghi nhật ký (audit_log, module certificates, lý do "Chuẩn hoá nội dung in").
 */
import { eq, inArray, sql } from "drizzle-orm";
import { auditLog, certificateTemplates, certificates, courseCompletions, courses, learningPaths, students } from "./schema/index";
import {
  CERTIFICATE_STANDARD_VERSION, TH_BRAND, TH_CERTIFICATE_SIGNER, TH_STANDARD_TEMPLATE_NAME, courseCertificateAchievement,
  isCertificateSnapshot, normalizeTemplateFields, pathCertificateAchievement, standardTemplateFields, type CertificateSnapshot, type TemplateField,
} from "@satarobo/core";
import type { Database } from "./index";

const PLACEHOLDER_SIGNERS = new Set(["", "quản lý trung tâm", "quản lý trung tâm (mẫu)"]);
const OLD_TEMPLATE_NAMES = new Set(["Mẫu mặc định TH STEAM Academy (A4 ngang)"]);

const isPlaceholderSigner = (v: string | null | undefined) => PLACEHOLDER_SIGNERS.has((v ?? "").trim().toLocaleLowerCase("vi-VN"));

/** Bố cục chuẩn + giữ người ký / địa danh trung tâm đã tự nhập */
export function standardFieldsKeeping(old: readonly Partial<TemplateField>[]): TemplateField[] {
  const get = (k: string) => old.find((f) => f && f.key === k);
  const signer = (get("signerName")?.text ?? "").trim();
  const title = (get("signerTitle")?.text ?? "").trim();
  const place = (get("issuedDate")?.place ?? "").trim();
  return standardTemplateFields("landscape").map((f) => {
    if (f.key === "signerName" && !isPlaceholderSigner(signer)) return { ...f, text: signer };
    if (f.key === "signerTitle" && title) return { ...f, text: title };
    if (f.key === "issuedDate" && place) return { ...f, place };
    return f;
  });
}

export async function standardizeThCertificates(db: Database) {
  // ---- 1. Mẫu nền dựng sẵn ----
  const tpls = await db.select().from(certificateTemplates).where(eq(certificateTemplates.backgroundKey, TH_BRAND.certificateBackground));
  let templates = 0;
  for (const t of tpls) {
    const raw = Array.isArray(t.fields) ? (t.fields as Partial<TemplateField>[]) : [];
    const oldLayout = !raw.some((f) => f && f.key === "studentDob");
    const rename = OLD_TEMPLATE_NAMES.has(t.name);
    if (!oldLayout && !rename) continue;
    await db.update(certificateTemplates).set({
      ...(oldLayout ? { fields: standardFieldsKeeping(raw), orientation: "landscape" as const, widthPx: 3508, heightPx: 2480 } : {}),
      ...(rename ? { name: TH_STANDARD_TEMPLATE_NAME } : {}),
      updatedAt: new Date(),
    }).where(eq(certificateTemplates.id, t.id));
    templates++;
  }

  // ---- 2. Bản chụp của giấy đã cấp ----
  const rows = await db
    .select({
      id: certificates.id, kind: certificates.kind, snapshot: certificates.snapshot, templateId: certificates.templateId,
      studentId: certificates.studentId, completionId: certificates.courseCompletionId, pathId: certificates.learningPathId,
    })
    .from(certificates);
  const todo = rows.filter((r) => isCertificateSnapshot(r.snapshot) && (r.snapshot.std ?? 0) < CERTIFICATE_STANDARD_VERSION);
  if (!todo.length) return { templates, certificates: 0 };

  const studentIds = [...new Set(todo.map((r) => r.studentId))];
  const dobs = new Map<string, string | null>();
  for (let i = 0; i < studentIds.length; i += 500) {
    const part = await db.select({ id: students.id, dob: students.dateOfBirth }).from(students).where(inArray(students.id, studentIds.slice(i, i + 500)));
    for (const s of part) dobs.set(s.id, s.dob ?? null);
  }
  const completionIds = todo.map((r) => r.completionId).filter((x): x is string => !!x);
  const courseOf = new Map<string, { code: string; name: string; totalSessions: number | null }>();
  for (let i = 0; i < completionIds.length; i += 500) {
    const part = await db.select({ id: courseCompletions.id, code: courses.code, name: courses.name, totalSessions: courses.totalSessions })
      .from(courseCompletions).innerJoin(courses, eq(courses.id, courseCompletions.courseId))
      .where(inArray(courseCompletions.id, completionIds.slice(i, i + 500)));
    for (const c of part) courseOf.set(c.id, c);
  }
  const pathIds = [...new Set(todo.map((r) => r.pathId).filter((x): x is string => !!x))];
  const paths = pathIds.length ? await db.select({ id: learningPaths.id, code: learningPaths.code, name: learningPaths.name, criteriaText: learningPaths.criteriaText }).from(learningPaths).where(inArray(learningPaths.id, pathIds)) : [];
  const allTpls = await db.select({ id: certificateTemplates.id, fields: certificateTemplates.fields, isDefault: certificateTemplates.isDefault }).from(certificateTemplates);
  const defaultSigner = (() => {
    const t = allTpls.find((x) => x.isDefault) ?? null;
    const f = t ? normalizeTemplateFields(t.fields) : standardTemplateFields();
    return (f.find((x) => x.key === "signerName")?.text ?? "").trim() || TH_CERTIFICATE_SIGNER.name;
  })();

  const updates: { id: string; before: CertificateSnapshot; after: CertificateSnapshot }[] = [];
  for (const r of todo) {
    const s = r.snapshot as CertificateSnapshot;
    let ach: { name: string; description: string | null; criteriaText: string } | null = null;
    if (r.kind === "course") {
      const c = r.completionId ? courseOf.get(r.completionId) : undefined;
      if (c) ach = courseCertificateAchievement(c);
    } else {
      const p = paths.find((x) => x.id === r.pathId);
      if (p) ach = pathCertificateAchievement(p);
    }
    const next: CertificateSnapshot = {
      ...s,
      std: CERTIFICATE_STANDARD_VERSION,
      ...(ach ? { pathName: ach.name, description: ach.description, criteriaText: ach.criteriaText } : {}),
      dateOfBirth: s.dateOfBirth ?? dobs.get(r.studentId) ?? null,
      signerName: isPlaceholderSigner(s.signerName) ? defaultSigner : s.signerName,
      signerTitle: s.signerTitle?.trim() ? s.signerTitle : TH_CERTIFICATE_SIGNER.title,
    };
    updates.push({ id: r.id, before: s, after: next });
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('satarobo.chuan_hoa_chung_nhan', 'on', true)`);
    for (const u of updates) {
      await tx.update(certificates).set({ snapshot: u.after, updatedAt: new Date() }).where(eq(certificates.id, u.id));
      await tx.insert(auditLog).values({
        actorId: null, action: "UPDATE", module: "certificates", entity: "certificates", entityId: u.id,
        before: { pathName: u.before.pathName, description: u.before.description, criteriaText: u.before.criteriaText, signerName: u.before.signerName },
        after: { std: u.after.std, pathName: u.after.pathName, description: u.after.description, criteriaText: u.after.criteriaText, signerName: u.after.signerName, hasDateOfBirth: !!u.after.dateOfBirth },
        reason: "Chuẩn hoá nội dung in giấy chứng nhận theo chuẩn TH STEAM (một lần)",
      });
    }
  });
  return { templates, certificates: updates.length };
}
