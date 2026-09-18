import test from "node:test";
import assert from "node:assert/strict";
import {
  sniffImage, looksExecutable, checkImageUpload, checkSubmissionFile, safeStoredFileName, isSafeObjectKey, isPdf,
} from "./upload.js";

const bytes = (...n: number[]) => Uint8Array.from(n);
const text = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));
const pad = (head: Uint8Array, len = 64) => {
  const out = new Uint8Array(len);
  out.set(head);
  return out;
};

const PNG = pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const JPG = pad(bytes(0xff, 0xd8, 0xff, 0xe0));
const WEBP = (() => {
  const b = new Uint8Array(64);
  b.set(text("RIFF"), 0);
  b.set(text("WEBP"), 8);
  return b;
})();
const GIF = pad(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61));
const PDF = pad(text("%PDF-1.7\n"));

test("nhận dạng ảnh theo magic bytes", () => {
  assert.equal(sniffImage(PNG), "png");
  assert.equal(sniffImage(JPG), "jpg");
  assert.equal(sniffImage(WEBP), "webp");
  assert.equal(sniffImage(GIF), "gif");
  assert.equal(sniffImage(text("<svg xmlns=...")), null);
  assert.equal(sniffImage(new Uint8Array(0)), null);
});

test("phát hiện nội dung chạy được trong trình duyệt", () => {
  assert.equal(looksExecutable(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), true);
  assert.equal(looksExecutable(text("<!DOCTYPE html><html><body>xin chao")), true);
  assert.equal(looksExecutable(text("<html>")), true);
  assert.equal(looksExecutable(text('<?xml version="1.0"?><svg/>')), true);
  // khoảng trắng / BOM đứng trước không giúp lách
  assert.equal(looksExecutable(text("   \n\t<svg>")), true);
  assert.equal(looksExecutable(Uint8Array.from([0xef, 0xbb, 0xbf, ...text("<svg>")])), true);
  // script nằm sâu trong 1KB đầu vẫn bị bắt
  assert.equal(looksExecutable(text(" ".repeat(200) + "<script>alert(1)</script>")), true);
  assert.equal(looksExecutable(PNG), false);
  assert.equal(looksExecutable(PDF), false);
});

test("ảnh lớp: MIME khai báo phải khớp nội dung thật", () => {
  const allowed = ["image/jpeg", "image/png", "image/webp"] as const;
  const max = 10 * 1024 * 1024;
  assert.equal(checkImageUpload({ mime: "image/png", bytes: PNG, maxBytes: max, allowedMimes: allowed }).ok, true);
  assert.equal(checkImageUpload({ mime: "image/jpeg", bytes: JPG, maxBytes: max, allowedMimes: allowed }).ok, true);
  assert.equal(checkImageUpload({ mime: "image/webp", bytes: WEBP, maxBytes: max, allowedMimes: allowed }).ok, true);

  // Đây là lỗ hổng cũ: gửi SVG nhưng khai là PNG
  const svgAsPng = checkImageUpload({ mime: "image/png", bytes: text('<svg onload="alert(1)"/>'), maxBytes: max, allowedMimes: allowed });
  assert.equal(svgAsPng.ok, false);
  assert.match(svgAsPng.error!, /mã kịch bản|không khớp/);

  // JPG khai là PNG cũng bị từ chối
  assert.equal(checkImageUpload({ mime: "image/png", bytes: JPG, maxBytes: max, allowedMimes: allowed }).ok, false);
  // MIME ngoài danh sách
  assert.equal(checkImageUpload({ mime: "image/svg+xml", bytes: PNG, maxBytes: max, allowedMimes: allowed }).ok, false);
  assert.equal(checkImageUpload({ mime: "image/gif", bytes: GIF, maxBytes: max, allowedMimes: allowed }).ok, false);
  // Tham số MIME kèm charset vẫn nhận
  assert.equal(checkImageUpload({ mime: "image/png; charset=binary", bytes: PNG, maxBytes: max, allowedMimes: allowed }).ok, true);
  // Kích thước
  assert.equal(checkImageUpload({ mime: "image/png", bytes: PNG, maxBytes: 10, allowedMimes: allowed }).ok, false);
  assert.equal(checkImageUpload({ mime: "image/png", bytes: new Uint8Array(0), maxBytes: max, allowedMimes: allowed }).ok, false);
});

test("bài nộp: nhận ảnh và PDF thật, từ chối tệp giả dạng", () => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
  const max = 10 * 1024 * 1024;
  assert.equal(checkSubmissionFile({ mime: "application/pdf", bytes: PDF, maxBytes: max, allowedMimes: allowed }).ok, true);
  assert.equal(checkSubmissionFile({ mime: "image/png", bytes: PNG, maxBytes: max, allowedMimes: allowed }).ok, true);
  // HTML khai là PDF
  assert.equal(checkSubmissionFile({ mime: "application/pdf", bytes: text("<html><script>x</script>"), maxBytes: max, allowedMimes: allowed }).ok, false);
  // PDF thật nhưng khai là ảnh
  assert.equal(checkSubmissionFile({ mime: "image/png", bytes: PDF, maxBytes: max, allowedMimes: allowed }).ok, false);
  // Kiểu ngoài danh sách
  assert.equal(checkSubmissionFile({ mime: "text/html", bytes: PDF, maxBytes: max, allowedMimes: allowed }).ok, false);
  assert.equal(isPdf(PDF), true);
  assert.equal(isPdf(PNG), false);
});

test("tên tệp lưu trữ không cho đi ngược thư mục", () => {
  assert.equal(safeStoredFileName("../../etc/passwd"), "passwd");
  assert.equal(safeStoredFileName("..\\..\\windows\\system32\\cmd.exe"), "cmd.exe");
  const vn = safeStoredFileName("bai nộp của bé.png");
  assert.match(vn, /^[A-Za-z0-9._-]+$/, "chỉ còn ký tự an toàn");
  assert.ok(vn.endsWith(".png"), "giữ phần mở rộng");
  assert.ok(!vn.includes("/") && !vn.includes(".."));
  assert.equal(safeStoredFileName(""), "tep-tai-len");
  assert.equal(safeStoredFileName("...."), "tep-tai-len");
  // Có dấu "/" thì chỉ phần sau cùng được giữ — phần chèn lệnh bị bỏ hẳn
  assert.equal(safeStoredFileName('x";rm -rf /.png'), "png");
  assert.ok(safeStoredFileName("a".repeat(500)).length <= 100);
  // Không còn xuống dòng để chèn header vào Content-Disposition
  const injected = safeStoredFileName('a\r\nContent-Type: text/html');
  assert.ok(!/[\r\n:"]/.test(injected), `còn ký tự nguy hiểm trong "${injected}"`);
  assert.equal(safeStoredFileName('anh\r\nX-Injected: 1.png'), "anhX-Injected-1.png");
});

test("khoá lưu trữ hợp lệ", () => {
  assert.equal(isSafeObjectKey("classes/abc/def/1.png"), true);
  assert.equal(isSafeObjectKey("docs/dsr/x-1_2.json"), true);
  assert.equal(isSafeObjectKey("../../../etc/passwd"), false);
  assert.equal(isSafeObjectKey("a/../../b"), false);
  assert.equal(isSafeObjectKey("/etc/passwd"), false);
  assert.equal(isSafeObjectKey("a//b"), false);
  assert.equal(isSafeObjectKey("a/./b"), false);
  assert.equal(isSafeObjectKey("a b/c.png"), false);
  assert.equal(isSafeObjectKey(""), false);
  assert.equal(isSafeObjectKey("x".repeat(600)), false);
});
