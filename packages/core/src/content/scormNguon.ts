/**
 * CÁCH LY GÓI SCORM — chạy bài giảng trên MIỀN RIÊNG.
 *
 * Gói SCORM là HTML + JavaScript do người dùng tải lên. Phát nó trên CÙNG miền với trang quản trị
 * nghĩa là JavaScript trong gói chạy với cookie đăng nhập của người đang xem: một người có quyền
 * tải học liệu có thể cài vào gói một đoạn gọi `/api/trpc` để tự cấp quyền, và chỉ cần một quản
 * trị tối cao mở xem thử bài giảng là xong.
 *
 * Khai `SCORM_ORIGIN` (vd `https://hoc-lieu.satarobo.vn`, trỏ cùng ứng dụng) thì:
 *   - bài giảng chỉ được phát trên miền đó (route từ chối miền quản trị);
 *   - cookie đăng nhập (chỉ gắn cho miền quản trị) không đi theo, và gọi API từ miền đó bị chặn
 *     như mọi yêu cầu khác trang;
 *   - API SCORM được cung cấp bằng một "cầu nối" nhúng vào trang của gói: đọc dữ liệu ban đầu từ
 *     `window.name` (khung ngoài đặt), gửi thay đổi ra khung ngoài bằng `postMessage`.
 */

/** Chuẩn hoá `SCORM_ORIGIN`; không khai / sai định dạng → null (phát cùng miền như máy phát triển) */
export function scormNguon(env: Record<string, string | undefined>): string | null {
  const raw = (env.SCORM_ORIGIN ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Yêu cầu có đang đến đúng miền học liệu không (so theo host, gồm cả cổng) */
export function dungMienHocLieu(nguon: string, host: string | null | undefined): boolean {
  if (!host) return false;
  return new URL(nguon).host.toLowerCase() === host.trim().toLowerCase();
}

/** Miền học liệu không được trùng miền quản trị — trùng thì cách ly không có tác dụng */
export function mienHocLieuHopLe(nguon: string | null, appUrl: string | null | undefined): boolean {
  if (!nguon || !appUrl) return !!nguon;
  try {
    return new URL(nguon).host !== new URL(appUrl).host;
  } catch {
    return false;
  }
}

/** Nonce chỉ gồm ký tự an toàn — không để chuỗi lạ chèn vào thẻ <script> */
export function nonceAnToan(nonce: string | null | undefined): string | null {
  return nonce && /^[A-Za-z0-9+/=_-]{8,128}$/.test(nonce) ? nonce : null;
}

export interface TinScorm {
  op: "set" | "commit" | "finish";
  cmi: Record<string, string>;
}

const TOI_DA_KHOA = 500;
const TOI_DA_BYTE = 256 * 1024;

/**
 * Kiểm tin nhắn từ khung bài giảng (dữ liệu KHÔNG tin cậy — do JavaScript của gói gửi lên).
 * Chỉ nhận đúng hình dạng, giới hạn số khoá và dung lượng, và bỏ các khoá định danh người học
 * (gói không được đổi mã / tên người học).
 */
export function docTinScorm(data: unknown): TinScorm | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { sr?: unknown; op?: unknown; cmi?: unknown };
  if (d.sr !== "scorm") return null;
  if (d.op !== "set" && d.op !== "commit" && d.op !== "finish") return null;
  if (!d.cmi || typeof d.cmi !== "object" || Array.isArray(d.cmi)) return null;
  const out: Record<string, string> = {};
  let n = 0;
  let size = 0;
  for (const [k, v] of Object.entries(d.cmi as Record<string, unknown>)) {
    if (typeof k !== "string" || !k.startsWith("cmi.") || k.length > 255) continue;
    if (/student_(id|name)|learner_(id|name)/.test(k)) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    const s = String(v);
    size += k.length + s.length;
    if (++n > TOI_DA_KHOA || size > TOI_DA_BYTE) return null;
    out[k] = s;
  }
  return { op: d.op, cmi: out };
}

/**
 * Đoạn script cầu nối nhúng vào đầu MỖI trang HTML của gói khi phát trên miền riêng.
 * `parentOrigin` là miền quản trị — tin nhắn chỉ gửi tới đúng miền đó.
 */
export function scriptCauNoiScorm(parentOrigin: string, nonce: string | null): string {
  const P = JSON.stringify(parentOrigin).replace(/</g, "\\u003c");
  return `<script${nonce ? ` nonce="${nonce}"` : ""}>(function(){
try{if(window.parent!==window&&window.parent.__srScorm){window.API=window.parent.API;window.API_1484_11=window.parent.API_1484_11;window.__srScorm=1;return;}}catch(e){}
var P=${P},st={},err="0",done=false,ok="true";
try{var d=JSON.parse(window.name||"{}");if(d&&d.sr===1&&d.cmi&&typeof d.cmi==="object")st=d.cmi;}catch(e){}
var keep=function(){try{window.name=JSON.stringify({sr:1,cmi:st});}catch(e){}};
var send=function(op){keep();try{window.parent.postMessage({sr:"scorm",op:op,cmi:st},P);}catch(e){}};
var get=function(k){err="0";k=String(k);if(/\\._count$/.test(k))return "0";return st[k]!=null?String(st[k]):"";};
var set=function(k,v){err="0";st[String(k)]=String(v);send("set");return ok;};
var fin=function(){if(!done){done=true;send("finish");}return ok;};
var com=function(){send("commit");return ok;};
var es=function(c){return c==="0"?"No error":"Error";};
var le=function(){return err;};
window.API={LMSInitialize:function(){return ok;},LMSFinish:fin,LMSGetValue:get,LMSSetValue:set,LMSCommit:com,LMSGetLastError:le,LMSGetErrorString:es,LMSGetDiagnostic:es};
window.API_1484_11={Initialize:function(){return ok;},Terminate:fin,GetValue:get,SetValue:set,Commit:com,GetLastError:le,GetErrorString:es,GetDiagnostic:es};
window.__srScorm=1;
})();</script>`;
}

/** Chèn cầu nối vào đầu trang (trước mọi script của gói) */
export function chenCauNoi(html: string, script: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + script);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + script);
  return script + html;
}
