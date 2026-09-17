import { getObject } from "@satarobo/api";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Ảnh công khai của website (chỉ thư mục site/) */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(file);
  if (!m) return new Response("Không tìm thấy", { status: 404 });
  const body = await getObject(`site/${file}`);
  if (!body) return new Response("Không tìm thấy", { status: 404 });
  return new Response(new Uint8Array(body), { headers: { "Content-Type": TYPES[m[1]!]!, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
