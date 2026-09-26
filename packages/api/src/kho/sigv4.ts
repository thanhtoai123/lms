/**
 * KÝ YÊU CẦU S3 (AWS Signature Version 4) — viết tay, không thêm thư viện.
 *
 * Vì sao không dùng `@aws-sdk/client-s3`: gói đó kéo theo vài chục megabyte phụ thuộc cho
 * đúng bốn thao tác (đặt, lấy, xoá, liệt kê). Phần ký chỉ là vài chục dòng HMAC, và viết
 * tay thì chạy được với **mọi kho tương thích S3** — Cloudflare R2, AWS S3, MinIO, hay kho
 * đối tượng của nhà cung cấp trong nước — mà không phải chờ SDK hỗ trợ.
 *
 * Tham chiếu: quy trình ký SigV4 của AWS (canonical request → string to sign → signing key).
 */
import { createHash, createHmac } from "node:crypto";

export interface CauHinhS3 {
  /** https://<tài khoản>.r2.cloudflarestorage.com · https://s3.ap-southeast-1.amazonaws.com · http://minio:9000 */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Đường dẫn kiểu `/<bucket>/<khoá>` thay vì `<bucket>.<host>/<khoá>` — R2 và MinIO cần cái này */
  pathStyle: boolean;
}

const sha256 = (x: string | Uint8Array) => createHash("sha256").update(x).digest("hex");
const hmac = (k: Buffer | string, x: string) => createHmac("sha256", k).update(x).digest();

/** Mã hoá từng đoạn đường dẫn theo đúng luật của AWS (dấu `/` giữ nguyên, `~` không mã hoá) */
function maHoaDuongDan(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export interface YeuCauDaKy {
  url: string;
  headers: Record<string, string>;
}

/**
 * Dựng URL và header đã ký cho một thao tác S3.
 *
 * `body` chỉ cần khi PUT. Tham số truy vấn phải **sắp theo tên** trong chuỗi chuẩn hoá —
 * sai thứ tự là chữ ký sai, và S3 chỉ trả 403 chứ không nói sai ở đâu.
 */
export function kyYeuCau(
  cfg: CauHinhS3,
  method: "GET" | "PUT" | "DELETE" | "HEAD",
  key: string,
  opts: { body?: Uint8Array; query?: Record<string, string>; contentType?: string; now?: Date } = {},
): YeuCauDaKy {
  const url = new URL(cfg.endpoint);
  const host = cfg.pathStyle ? url.host : `${cfg.bucket}.${url.host}`;
  const duongDan = cfg.pathStyle
    ? `/${cfg.bucket}${key ? `/${maHoaDuongDan(key)}` : ""}`
    : `/${maHoaDuongDan(key)}`;

  const now = opts.now ?? new Date();
  const amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ngay = amz.slice(0, 8);
  const payloadHash = sha256(opts.body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (opts.contentType) headers["content-type"] = opts.contentType;

  const tenHeader = Object.keys(headers).sort();
  const signedHeaders = tenHeader.join(";");
  const canonicalHeaders = tenHeader.map((h) => `${h}:${headers[h]!.trim()}\n`).join("");

  const q = opts.query ?? {};
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k]!)}`)
    .join("&");

  const canonical = [method, duongDan, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${ngay}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256(canonical)].join("\n");

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, ngay);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `${url.protocol}//${host}${duongDan}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    headers,
  };
}
