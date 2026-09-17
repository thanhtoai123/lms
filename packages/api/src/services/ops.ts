import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { appSettings, type Database } from "@satarobo/db";
import { envChecks, envSummary, backupFreshness, heartbeatState, fmtBytes, requirePermissionCheck } from "./ops-helpers";
import type { ProtectedContext } from "../trpc";
import { putObject, getObject } from "../storage";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;

export async function recordHeartbeat(db: Database, source: "worker" | "cron", info: Record<string, unknown>) {
  const v = { at: new Date().toISOString(), pid: process.pid, ...info };
  await asDb(db).insert(appSettings).values({ key: `heartbeat:${source}`, value: v })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v, updatedAt: new Date() } });
}

async function heartbeat(db: Db, source: string) {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, `heartbeat:${source}`) });
  const v = (r?.value ?? null) as { at?: string } | null;
  return v?.at ? { at: new Date(v.at), info: v } : null;
}

/** Kiểm tra sống: DB, lưu trữ, worker. Không trả bí mật. */
export async function healthCheck(db: Database) {
  const d = asDb(db);
  const checks: { key: string; ok: boolean; ms?: number; note?: string }[] = [];
  const t0 = Date.now();
  try {
    await d.execute(sql`select 1`);
    checks.push({ key: "database", ok: true, ms: Date.now() - t0 });
  } catch (e) {
    checks.push({ key: "database", ok: false, note: (e as Error).message.slice(0, 120) });
  }
  const t1 = Date.now();
  try {
    const stamp = String(Date.now());
    await putObject("health/probe.txt", new TextEncoder().encode(stamp));
    const back = await getObject("health/probe.txt");
    checks.push({ key: "storage", ok: back?.toString() === stamp, ms: Date.now() - t1 });
  } catch (e) {
    checks.push({ key: "storage", ok: false, note: (e as Error).message.slice(0, 120) });
  }
  const now = new Date();
  let worker: "ok" | "stale" | "missing" = "missing";
  try {
    const [w, c] = [await heartbeat(d, "worker"), await heartbeat(d, "cron")];
    const latest = [w?.at, c?.at].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    worker = heartbeatState(latest, now);
  } catch { /* DB lỗi đã ghi ở trên */ }
  checks.push({ key: "worker", ok: worker === "ok", note: worker });
  const ok = checks.filter((c) => c.key !== "worker").every((c) => c.ok);
  return { ok, degraded: ok && worker !== "ok", checks, version: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: now.toISOString() };
}

async function listBackups() {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return { configured: false, files: [] as { name: string; size: number; at: Date }[], latest: null as null | { at: string; db?: string; files?: string; dbBytes?: number; filesBytes?: number } };
  try {
    const names = (await readdir(/* turbopackIgnore: true */ dir)).filter((n) => /\.(dump|sql\.gz|zip|tar\.gz)$/.test(n));
    const files = await Promise.all(names.map(async (n) => { const s = await stat(/* turbopackIgnore: true */ path.join(dir, n)); return { name: n, size: s.size, at: s.mtime }; }));
    files.sort((a, b) => b.at.getTime() - a.at.getTime());
    let latest = null;
    try { latest = JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(dir, "LATEST.json"), "utf8")); } catch { latest = null; }
    return { configured: true, files: files.slice(0, 30), latest };
  } catch {
    return { configured: true, files: [], latest: null, error: "Không đọc được BACKUP_DIR" };
  }
}

