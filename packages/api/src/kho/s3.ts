/**
 * KHO TỆP TRÊN DỊCH VỤ TƯƠNG THÍCH S3 — Cloudflare R2, AWS S3, MinIO, hoặc kho đối tượng
 * của nhà cung cấp trong nước.
 *
 * Vì sao bắt buộc khi chạy thật: bản đĩa cục bộ (`kho/dia.ts`) chỉ đúng trên một máy chủ
 * có ổ đĩa bền. Trên nền tảng triển khai kiểu Vercel, đĩa là tạm thời — **mọi ảnh lớp, tài
 * liệu, CV, bài nộp sẽ bay sau mỗi lần triển khai**, và không ai phát hiện cho tới khi mở
 * lại một ảnh cũ. Tự dựng máy chủ thì đỡ hơn nhưng cả kho tệp nằm trên một ổ không nhân bản.
 *
 * Ảnh vẫn KHÔNG công khai: khoá bucket luôn để riêng tư, ứng dụng đọc qua đây rồi phát lại
 * bằng URL có chữ ký ngắn hạn của chính mình (`signedMediaUrl`). Không dùng URL ký sẵn của
 * S3 — như vậy quyền xem vẫn do hệ thống quyết định, không do ai giữ được đường dẫn.
 */
import { isSafeObjectKey } from "@satarobo/core";
import { kyYeuCau, type CauHinhS3 } from "./sigv4";
import type { KhoTep } from "./loai";

/** Bao nhiêu tệp xoá song song khi dọn cả một tiền tố (gói SCORM có hàng trăm tệp) */
const XOA_SONG_SONG = 16;

export function docCauHinhS3(env: Record<string, string | undefined>): CauHinhS3 | null {
  const bucket = (env.S3_BUCKET ?? "").trim();
  const endpoint = (env.S3_ENDPOINT ?? "").trim();
  const accessKeyId = (env.S3_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (env.S3_SECRET_ACCESS_KEY ?? "").trim();
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    // R2 không phân vùng theo khu vực nên dùng "auto"; S3 thì phải đúng khu vực của bucket
    region: (env.S3_REGION ?? "auto").trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    // Mặc định BẬT: R2 và MinIO đều cần; S3 thật cũng chấp nhận
    pathStyle: env.S3_FORCE_PATH_STYLE !== "0",
  };
}

/** Thiếu biến nào — để trang Vận hành nói đúng chỗ còn thiếu thay vì chỉ báo "chưa cấu hình" */
export function thieuBienS3(env: Record<string, string | undefined>): string[] {
  return (["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const)
    .filter((k) => !(env[k] ?? "").trim());
}

function kiemKhoa(key: string) {
  if (!isSafeObjectKey(key)) throw new Error("Khoá lưu trữ không hợp lệ");
}

/** Lỗi kho tệp luôn nói rõ thao tác + mã HTTP; S3 hay trả 403 trống rỗng khi ký sai */
async function nemLoi(thaoTac: string, key: string, res: Response): Promise<never> {
  const than = await res.text().catch(() => "");
  const chiTiet = /<Message>([^<]+)<\/Message>/.exec(than)?.[1] ?? than.slice(0, 200);
  throw new Error(`Kho tệp S3: ${thaoTac} "${key}" lỗi HTTP ${res.status}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

export function taoKhoS3(cfg: CauHinhS3): KhoTep {
  async function goi(method: "GET" | "PUT" | "DELETE", key: string, opts: { body?: Uint8Array; query?: Record<string, string>; contentType?: string } = {}) {
    const { url, headers } = kyYeuCau(cfg, method, key, opts);
    return fetch(url, { method, headers, body: opts.body ? Buffer.from(opts.body) : undefined });
  }

  /** Liệt kê mọi khoá bắt đầu bằng `prefix`, đi hết các trang nối tiếp */
  async function lietKe(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const query: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
      if (token) query["continuation-token"] = token;
      const res = await goi("GET", "", { query });
      if (!res.ok) await nemLoi("liệt kê", prefix, res);
      const xml = await res.text();
      for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) out.push(giaiMaXml(m[1]!));
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
        : undefined;
    } while (token);
    return out;
  }

  return {
    ten: "s3",
    async dat(key, data, contentType) {
      kiemKhoa(key);
      const res = await goi("PUT", key, { body: data, contentType });
      if (!res.ok) await nemLoi("ghi", key, res);
    },
    async lay(key) {
      kiemKhoa(key);
      const res = await goi("GET", key);
      if (res.status === 404) return null;
      if (!res.ok) await nemLoi("đọc", key, res);
      return Buffer.from(await res.arrayBuffer());
    },
    async xoa(key) {
      kiemKhoa(key);
      const res = await goi("DELETE", key);
      // 204 xoá xong, 404 vốn đã không có — cả hai đều coi là đã xoá
      if (!res.ok && res.status !== 404) await nemLoi("xoá", key, res);
    },
    async xoaTheoTienTo(prefix) {
      kiemKhoa(prefix);
      const keys = await lietKe(prefix.endsWith("/") ? prefix : `${prefix}/`);
      for (let i = 0; i < keys.length; i += XOA_SONG_SONG) {
        await Promise.all(keys.slice(i, i + XOA_SONG_SONG).map(async (k) => {
          const res = await goi("DELETE", k);
          if (!res.ok && res.status !== 404) await nemLoi("xoá", k, res);
        }));
      }
    },
    async kiemTra() {
      // Liệt kê một khoá là đủ để biết endpoint, khoá truy cập và quyền đọc có đúng không,
      // mà không ghi gì vào bucket của khách.
      const res = await goi("GET", "", { query: { "list-type": "2", "max-keys": "1" } });
      if (!res.ok) await nemLoi("kiểm tra kết nối", cfg.bucket, res);
    },
  };
}

function giaiMaXml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
