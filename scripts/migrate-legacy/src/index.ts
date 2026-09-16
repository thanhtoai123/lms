/**
 * Migrate dữ liệu từ Supabase cũ (LEGACY_DATABASE_URL) sang schema mới (DATABASE_URL).
 *
 * Cách chạy:
 *   LEGACY_DATABASE_URL=postgres://... DATABASE_URL=postgres://... pnpm migrate:legacy -- --dry-run
 *   pnpm migrate:legacy -- --tables=centers,rooms,courses
 *
 * Nguyên tắc:
 *  - Idempotent: giữ nguyên UUID legacy làm id mới, upsert theo id → chạy lại không nhân bản.
 *  - Dry-run mặc định in số dòng và 3 mẫu mỗi bảng, không ghi.
 *  - Mỗi bảng là một bước độc lập; lỗi ở bảng nào dừng ở bảng đó với thông báo rõ.
 *  - PII nhạy cảm (CCCD, địa chỉ) chỉ đi vào parent_private và được mã hoá bằng ENCRYPTION_KEY.
 */
import "dotenv/config";
import postgres from "postgres";
import { createHmac, createCipheriv, randomBytes } from "node:crypto";
import { createDb, centers, rooms, courses, teachers, parents, parentPrivate, students, studentGuardians, classes, classSchedules, sessions, enrollments, attendance } from "@satarobo/db";
import { MAPPING, SESSION_STATUS_MAP, ATTENDANCE_STATUS_MAP, parseLegacySchedule } from "./mapping";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--write");
const only = [...args].find((a) => a.startsWith("--tables="))?.slice(9).split(",");

const legacyUrl = process.env.LEGACY_DATABASE_URL;
if (!legacyUrl) throw new Error("LEGACY_DATABASE_URL chưa cấu hình");
const legacy = postgres(legacyUrl, { max: 2 });
const db = createDb();

function encrypt(plain: string | null): string | null {
  if (!plain) return null;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY (32 bytes hex) cần để mã hoá PII");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${enc.toString("hex")}`;
}

async function read<T = Record<string, unknown>>(key: keyof typeof MAPPING): Promise<T[]> {
  const m = MAPPING[key];
  try {
    return (await legacy.unsafe(m.select)) as unknown as T[];
  } catch (e) {
    throw new Error(`[${key}] Không đọc được bảng legacy "${m.legacyTable}": ${(e as Error).message}\n→ Sửa MAPPING.${key}.select trong mapping.ts`);
  }
}

function report(key: string, rows: unknown[]) {
  console.log(`\n== ${key}: ${rows.length} dòng ${dryRun ? "(dry-run)" : ""}`);
  for (const r of rows.slice(0, 3)) console.log("   ", JSON.stringify(r).slice(0, 200));
}

