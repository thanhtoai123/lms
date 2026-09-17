import { getObject, verifyScormSignature } from "@satarobo/api";
import { SCORM_CONTENT_TYPES, fileExt, normalizeZipPath } from "@satarobo/core";

type P = { exp: string; sig: string; docId: string; version: string; path: string[] };

/** Phát tệp trong gói SCORM đã giải nén (chữ ký theo cả thư mục, đường dẫn tương đối trong gói vẫn chạy) */
export async function GET(_req: Request, { params }: { params: Promise<P> }) {
  const p = await params;
  const version = Number(p.version);
  if (!/^[0-9a-f-]{36}$/.test(p.docId) || !Number.isInteger(version) || !verifyScormSignature(p.docId, version, Number(p.exp), p.sig)) {
    return new Response("Phiên học đã hết hạn — mở lại bài giảng", { status: 403 });
  }
  const rel = normalizeZipPath(p.path.map((s) => decodeURIComponent(s)).join("/"));
  if (!rel) return new Response("Đường dẫn không hợp lệ", { status: 400 });
  const body = await getObject(`scorm/${p.docId}/v${version}/${rel}`);
  if (!body) return new Response("Không tìm thấy tệp trong gói", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": SCORM_CONTENT_TYPES[fileExt(rel)] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
