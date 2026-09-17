import { getDb } from "@satarobo/db";
import { publicJob, applyToJob, logWebhook, CV_MAX_BYTES } from "@satarobo/api";
import { publicCors } from "@/lib/public-cors";
import { rateLimited } from "@/lib/route-ctx";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = /^[a-z0-9-]{3,100}$/.test(slug) ? await publicJob(getDb(), slug) : null;
  const headers = publicCors(req.headers.get("origin"), "GET, POST, OPTIONS");
  return j ? Response.json(j, { headers }) : Response.json({ error: "Không tìm thấy" }, { status: 404, headers });
}

/** POST multipart: fullName, phone, email, note, consent=1, cv (PDF/DOCX ≤5MB), website (honeypot) */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = publicCors(req.headers.get("origin"), "GET, POST, OPTIONS");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  if (!/^[a-z0-9-]{3,100}$/.test(slug)) return Response.json({ ok: false, error: "Không tìm thấy" }, { status: 404, headers });
  if (rateLimited(`job|${ip}`, 5, 10 * 60_000)) return Response.json({ ok: false, error: "Gửi quá nhiều lần, thử lại sau" }, { status: 429, headers });
  if (Number(req.headers.get("content-length") ?? 0) > CV_MAX_BYTES + 200_000) return Response.json({ ok: false, error: "CV tối đa 5MB" }, { status: 413, headers });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400, headers });
  if (String(form.get("website") ?? "")) return Response.json({ ok: true }, { headers });
  const cv = form.get("cv");
  const db = getDb();
  const r = await applyToJob(db, {
    slug, fullName: String(form.get("fullName") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? "") || null,
    note: String(form.get("note") ?? "") || null, consent: ["1", "on", "true"].includes(String(form.get("consent") ?? "")), source: String(form.get("source") ?? "website").slice(0, 30),
    cv: cv instanceof File && cv.size > 0 ? { name: cv.name, bytes: new Uint8Array(await cv.arrayBuffer()) } : null,
  });
  await logWebhook(db, { source: "public_job", status: r.ok ? (r.duplicated ? "duplicate" : "processed") : "rejected", httpStatus: r.ok ? 200 : r.status, payload: { slug, hasCv: cv instanceof File }, error: r.ok ? null : r.error, ip });
  return Response.json(r.ok ? { ok: true, duplicated: r.duplicated } : { ok: false, error: r.error }, { status: r.ok ? 200 : r.status, headers });
}