const steps: Record<string, () => Promise<void>> = {
  async centers() {
    const rows = await read<{ id: string; code: string; name: string; address: string | null; phone: string | null }>("centers");
    report("centers", rows);
    if (dryRun) return;
    for (const r of rows) await db.insert(centers).values(r).onConflictDoUpdate({ target: centers.id, set: { name: r.name, address: r.address, phone: r.phone } });
  },
  async rooms() {
    const rows = await read<{ id: string; center_id: string; code: string; name: string; capacity: number }>("rooms");
    report("rooms", rows);
    if (dryRun) return;
    for (const r of rows) await db.insert(rooms).values({ id: r.id, centerId: r.center_id, code: r.code, name: r.name, capacity: r.capacity }).onConflictDoNothing();
  },
  async courses() {
    const rows = await read<{ id: string; code: string; name: string; slug: string | null; grade_from: number | null; grade_to: number | null; total_sessions: number; price: number }>("courses");
    report("courses", rows);
    if (dryRun) return;
    for (const r of rows)
      await db.insert(courses).values({ id: r.id, code: r.code, name: r.name, slug: r.slug, gradeFrom: r.grade_from, gradeTo: r.grade_to, totalSessions: r.total_sessions, listPrice: String(r.price) }).onConflictDoNothing();
  },
  async teachers() {
    const rows = await read<{ id: string; user_id: string | null; center_id: string | null; code: string | null; full_name: string; phone: string | null; email: string | null; grade: string | null; contract_type: string | null; status: string | null }>("teachers");
    report("teachers", rows);
    if (dryRun) return;
    for (const r of rows)
      await db.insert(teachers).values({ id: r.id, centerId: r.center_id, code: r.code, fullName: r.full_name, phone: r.phone, email: r.email, grade: r.grade, isActive: r.status !== "INACTIVE" }).onConflictDoNothing();
  },
  async parents() {
    const rows = await read<{ id: string; full_name: string; phone: string; email: string | null; zalo_id: string | null; national_id: string | null; address: string | null }>("parents");
    report("parents", rows.map(({ national_id: _n, address: _a, ...rest }) => rest)); // không in PII
    if (dryRun) return;
    for (const r of rows) {
      await db.insert(parents).values({ id: r.id, fullName: r.full_name, phone: r.phone, email: r.email, zaloId: r.zalo_id }).onConflictDoNothing();
      if (r.national_id || r.address) await db.insert(parentPrivate).values({ parentId: r.id, nationalIdEnc: encrypt(r.national_id), addressEnc: encrypt(r.address) }).onConflictDoNothing();
    }
  },
  async students() {
    const rows = await read<{ id: string; code: string | null; full_name: string; nickname: string | null; dob: string | null; grade: number | null; school: string | null; center_id: string | null; status: string | null; parent_id: string | null }>("students");
    report("students", rows);
    if (dryRun) return;
    for (const r of rows) {
      await db.insert(students).values({ id: r.id, code: r.code, fullName: r.full_name, nickname: r.nickname, dateOfBirth: r.dob, grade: r.grade, school: r.school, homeCenterId: r.center_id, status: r.status === "ACTIVE" ? "active" : r.status === "TRIAL" ? "trial" : "paused" }).onConflictDoNothing();
      if (r.parent_id) await db.insert(studentGuardians).values({ studentId: r.id, parentId: r.parent_id, isPrimary: true }).onConflictDoNothing();
    }
  },
  async classes() {
    const rows = await read<{ id: string; code: string; name: string; course_id: string; center_id: string; room_id: string | null; teacher_id: string | null; capacity: number | null; start_date: string | null; status: string | null; schedule_text: string | null }>("classes");
    report("classes", rows);
    if (dryRun) return;
    for (const r of rows) {
      await db.insert(classes).values({ id: r.id, code: r.code, name: r.name, courseId: r.course_id, centerId: r.center_id, homeRoomId: r.room_id, leadTeacherId: r.teacher_id, capacity: r.capacity ?? 12, startDate: r.start_date, status: r.status === "RUNNING" ? "running" : r.status === "FINISHED" ? "finished" : "recruiting" }).onConflictDoNothing();
      const parsed = r.schedule_text ? parseLegacySchedule(r.schedule_text) : null;
      if (parsed && r.start_date) await db.insert(classSchedules).values({ classId: r.id, weekday: parsed.weekday, startTime: parsed.startTime, endTime: parsed.endTime, roomId: r.room_id, teacherId: r.teacher_id, effectiveFrom: r.start_date }).onConflictDoNothing();
    }
  },
  async sessions() {
    const rows = await read<{ id: string; class_id: string; seq: number; date: string; start_time: string; end_time: string; room_id: string | null; teacher_id: string | null; status: string | null; topic: string | null; note: string | null }>("sessions");
    report("sessions", rows);
    if (dryRun) return;
    for (const r of rows)
      await db.insert(sessions).values({ id: r.id, classId: r.class_id, sequenceNo: r.seq, date: r.date, startTime: r.start_time, endTime: r.end_time, roomId: r.room_id, teacherId: r.teacher_id, status: SESSION_STATUS_MAP[(r.status ?? "").toUpperCase()] ?? "scheduled", topic: r.topic, sessionNote: r.note }).onConflictDoNothing();
  },
  async enrollments() {
    const rows = await read<{ id: string; student_id: string; class_id: string; status: string | null; package_sessions: number | null; created_at: string }>("enrollments");
    report("enrollments", rows);
    if (dryRun) return;
    for (const r of rows)
      await db.insert(enrollments).values({ id: r.id, studentId: r.student_id, classId: r.class_id, status: r.status === "COMPLETED" ? "completed" : r.status === "WITHDRAWN" ? "withdrawn" : "active", packageSessions: r.package_sessions ?? 48, enrolledAt: new Date(r.created_at) }).onConflictDoNothing();
  },
  async attendance() {
    const rows = await read<{ id: string; session_id: string; enrollment_id: string; status: string; note: string | null }>("attendance");
    report("attendance", rows);
    if (dryRun) return;
    for (const r of rows)
      await db.insert(attendance).values({ id: r.id, sessionId: r.session_id, enrollmentId: r.enrollment_id, status: ATTENDANCE_STATUS_MAP[r.status.toUpperCase()] ?? "present", note: r.note }).onConflictDoNothing();
  },
};

async function main() {
  console.log(`Legacy migration — ${dryRun ? "DRY RUN (thêm --write để ghi)" : "WRITE MODE"}`);
  const order = Object.keys(steps).filter((k) => !only || only.includes(k));
  for (const k of order) {
    await steps[k]!();
  }
  // Ký tên checksum để log ai chạy migration khi nào
  const sig = createHmac("sha256", "satarobo-migration").update(`${new Date().toISOString()}:${order.join(",")}`).digest("hex").slice(0, 12);
  console.log(`\n✔ Xong ${order.length} bước · run-id ${sig}`);
}

main()
  .catch((e) => {
    console.error("\n✖", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await legacy.end();
    process.exit(0);
  });
