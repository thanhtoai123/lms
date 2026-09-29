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
    // ảnh mẫu của dữ liệu seed: sinh ảnh giữ chỗ (đổi màu + nhãn theo khoá cho gallery đỡ đơn điệu)
    const fname = key.split("/").pop()?.replace(/\.\w+$/, "") ?? "anh";
    const isBe = /(^|\/)be-/.test(key) || /\bbe-/.test(fname);
    const isLop = /(^|\/)lop-/.test(key) || /\blop-/.test(fname);
    let hsh = 2166136261; for (let i = 0; i < key.length; i++) { hsh ^= key.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
    const hue = (hsh >>> 0) % 360;
    const label = isBe ? "Ảnh của bé (mẫu)" : isLop ? "Ảnh cả lớp (mẫu)" : "Ảnh minh chứng (mẫu)";
    body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="hsl(${hue} 45% 92%)"/><circle cx="150" cy="150" r="70" fill="hsl(${hue} 55% 55%)" opacity=".35"/><rect x="250" y="120" width="300" height="180" rx="20" fill="hsl(${(hue + 40) % 360} 55% 50%)" opacity=".3"/><path d="M120 320 q80 -60 160 0 t160 0" stroke="hsl(${hue} 50% 45%)" stroke-width="10" fill="none" opacity=".4"/><text x="320" y="380" font-family="sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="hsl(${hue} 60% 30%)">${escXml(label)}</text></svg>`);
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
