import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { leads, centers, courses, users, staff, importBatches } from "@satarobo/db";
import {
  checkLeadImportRow, groupLeadImport, collapseByPhone, normalizePersonName, formatNoteTokens, visibleCenterIds, authorize, maskPhone,
  LEAD_IMPORT_MAX_ROWS, LEAD_STATUS_VI,
  type RawLeadImportRow, type ImportGroup, type IntakeChild, type LeadStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { canSeeLeadPhone, type Db } from "./admissionsAdmin";
import { createLead } from "./leads";

export type LeadImportMode = "leads" | "registered";
const BATCH_KIND: Record<LeadImportMode, string> = { leads: "leads", registered: "leads_registered" };
const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });

/** Cơ sở mặc định của người nhập (vai trò gắn cơ sở đầu tiên có quyền tạo lead); Hội sở → null */
function homeCenterId(ctx: ProtectedContext): string | null {
  if (visibleCenterIds(ctx.actor) === null) return null;
  return ctx.actor.assignments.find((a) => a.centerId && authorize(ctx.actor, "lead:create", { centerId: a.centerId }).allowed)?.centerId ?? null;
}

async function importRefs(db: Db, rows: readonly RawLeadImportRow[]) {
  const [cs, cos] = await Promise.all([
    db.select({ id: centers.id, code: centers.code }).from(centers),
    db.select({ id: courses.id, code: courses.code, name: courses.name }).from(courses),
  ]);
  const keys = [...new Set(rows.map((r) => r.sale.trim()).filter(Boolean))];
  const emails = keys.filter((k) => k.includes("@")).map((k) => k.toLowerCase());
  const codes = keys.filter((k) => !k.includes("@")).map((k) => k.toUpperCase());
  const [byEmail, byCode] = await Promise.all([
    emails.length ? db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(and(eq(users.isActive, true), inArray(sql<string>`lower(${users.email})`, emails))) : Promise.resolve([] as { id: string; fullName: string; email: string }[]),
    codes.length ? db.select({ id: users.id, fullName: users.fullName, code: staff.code }).from(staff).innerJoin(users, eq(users.id, staff.userId)).where(and(eq(users.isActive, true), inArray(sql<string>`upper(${staff.code})`, codes))) : Promise.resolve([] as { id: string; fullName: string; code: string }[]),
  ]);
  const center = (code: string) => cs.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null;
  const course = (text: string) => {
    const t = text.trim();
    if (!t) return null;
    const up = t.toUpperCase();
    const n = normalizePersonName(t);
    return (
      cos.find((c) => c.code.toUpperCase() === up) ??
      cos.find((c) => [" ", "—", "-", "–", ":", "("].some((sep) => up.startsWith(c.code.toUpperCase() + sep))) ??
      cos.find((c) => normalizePersonName(c.name) === n) ??
      null
    );
  };
  const sale = (key: string) => {
    const k = key.trim();
    if (!k) return null;
    return k.includes("@") ? byEmail.find((u) => u.email.toLowerCase() === k.toLowerCase()) ?? null : byCode.find((u) => u.code.toUpperCase() === k.toUpperCase()) ?? null;
  };
  return { center, course, sale };
}

export interface PreviewRow {
  line: number;
  group: ImportGroup;
  firstLine: number | null;
  errors: string[];
  messages: string[];
  phoneNormalized: string | null;
  centerId: string | null;
  centerCode: string | null;
  courseId: string | null;
  courseCode: string | null;
  saleId: string | null;
  saleName: string | null;
  birthYear: number | null;
  paid: number | null;
  dueDate2: string | null;
  registeredAt: string | null;
  existing: { id: string; parentName: string; status: LeadStatus; statusLabel: string; phone: string } | null;
}