export async function opsStatus(ctx: ProtectedContext) {
  requirePermissionCheck(ctx);
  const production = process.env.NODE_ENV === "production";
  const env = envChecks(process.env as Record<string, string | undefined>, production);
  const health = await healthCheck(ctx.db as unknown as Database);
  const now = new Date();
  const [w, c] = [await heartbeat(ctx.db, "worker"), await heartbeat(ctx.db, "cron")];
  const backups = await listBackups();
  const latestBackupAt = backups.latest?.at ? new Date(backups.latest.at) : backups.files[0]?.at ?? null;
  const [vol] = (await ctx.db.execute(sql`select
    pg_database_size(current_database())::bigint as db_bytes,
    (select count(*) from students where deleted_at is null)::int as students,
    (select count(*) from leads where deleted_at is null)::int as leads,
    (select count(*) from enrollments)::int as enrollments,
    (select count(*) from sessions)::int as sessions,
    (select count(*) from attendance)::int as attendance,
    (select count(*) from orders)::int as orders,
    (select count(*) from payments)::int as payments,
    (select count(*) from audit_log)::int as audit,
    (select count(*) from messages)::int as messages`)) as unknown as Record<string, number>[];
  const [q] = (await ctx.db.execute(sql`select
    (select count(*) from outbox where processed_at is null)::int as outbox_pending,
    (select coalesce(extract(epoch from now() - min(created_at)) / 60, 0)::int from outbox where processed_at is null) as outbox_oldest_min,
    (select count(*) from outbox where processed_at is null and attempts >= 3)::int as outbox_stuck,
    (select count(*) from email_logs where status = 'failed' and created_at > now() - interval '24 hours')::int as email_failed_24h,
    (select count(*) from webhook_events where status in ('failed','rejected') and received_at > now() - interval '24 hours')::int as webhook_bad_24h,
    (select count(*) from data_requests where status in ('received','verifying','in_progress') and due_at < now())::int as dsr_overdue,
    (select count(*) from data_incidents where status <> 'closed' and notified_authority_at is null and severity <> 'low' and notify_due_at < now())::int as incident_overdue,
    (select count(*) from messages where status = 'failed' and created_at > now() - interval '24 hours')::int as msg_failed_24h,
    (select count(*) from sessions where status in ('scheduled','in_progress','attendance_done','notes_done') and date < current_date - 1)::int as sessions_unclosed`)) as unknown as Record<string, number>[];
  const envSum = envSummary(env);
  const bf = backupFreshness(latestBackupAt, now);
  const hb = heartbeatState([w?.at, c?.at].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null, now);
  const checklist = [
    { key: "env", label: "Biến môi trường bắt buộc đầy đủ, không còn giá trị mẫu", ok: envSum.ready },
    { key: "dev", label: "Tắt đăng nhập tài khoản mẫu (ALLOW_DEV_ACTOR)", ok: process.env.ALLOW_DEV_ACTOR !== "1" },
    { key: "health", label: "Cơ sở dữ liệu & lưu trữ hoạt động", ok: health.ok },
    { key: "worker", label: "Worker / cron chạy đều (nhịp ≤ 5 phút)", ok: hb === "ok" },
    { key: "backup", label: "Có bản sao lưu trong 26 giờ gần nhất", ok: bf === "ok" },
    { key: "restore", label: "Đã thử khôi phục bản sao lưu (ghi trong LATEST.json)", ok: !!(backups.latest as { restoreTestedAt?: string } | null)?.restoreTestedAt },
    { key: "queue", label: "Không có sự kiện outbox kẹt (≥ 3 lần lỗi)", ok: (q?.outbox_stuck ?? 0) === 0 },
    { key: "compliance", label: "Không có yêu cầu dữ liệu / sự cố quá hạn", ok: (q?.dsr_overdue ?? 0) === 0 && (q?.incident_overdue ?? 0) === 0 },
  ];
  return {
    production, health, env, envSummary: envSum,
    heartbeats: { worker: w ? { at: w.at, state: heartbeatState(w.at, now) } : null, cron: c ? { at: c.at, state: heartbeatState(c.at, now) } : null, overall: hb },
    backups: { ...backups, freshness: bf, latestAt: latestBackupAt, files: backups.files.map((f) => ({ ...f, sizeLabel: fmtBytes(f.size) })) },
    volume: vol ? { ...vol, dbSize: fmtBytes(Number(vol.db_bytes)) } : null,
    queues: q ?? {},
    checklist, readyScore: Math.round((checklist.filter((x) => x.ok).length / checklist.length) * 100),
  };
}
