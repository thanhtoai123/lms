import { getObject, verifyScormSignature } from "@satarobo/api";
import { SCORM_CONTENT_TYPES, NONCE_REQUEST_HEADER, fileExt, normalizeZipPath } from "@satarobo/core";

type P = { exp: string; sig: string; docId: string; version: string; path: string[] };

/** Phát tệp trong gói SCORM đã giải nén (chữ ký theo cả thư mục, đường dẫn tương đối trong gói vẫn chạy) */
export async function GET(req: Request, { params }: { params: Promise<P> }) {
  const p = await params;
  const version = Number(p.version);
  if (!/^[0-9a-f-]{36}$/.test(p.docId) || !Number.isInteger(version) || !verifyScormSignature(p.docId, version, Number(p.exp), p.sig)) {
    return new Response("Phiên học đã hết hạn — mở lại bài giảng", { status: 403 });
  }
  const rel = normalizeZipPath(p.path.map((s) => decodeURIComponent(s)).join("/"));
  if (!rel) return new Response("Đường dẫn không hợp lệ", { status: 400 });
  const body = await getObject(`scorm/${p.docId}/v${version}/${rel}`);
  if (!body) return new Response("Không tìm thấy tệp trong gói", { status: 404 });
  const type = SCORM_CONTENT_TYPES[fileExt(rel)] ?? "application/octet-stream";
  // Trang HTML của gói nằm trong iframe: sự kiện chuột/phím bên trong KHÔNG nổi ra khung ngoài,
  // nên rào chuột phải / kéo–thả / chọn–chép phải cắm thẳng vào trang đó. Chữ mờ và nhật ký vẫn do
  // khung ngoài lo (xem app/(admin)/scorm/buoi/[lessonId]/viewer.tsx).
  // nonce do proxy gắn cho chính yêu cầu này — script chèn thêm phải mang nonce, nếu không CSP chặn
  const out = type.startsWith("text/html") ? injectGuard(body.toString("utf8"), req.headers.get(NONCE_REQUEST_HEADER)) : new Uint8Array(body);
  return new Response(out, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Rào sao chép cắm vào mỗi trang HTML của gói SCORM (không đụng tới nội dung bài giảng) */
function injectGuard(html: string, nonce: string | null): string {
  const guard = `<script${nonce ? ` nonce="${nonce}"` : ""}>(function(){
    var stop=function(e){e.preventDefault();};
    document.addEventListener('contextmenu',stop);
    document.addEventListener('dragstart',stop);
    document.addEventListener('copy',stop);
    document.addEventListener('keydown',function(e){
      var k=(e.key||'').toLowerCase();
      if((e.ctrlKey||e.metaKey)&&(k==='p'||k==='s')){e.preventDefault();}
      try{ if(k==='printscreen'&&navigator.clipboard){navigator.clipboard.writeText('');} }catch(_){ }
    });
    var s=document.createElement('style');
    s.textContent='*{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}@media print{html,body{display:none!important}}';
    document.head&&document.head.appendChild(s);
  })();</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${guard}</body>`);
  return html + guard;
}