async function analyse(ctx: ProtectedContext, rows: RawLeadImportRow[], mode: LeadImportMode) {
  if (rows.length > LEAD_IMPORT_MAX_ROWS) throw bad(`File quá lớn (${rows.length} dòng). Tối đa ${LEAD_IMPORT_MAX_ROWS}.`);
  const lines = new Set<number>();
  for (const r of rows) {
    if (lines.has(r.line)) throw bad(`Số dòng ${r.line} bị lặp`);
    lines.add(r.line);
  }
  const today = todayISO();
  const refs = await importRefs(ctx.db, rows);
  const visible = visibleCenterIds(ctx.actor);
  const home = homeCenterId(ctx);
  const checked = rows.map((r) => {
    const c = checkLeadImportRow(r, today);
    const errors = [...c.errors];
    let centerId = home;
    let centerCode: string | null = null;
    if (r.centerCode.trim()) {
      const ct = refs.center(r.centerCode);
      if (!ct) errors.push(`Không có cơ sở mã "${r.centerCode.trim()}"`);
      else if (visible !== null && !visible.includes(ct.id)) errors.push("Nhập hộ cơ sở khác cần quyền Hội sở");
      else {
        centerId = ct.id;
        centerCode = ct.code;
      }
    }
    if (errors.length === c.errors.length && !authorize(ctx.actor, "lead:create", { centerId }).allowed) errors.push("Không có quyền tạo lead ở cơ sở này");
    const co = r.course.trim() ? refs.course(r.course) : null;
    if (r.course.trim() && !co) errors.push(`Không tìm thấy khoá "${r.course.trim()}"`);
    const s = r.sale.trim() ? refs.sale(r.sale) : null;
    if (r.sale.trim() && !s) errors.push(`Không tìm thấy sale "${r.sale.trim()}" (email hoặc mã nhân viên)`);
    if (mode === "registered" && !r.childName.trim()) errors.push("Thiếu tên học viên (mỗi dòng là một học viên đã đăng ký)");
    return { raw: r, c, errors, centerId, centerCode, courseId: co?.id ?? null, courseCode: co?.code ?? null, saleId: s?.id ?? null, saleName: s?.fullName ?? null };
  });
  const phones = [...new Set(checked.map((x) => x.c.phoneNormalized).filter((p): p is string => !!p))];
  const existing: { id: string; parentName: string; status: LeadStatus; phoneNormalized: string }[] = [];
  for (let i = 0; i < phones.length; i += 1000) {
    existing.push(...(await ctx.db.select({ id: leads.id, parentName: leads.parentName, status: leads.status, phoneNormalized: leads.phoneNormalized }).from(leads)
      .where(and(inArray(leads.phoneNormalized, phones.slice(i, i + 1000)), isNull(leads.deletedAt)))));
  }
  const byPhone = new Map<string, (typeof existing)[number]>();
  for (const e of existing) if (!byPhone.has(e.phoneNormalized) || e.status !== "lost") byPhone.set(e.phoneNormalized, e);
  const groups = groupLeadImport(checked.map((x) => ({ line: x.raw.line, phone: x.raw.phone, phoneNormalized: x.c.phoneNormalized, errors: x.errors })), new Set(byPhone.keys()));
  const full = canSeeLeadPhone(ctx);
  const out: (PreviewRow & { raw: RawLeadImportRow })[] = checked.map((x) => {
    const g = groups.get(x.raw.line)!;
    const e = x.c.phoneNormalized ? byPhone.get(x.c.phoneNormalized) : undefined;
    return {
      raw: x.raw, line: x.raw.line, group: g.group, firstLine: g.firstLine, errors: x.errors,
      messages: g.group === "error" ? [] : [...g.messages, ...x.c.warnings],
      phoneNormalized: x.c.phoneNormalized, centerId: x.centerId, centerCode: x.centerCode, courseId: x.courseId, courseCode: x.courseCode, saleId: x.saleId, saleName: x.saleName,
      birthYear: x.c.birthYear, paid: x.c.paid, dueDate2: x.c.dueDate2, registeredAt: x.c.registeredAt,
      existing: e ? { id: e.id, parentName: e.parentName, status: e.status, statusLabel: LEAD_STATUS_VI[e.status], phone: full ? e.phoneNormalized : maskPhone(e.phoneNormalized) } : null,
    };
  });
  return out;
}

export async function previewLeadImport(ctx: ProtectedContext, input: { rows: RawLeadImportRow[]; mode: LeadImportMode }) {
  requirePermission(ctx, "lead:create");
  const rows = await analyse(ctx, input.rows, input.mode);
  const count = (g: ImportGroup) => rows.filter((r) => r.group === g).length;
  return {
    mode: input.mode,
    total: rows.length,
    counts: { new: count("new"), dup: count("dup"), error: count("error") },
    willWrite: collapseByPhone(rows.filter((r) => r.group !== "error")).length,
    rows: rows.map(({ raw: _raw, ...r }) => r),
  };
}

/**
 * Ghi các dòng hợp lệ (dòng lỗi bị bỏ): gộp dòng cùng SĐT, trùng CRM → gộp theo quy tắc (không xoá dữ liệu,
 * giữ trạng thái phễu; dòng tick "Đè" lấy dữ liệu file), cột sale → giao không tiêu lượt, không có sale → chia tự động.
 * Gọi nhiều lần với cùng batchId để ghi file lớn theo từng phần.
 */
