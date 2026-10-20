/**
 * ĐỒNG BỘ DANH MỤC CHUẨN TH STEAM vào CSDL (docs/KHUNG-CHUONG-TRINH.md).
 *
 * Nguồn: packages/core/src/curriculum/thsteam.ts (sinh từ bộ slide chương trình đã duyệt).
 * Dùng chung cho lệnh `pnpm db:seed-thsteam` và nút "Đồng bộ danh mục chuẩn" ở Đào tạo → Khung chương trình.
 *
 * Chạy lại bao nhiêu lần cũng được (idempotent):
 *  - Khoá học khớp theo MÃ trong trung tâm (ROBO-TH-N1 …): chưa có thì tạo; có rồi thì cập nhật tên, mô tả, số buổi, lớp, học phí.
 *  - Mỗi khoá một giáo trình "Chuẩn TH STEAM <năm học>" với đủ buổi; buổi đã có chỉ được cập nhật chữ (không xoá buổi).
 *  - Tiêu chí học bạ: thêm tiêu chí còn thiếu; mô tả mức chỉ điền khi tiêu chí chưa có mô tả đúng thang (không đè chỉnh sửa tay).
 *  - Gói học phí, lộ trình (để cấp chứng nhận) khớp theo mã.
 *  - `retireOthers`: khoá / gói / lộ trình KHÔNG thuộc danh mục chuẩn chuyển "ngừng bán" (isActive = false) — KHÔNG xoá,
 *    lớp và học bạ cũ vẫn xem được.
 */
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { tenants, courses, coursePackages, curricula, lessons, competencyCriteria, learningPaths, learningPathCourses, sessions, documents } from "./schema/index";
import { thCourseSpecs, thPathSpecs, newCriteriaOnly, normalizeLevelDescriptors, TH_PRICING } from "@satarobo/core";
import type { Database } from "./index";

export const TH_CURRICULUM_NAME = `Chuẩn TH STEAM ${TH_PRICING.schoolYear}`;

export interface ThSyncOptions {
  /** Trung tâm nhận danh mục; bỏ trống = trung tâm mặc định (is_default) */
  tenantId?: string | null;
  /** Ẩn khoá / gói / lộ trình không thuộc danh mục chuẩn */
  retireOthers?: boolean;
  actorId?: string | null;
}

export interface ThSyncResult {
  tenantId: string;
  courses: { created: number; updated: number };
  lessons: { created: number; updated: number };
  /** Buổi dạy / giáo án đổi tên theo tên buổi mới */
  renamed: { sessions: number; plans: number };
  criteria: { created: number; filled: number };
  packages: { created: number; updated: number };
  paths: { created: number; updated: number };
  retired: { courses: number; packages: number; paths: number };
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function defaultTenantId(db: Database | Tx): Promise<string> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isDefault, true)).limit(1);
  if (!t) throw new Error("Chưa có trung tâm mặc định (tenants.is_default) — chạy pnpm db:seed trước");
  return t.id;
}

