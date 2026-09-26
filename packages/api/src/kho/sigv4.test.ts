import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kyYeuCau, type CauHinhS3 } from "./sigv4.js";

/**
 * Ký sai thì S3 chỉ trả **403 không kèm lý do**, nên những bài dưới đây chốt từng chi tiết
 * mà người viết tay hay sai: thứ tự tham số truy vấn, băm nội dung rỗng cho GET/DELETE,
 * mã hoá dấu `/` trong khoá, và đúng khu vực trong phạm vi chữ ký.
 */
const NOW = new Date("2026-09-26T10:20:30.000Z");
const R2: CauHinhS3 = {
  endpoint: "https://tk.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "satarobo",
  accessKeyId: "AKIAKIEMTHU",
  secretAccessKey: "bi-mat-kiem-thu",
  pathStyle: true,
};
const HASH_RONG = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("ký yêu cầu S3", () => {
  it("dựng đúng URL kiểu path-style", () => {
    const r = kyYeuCau(R2, "GET", "media/2026/anh.jpg", { now: NOW });
    assert.equal(r.url, "https://tk.r2.cloudflarestorage.com/satarobo/media/2026/anh.jpg");
  });

  it("kiểu virtual-host thì bucket nằm trong tên miền", () => {
    const r = kyYeuCau({ ...R2, pathStyle: false }, "GET", "media/anh.jpg", { now: NOW });
    assert.equal(r.url, "https://tk.r2.cloudflarestorage.com/media/anh.jpg");
    assert.equal(r.headers.host, "satarobo.tk.r2.cloudflarestorage.com");
  });

  it("GET và DELETE dùng băm của nội dung rỗng", () => {
    for (const m of ["GET", "DELETE"] as const) {
      assert.equal(kyYeuCau(R2, m, "a/b.txt", { now: NOW }).headers["x-amz-content-sha256"], HASH_RONG);
    }
  });

  it("PUT dùng băm của chính nội dung — đổi một byte là đổi chữ ký", () => {
    const a = kyYeuCau(R2, "PUT", "a/b.txt", { body: new TextEncoder().encode("xin chao"), now: NOW });
    const b = kyYeuCau(R2, "PUT", "a/b.txt", { body: new TextEncoder().encode("xin chau"), now: NOW });
    assert.notEqual(a.headers["x-amz-content-sha256"], HASH_RONG);
    assert.notEqual(a.headers["x-amz-content-sha256"], b.headers["x-amz-content-sha256"]);
    assert.notEqual(a.headers.authorization, b.headers.authorization);
  });

  it("dấu / trong khoá giữ nguyên, ký tự lạ thì mã hoá", () => {
    const r = kyYeuCau(R2, "GET", "scorm/abc def/v1/index.html", { now: NOW });
    assert.ok(r.url.endsWith("/scorm/abc%20def/v1/index.html"), r.url);
  });

  it("tham số truy vấn luôn xếp theo tên, dù truyền vào theo thứ tự nào", () => {
    const a = kyYeuCau(R2, "GET", "", { query: { prefix: "scorm/", "list-type": "2" }, now: NOW });
    const b = kyYeuCau(R2, "GET", "", { query: { "list-type": "2", prefix: "scorm/" }, now: NOW });
    assert.equal(a.url, b.url);
    assert.equal(a.headers.authorization, b.headers.authorization);
    assert.ok(a.url.includes("list-type=2&prefix=scorm%2F"), a.url);
  });

  it("phạm vi chữ ký mang đúng ngày, khu vực và dịch vụ", () => {
    const r = kyYeuCau(R2, "GET", "a.txt", { now: NOW });
    assert.equal(r.headers["x-amz-date"], "20260926T102030Z");
    assert.ok(r.headers.authorization.includes("Credential=AKIAKIEMTHU/20260926/auto/s3/aws4_request"), r.headers.authorization);
    assert.ok(r.headers.authorization.startsWith("AWS4-HMAC-SHA256 "));
  });

  it("đổi khu vực thì chữ ký khác — sai khu vực là 403", () => {
    const a = kyYeuCau(R2, "GET", "a.txt", { now: NOW });
    const b = kyYeuCau({ ...R2, region: "ap-southeast-1" }, "GET", "a.txt", { now: NOW });
    assert.notEqual(a.headers.authorization, b.headers.authorization);
  });

  it("có content-type thì phải nằm trong SignedHeaders", () => {
    const r = kyYeuCau(R2, "PUT", "a.jpg", { body: new Uint8Array([1]), contentType: "image/jpeg", now: NOW });
    assert.match(r.headers.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
    assert.equal(r.headers["content-type"], "image/jpeg");
  });

  it("không có content-type thì SignedHeaders không được nhắc tới nó", () => {
    const r = kyYeuCau(R2, "GET", "a.jpg", { now: NOW });
    assert.match(r.headers.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
  });

  it("chữ ký là hex 64 ký tự", () => {
    const sig = /Signature=([0-9a-f]+)$/.exec(kyYeuCau(R2, "GET", "a.txt", { now: NOW }).headers.authorization)?.[1];
    assert.equal(sig?.length, 64);
  });

  it("đổi khoá bí mật thì chữ ký đổi theo", () => {
    const a = kyYeuCau(R2, "GET", "a.txt", { now: NOW });
    const b = kyYeuCau({ ...R2, secretAccessKey: "bi-mat-khac" }, "GET", "a.txt", { now: NOW });
    assert.notEqual(a.headers.authorization, b.headers.authorization);
  });
});
