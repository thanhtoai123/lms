import { getDb } from "@satarobo/db";
import { submitPublicHomework } from "@satarobo/api";
import { SUBMISSION_MAX_BYTES, SUBMISSION_MAX_FILES } from "@satarobo/core";
import { rateLimited } from "@/lib/route-ctx";

/** POST /api/public/homework/[token] — phụ huynh nộp bài cho con (token là quyền) */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return Response.json({ ok: false, error: "Liên kết không đúng" }, { status: 404 });
  if (rateLimited(`hw|${ip}|${token}`, 10, 10 * 60_000)) return Response.json({ ok: false, error: "Gửi quá nhiều lần, thử lại sau" }, { status: 429 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > SUBMISSION_MAX_FILES * SUBMISSION_MAX_BYTES + 1_000_000) return Response.json({ ok: false, error: "Tệp quá lớn" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, SUBMISSION_MAX_FILES + 1);
  const r = await submitPublicHomework(getDb(), token, {
    text: String(form.get("text") ?? "") || null, link: String(form.get("link") ?? "") || null,
    files: await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }))),
  });
  return Response.json(r, { status: r.ok ? 200 : 422 });
}
