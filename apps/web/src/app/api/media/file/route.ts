import { getObject, verifyMediaSignature } from "@satarobo/api";

/**
 * Chỉ phát đúng các định dạng ảnh bitmap. KHÔNG có svg: tệp SVG chạy được JavaScript,
 * mở thẳng trên miền quản trị là XSS lưu trữ (đọc được cookie phiên nhân sự).
 */
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const escXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Phát ảnh qua URL có chữ ký + hạn dùng (không có URL công khai cố định) */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const exp = Number(u.searchParams.get("exp"));
  const sig = u.searchParams.get("sig") ?? "";
  if (!verifyMediaSignature(key, exp, sig)) return new Response("Liên kết ảnh không hợp lệ hoặc đã hết hạn", { status: 403 });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  let body = await getObject(key);
  if (!body && key.startsWith("seed/")) {
    // ảnh mẫu của dữ liệu seed: sinh ảnh giữ chỗ
    const label = key.split("/").pop()?.replace(/\.\w+$/, "") ?? "ảnh";
    body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#ecdcf5"/><circle cx="160" cy="150" r="60" fill="#610b8a" opacity=".25"/><rect x="260" y="110" width="260" height="160" rx="18" fill="#610b8a" opacity=".18"/><text x="320" y="360" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#4b076b">Ảnh lớp mẫu · ${escXml(label)}</text></svg>`);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff",
        // Ảnh giữ chỗ do máy chủ sinh, vẫn khoá kịch bản để không thành điểm tựa XSS
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  }
  if (!body) return new Response("Không tìm thấy ảnh", { status: 404 });
  const type = TYPES[ext];
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type ?? "application/octet-stream", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff",
      // Đuôi lạ thì bắt tải về, không bao giờ render trong ngữ cảnh của miền quản trị
      ...(type ? {} : { "Content-Disposition": "attachment" }),
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