export async function syncThSteamCatalog(db: Database, opts: ThSyncOptions = {}): Promise<ThSyncResult> {
  return db.transaction(async (tx) => {
    const tenantId = opts.tenantId ?? (await defaultTenantId(tx));
    const actor = opts.actorId ?? null;
    const specs = thCourseSpecs();
    const r: ThSyncResult = {
      tenantId,
      courses: { created: 0, updated: 0 }, lessons: { created: 0, updated: 0 }, renamed: { sessions: 0, plans: 0 }, criteria: { created: 0, filled: 0 },
      packages: { created: 0, updated: 0 }, paths: { created: 0, updated: 0 }, retired: { courses: 0, packages: 0, paths: 0 },
    };
    const idByCode = new Map<string, string>();

    for (const s of specs) {
      // ---- Khoá học ----
      const values = {
        name: s.name, slug: s.slug, gradeFrom: s.gradeFrom, gradeTo: s.gradeTo, totalSessions: s.totalSessions, sessionMinutes: s.sessionMinutes,
        listPrice: String(s.listPrice), description: s.description, level: s.level, isActive: true, updatedAt: new Date(),
      };
      const [have] = await tx.select({ id: courses.id }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.code, s.code))).limit(1);
      let courseId: string;
      if (have) {
        await tx.update(courses).set(values).where(eq(courses.id, have.id));
        courseId = have.id;
        r.courses.updated += 1;
      } else {
        const [row] = await tx.insert(courses).values({ tenantId, code: s.code, ...values }).returning({ id: courses.id });
        courseId = row!.id;
        r.courses.created += 1;
      }
      idByCode.set(s.code, courseId);

      // ---- Giáo trình + buổi ----
      let [cur] = await tx.select({ id: curricula.id }).from(curricula).where(and(eq(curricula.courseId, courseId), eq(curricula.name, TH_CURRICULUM_NAME))).limit(1);
      if (!cur) {
        // Giáo trình chuẩn là giáo trình đang dùng của khoá
        await tx.update(curricula).set({ isActive: false, status: "archived", updatedAt: new Date() }).where(eq(curricula.courseId, courseId));
        [cur] = await tx.insert(curricula).values({
          tenantId, courseId, name: TH_CURRICULUM_NAME, version: 1, status: "active", isActive: true, createdBy: actor,
          description: "Giáo trình chuẩn TH STEAM: mỗi học phần 15 buổi — buổi 5 ôn tập, buổi 13–14 dự án cuối học phần, buổi 15 báo cáo trước phụ huynh.",
        }).returning({ id: curricula.id });
      }
      const existing = await tx.select({ id: lessons.id, seq: lessons.sequenceNo, title: lessons.title }).from(lessons).where(eq(lessons.curriculumId, cur!.id));
      const bySeq = new Map(existing.map((l) => [l.seq, l]));
      const fresh = [];
      for (const l of s.lessons) {
        const v = { title: l.title, objectives: l.objectives, materials: l.materials, isReportCardMilestone: l.milestone };
        const old = bySeq.get(l.seq);
        if (old) {
          await tx.update(lessons).set({ ...v, updatedAt: new Date() }).where(eq(lessons.id, old.id));
          r.lessons.updated += 1;
          if (old.title !== l.title) {
            // Đổi tên buổi: chủ đề các buổi dạy còn giữ tên cũ và tiêu đề giáo án tự sinh ("Buổi N — …") đổi theo
            const t = await tx.update(sessions).set({ topic: l.title, updatedAt: new Date() })
              .where(and(eq(sessions.lessonId, old.id), eq(sessions.topic, old.title))).returning({ id: sessions.id });
            r.renamed.sessions += t.length;
            const d = await tx.update(documents).set({ title: `Buổi ${l.seq} — ${l.title}`, updatedAt: new Date() })
              .where(and(eq(documents.lessonId, old.id), eq(documents.category, "lesson_plan"), eq(documents.title, `Buổi ${l.seq} — ${old.title}`))).returning({ id: documents.id });
            r.renamed.plans += d.length;
          }
        }
        else fresh.push({ curriculumId: cur!.id, sequenceNo: l.seq, ...v });
      }
      if (fresh.length) { await tx.insert(lessons).values(fresh); r.lessons.created += fresh.length; }

      // ---- Tiêu chí học bạ (6 năng lực + 3 phẩm chất) ----
      const crit = await tx.select({ id: competencyCriteria.id, name: competencyCriteria.name, levelDescriptors: competencyCriteria.levelDescriptors, sortOrder: competencyCriteria.sortOrder })
        .from(competencyCriteria).where(eq(competencyCriteria.courseId, courseId));
      const add = newCriteriaOnly(crit.map((c) => c.name), s.criteria);
      const base = crit.reduce((m, c) => Math.max(m, c.sortOrder), 0);
      if (add.length) {
        await tx.insert(competencyCriteria).values(add.map((t, i) => ({
          courseId, name: t.name, groupName: t.groupName, description: t.description, levelDescriptors: [...t.levelDescriptors], sortOrder: base + i + 1, isActive: true,
        })));
        r.criteria.created += add.length;
      }
      for (const c of crit) {
        if (normalizeLevelDescriptors(c.levelDescriptors)) continue; // đã có mô tả đúng thang — giữ chỉnh sửa tay
        const t = s.criteria.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
        if (!t) continue;
        await tx.update(competencyCriteria).set({ groupName: t.groupName, description: t.description, levelDescriptors: [...t.levelDescriptors], updatedAt: new Date() }).where(eq(competencyCriteria.id, c.id));
        r.criteria.filled += 1;
      }

      // ---- Gói học phí ----
      for (const p of s.packages) {
        const pv = { courseId, name: p.name, level: p.level, sessions: p.sessions, listPrice: p.listPrice, salePrice: p.salePrice, description: p.description, isFeatured: p.isFeatured, isActive: true, sortOrder: p.sortOrder, updatedAt: new Date() };
        const [hp] = await tx.select({ id: coursePackages.id }).from(coursePackages).where(and(eq(coursePackages.tenantId, tenantId), eq(coursePackages.code, p.code))).limit(1);
        if (hp) { await tx.update(coursePackages).set(pv).where(eq(coursePackages.id, hp.id)); r.packages.updated += 1; }
        else { await tx.insert(coursePackages).values({ tenantId, code: p.code, createdBy: actor, ...pv }); r.packages.created += 1; }
      }
    }

    // ---- Khoá học tiếp theo (Năm 1 → Năm 2) ----
    for (const s of specs) {
      await tx.update(courses).set({ nextCourseId: s.nextCode ? idByCode.get(s.nextCode) ?? null : null }).where(eq(courses.id, idByCode.get(s.code)!));
    }

    // ---- Lộ trình theo chương trình ----
    const paths = thPathSpecs();
    for (const p of paths) {
      const v = { name: p.name, description: p.description, criteriaText: p.criteriaText, isActive: true, updatedBy: actor, updatedAt: new Date() };
      const [hp] = await tx.select({ id: learningPaths.id }).from(learningPaths).where(and(eq(learningPaths.tenantId, tenantId), eq(learningPaths.code, p.code))).limit(1);
      let pathId: string;
      if (hp) { await tx.update(learningPaths).set(v).where(eq(learningPaths.id, hp.id)); pathId = hp.id; r.paths.updated += 1; }
      else { const [row] = await tx.insert(learningPaths).values({ tenantId, code: p.code, createdBy: actor, ...v }).returning({ id: learningPaths.id }); pathId = row!.id; r.paths.created += 1; }
      await tx.delete(learningPathCourses).where(eq(learningPathCourses.pathId, pathId));
      await tx.insert(learningPathCourses).values(p.courses.map((c, i) => ({ pathId, courseId: idByCode.get(c.code)!, seq: i + 1, required: c.required })));
    }

    // ---- Ngừng bán danh mục cũ (không xoá) ----
    if (opts.retireOthers) {
      const keep = specs.map((s) => s.code);
      const old = await tx.update(courses).set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(courses.tenantId, tenantId), notInArray(courses.code, keep), eq(courses.isActive, true))).returning({ id: courses.id });
      r.retired.courses = old.length;
      const keepPkg = specs.flatMap((s) => s.packages.map((p) => p.code));
      const oldPkg = await tx.update(coursePackages).set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(coursePackages.tenantId, tenantId), notInArray(coursePackages.code, keepPkg), eq(coursePackages.isActive, true))).returning({ id: coursePackages.id });
      r.retired.packages = oldPkg.length;
      const oldPath = await tx.update(learningPaths).set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(learningPaths.tenantId, tenantId), notInArray(learningPaths.code, paths.map((p) => p.code)), eq(learningPaths.isActive, true))).returning({ id: learningPaths.id });
      r.retired.paths = oldPath.length;
    }
    return r;
  });
}

/** Khoá chuẩn đang có trong CSDL của một trung tâm (mã → id, trạng thái) — dùng cho màn Khung chương trình */
export async function thCatalogState(db: Database, tenantId: string) {
  const codes = thCourseSpecs().map((s) => s.code);
  return db.select({ id: courses.id, code: courses.code, isActive: courses.isActive, totalSessions: courses.totalSessions })
    .from(courses).where(and(eq(courses.tenantId, tenantId), inArray(courses.code, codes)));
}
