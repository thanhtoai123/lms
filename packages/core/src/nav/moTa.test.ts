import { test } from "node:test";
import assert from "node:assert/strict";
import { tachMoTa } from "./moTa.js";

test("mô tả ngắn: giữ nguyên, không có phần thêm", () => {
  assert.deepEqual(tachMoTa("Xếp ca theo tháng."), { lead: "Xếp ca theo tháng.", rest: null });
  assert.deepEqual(tachMoTa(""), { lead: "", rest: null });
  assert.deepEqual(tachMoTa(undefined), { lead: "", rest: null });
});

test("mô tả dài: câu đầu lên dòng mô tả, phần còn lại vào Cách dùng", () => {
  const d = "Chiếu mã này tại quầy để nhân sự quét bằng camera điện thoại. Mã cố định — ảnh chụp vẫn quét được, nhưng quét ngoài bán kính điểm chấm công sẽ bị từ chối. TV rớt mạng vẫn giữ mã cuối.";
  const r = tachMoTa(d);
  assert.equal(r.lead, "Chiếu mã này tại quầy để nhân sự quét bằng camera điện thoại.");
  assert.ok(r.rest!.startsWith("Mã cố định"));
});

test("câu đầu quá dài: cắt ở vế đầu, không mất chữ", () => {
  const d = "Theo dõi hồ sơ theo CHUẨN THÔNG TIN bằng tỷ lệ đạt chuẩn — không cần đọc từng phiếu: phiếu đủ trường bắt buộc, hoàn thiện đúng hạn, học bạ mốc đúng lịch, đủ bằng chứng. Dòng dưới 90% tô cảnh báo.";
  const r = tachMoTa(d);
  assert.ok(r.lead.length <= 111, r.lead);
  assert.ok(r.lead.startsWith("Theo dõi hồ sơ"));
  const words = (s: string) => s.toLowerCase().replace(/[—:;,.…]/g, " ").split(/\s+/).filter(Boolean);
  // Mọi từ của mô tả gốc vẫn còn (ở dòng đầu hoặc trong Cách dùng)
  assert.deepEqual(new Set(words(`${r.lead} ${r.rest}`)), new Set(words(d)));
});

test("không tách ở chữ viết tắt / trong ngoặc", () => {
  const d = "Tiền vào tài khoản (SePay hoặc sao kê) được tự khớp với đơn theo mã trong nội dung chuyển khoản (VD. SR123). Khoản không khớp nằm ở danh sách chờ để kế toán gán tay.";
  const r = tachMoTa(d);
  assert.ok(r.lead.endsWith("(VD. SR123).") || r.lead.includes("chuyển khoản"), r.lead);
  assert.ok(!r.lead.endsWith("(VD."), r.lead);
});
