import { getDb } from "@satarobo/db";
import { healthCheck } from "@satarobo/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — cho giám sát (UptimeRobot, BetterStack…).
 * 200 khi DB + lưu trữ hoạt động (worker chậm chỉ báo "degraded"), 503 khi hỏng. Không chứa dữ liệu nhạy cảm.
 */
export async function GET() {
  const h = await healthCheck(getDb()).catch((e: Error) => ({ ok: false, degraded: false, checks: [{ key: "app", ok: false, note: e.message.slice(0, 120) }], version: "unknown", at: new Date().toISOString() }));
  return Response.json(
    { status: h.ok ? (h.degraded ? "degraded" : "ok") : "down", version: h.version, at: h.at, checks: h.checks.map((c) => ({ key: c.key, ok: c.ok, ms: "ms" in c ? c.ms : undefined, note: c.key === "worker" ? c.note : undefined })) },
    { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
