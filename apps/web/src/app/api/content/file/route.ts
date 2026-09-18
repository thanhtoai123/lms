import { getObject, verifyMediaSignature } from "@satarobo/api";
import { DOC_FILE_TYPES, fileExt } from "@satarobo/core";

/** Tải tài liệu / bài nộp qua URL có chữ ký + hạn dùng */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const exp = Number(u.searchParams.get("exp"));
  const sig = u.searchParams.get("sig") ?? "";
  if (!/^(docs|homework)\//.test(key) || !verifyMediaSignature(key, exp, sig)) return new Response("Liên kết không hợp lệ hoặc đã hết hạn", { status: 403 });
  const body = await getObject(key);
  if (!body) return new Response("Không tìm thấy tệp", { status: 404 });
  const name = (u.searchParams.get("name") ?? key.split("/").pop() ?? "tai-lieu").replace(/[^A-Za-z0-9._-]/g, "_");
  const type = DOC_FILE_TYPES[fileExt(key)] ?? "application/octet-stream";
  const inline = u.searchParams.get("inline") === "1" && /^(application\/pdf|image\/(png|jpeg|webp)|video\/mp4)$/.test(type);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type, "Content-Length": String(body.length), "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      // Tệp do người dùng tải lên: cấm mọi tài nguyên/kịch bản khi trình duyệt mở trực tiếp
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