export async function commitLeadImport(ctx: ProtectedContext, input: { rows: RawLeadImportRow[]; overwriteLines: number[]; note: string; mode: LeadImportMode; fileName?: string | null; batchId?: string | null }) {
  requirePermission(ctx, "lead:create");
  // "Đè" = lấy dữ liệu file thay dữ liệu đang có (mất số liệu cũ) — nặng hơn nhập thường,
  // nên cần quyền riêng; nhập không đè chỉ điền ô trống và ghi chênh lệch vào ghi chú.
  if (input.overwriteLines.length) requirePermission(ctx, "lead:overwrite");
  const note = input.note.trim();
  if (note.length < 3) throw bad("Nhập ghi chú cho lượt nhập (tối thiểu 3 ký tự)");
  const rows = await analyse(ctx, input.rows, input.mode);
  const overwrite = new Set(input.overwriteLines);
  const valid = rows.filter((r) => r.group !== "error");
  const skipped = rows.length - valid.length;

  let batchId = input.batchId ?? null;
  if (batchId) {
    const b = await ctx.db.query.importBatches.findFirst({ where: eq(importBatches.id, batchId) });
    if (!b || b.kind !== BATCH_KIND[input.mode] || b.createdBy !== ctx.user.id) throw bad("Lượt nhập không hợp lệ");
  } else {
    const [b] = await ctx.db.insert(importBatches).values({ kind: BATCH_KIND[input.mode], fileName: input.fileName ?? null, note, createdBy: ctx.user.id, summary: { created: 0, merged: 0, failed: 0 } }).returning({ id: importBatches.id });
    batchId = b!.id;
  }

  const results: { lines: number[]; ok: boolean; kind: "created" | "merged" | "failed"; message: string; leadId: string | null }[] = [];
  for (const g of collapseByPhone(valid)) {
    const lines = g.rows.map((r) => r.line);
    try {
      const pick = (f: (r: (typeof g.rows)[number]) => string | null | undefined) => g.rows.map(f).map((v) => (v ?? "").trim()).find(Boolean) || null;
      const first = g.rows[0]!;
      const children: IntakeChild[] = [];
      for (const r of g.rows) {
        if (!r.raw.childName.trim()) continue;
        const tokens = input.mode === "registered" ? formatNoteTokens({ paid: r.paid, dueDate2: r.dueDate2 }) : "";
        children.push({ fullName: r.raw.childName.trim(), birthYear: r.birthYear, interestedCourseId: r.courseId, notes: tokens || null });
      }
      const notes = [...new Set(g.rows.map((r) => r.raw.notes.trim()).filter(Boolean))].join(" | ") || null;
      const registeredAt = pick((r) => r.registeredAt);
      const r = await createLead(
        ctx.db,
        {
          parentName: pick((x) => x.raw.parentName), phone: first.raw.phone, email: pick((x) => x.raw.email), centerId: g.rows.find((x) => x.centerCode)?.centerId ?? first.centerId,
          source: pick((x) => x.raw.source) ?? (input.mode === "registered" ? "import-dang-ky" : "import"),
          notes, children, interestedCourseId: children[0]?.interestedCourseId ?? pick((x) => x.courseId),
          assignedToId: first.saleId ?? g.rows.find((x) => x.saleId)?.saleId ?? null,
          autoAssign: input.mode !== "registered",
        },
        ctx.user.id,
        {
          overwrite: lines.some((l) => overwrite.has(l)),
          status: input.mode === "registered" ? "enrolled" : undefined,
          receivedAt: registeredAt ? new Date(`${registeredAt}T08:00:00+07:00`) : null,
          assignSource: "import",
          reassignExistingTo: g.rows.find((x) => x.saleId)?.saleId ?? null,
        },
      );
      results.push({
        lines, ok: true, kind: r.duplicated ? "merged" : "created", leadId: r.lead.id,
        message: r.duplicated ? `Trùng số — đã gộp vào khách cũ${r.childrenAdded ? `, thêm ${r.childrenAdded} bé` : ""}${r.hasConflicts ? " (giá trị khác ghi vào ghi chú)" : ""}` : `Đã tạo${r.childrenAdded ? ` · ${r.childrenAdded} bé` : ""}`,
      });
    } catch (e) {
      results.push({ lines, ok: false, kind: "failed", leadId: null, message: (e as Error).message });
    }
  }
  const created = results.filter((x) => x.kind === "created").length;
  const merged = results.filter((x) => x.kind === "merged").length;
  const failed = results.filter((x) => x.kind === "failed").length;
  await ctx.db.update(importBatches).set({
    totalRows: sql`${importBatches.totalRows} + ${rows.length}`,
    okRows: sql`${importBatches.okRows} + ${results.filter((x) => x.ok).reduce((s, x) => s + x.lines.length, 0)}`,
    skippedRows: sql`${importBatches.skippedRows} + ${skipped + results.filter((x) => !x.ok).reduce((s, x) => s + x.lines.length, 0)}`,
    summary: sql`jsonb_build_object(
      'created', coalesce((${importBatches.summary}->>'created')::int, 0) + ${created},
      'merged', coalesce((${importBatches.summary}->>'merged')::int, 0) + ${merged},
      'failed', coalesce((${importBatches.summary}->>'failed')::int, 0) + ${failed})`,
  }).where(eq(importBatches.id, batchId));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "import_batches", entityId: batchId, after: { mode: input.mode, rows: rows.length, created, merged, failed, skipped, overwrite: input.overwriteLines.length }, reason: note, ip: ctx.ip });
  return { batchId, created, merged, failed, skipped, results };
}
