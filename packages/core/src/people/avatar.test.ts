import test from "node:test";
import assert from "node:assert/strict";
import { avatarFormatError, stripJpegMetadata, avatarInitial, avatarTone, avatarObjectKey, STUDENT_AVATAR_MAX } from "./avatar.js";

const jpeg = (...segs: number[][]) => new Uint8Array([0xff, 0xd8, ...segs.flat(), 0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0xaa, 0xbb, 0xff, 0xd9]);
const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];

test("ảnh đại diện: kiểm định dạng theo nội dung, không tin type", () => {
  assert.equal(avatarFormatError("image/jpeg", jpeg()), null);
  assert.equal(avatarFormatError("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), null);
  assert.equal(avatarFormatError("image/webp", new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), null);
  assert.match(avatarFormatError("image/svg+xml", new TextEncoder().encode("<svg/>"))!, /JPG, PNG hoặc WEBP/);
  assert.match(avatarFormatError("image/png", jpeg())!, /không phải ảnh PNG/);
  assert.match(avatarFormatError("image/jpeg", new Uint8Array(0))!, /rỗng/);
  assert.match(avatarFormatError("image/jpeg", new Uint8Array(STUDENT_AVATAR_MAX + 1).fill(0xff))!, /2MB/);
});

test("ảnh đại diện: bóc EXIF / IPTC / chú thích, giữ JFIF, ICC và dữ liệu ảnh", () => {
  const app0 = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]);
  const exif = seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3]);
  const icc = seg(0xe2, [9, 9]);
  const com = seg(0xfe, [0x68, 0x69]);
  const src = jpeg(app0, exif, icc, com);
  const out = stripJpegMetadata(src);
  assert.deepEqual(Array.from(out), Array.from(jpeg(app0, icc)));
  // không phải JPEG / hỏng cấu trúc → giữ nguyên
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(stripJpegMetadata(png), png);
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
  assert.equal(stripJpegMetadata(broken), broken);
});

test("ảnh giữ chỗ: chữ cái đầu của tên gọi, màu cố định trong bảng nhận diện", () => {
  assert.equal(avatarInitial({ fullName: "Nguyễn Minh Đức" }), "Đ");
  assert.equal(avatarInitial({ fullName: "Học viên mẫu 1", nickname: "bin" }), "B");
  assert.equal(avatarInitial({ fullName: "  " }), "?");
  const t = avatarTone("ONL-26-000001");
  assert.deepEqual(t, avatarTone("ONL-26-000001"));
  assert.ok(["#1D4ED8", "#10B981", "#F59E0B", "#0F172A"].includes(t.bg));
  assert.equal(avatarObjectKey("s1", "jpg", "n1"), "avatars/students/s1/n1.jpg");
});
