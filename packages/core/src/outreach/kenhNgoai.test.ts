import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docSuKienZcrm, duDeGhiTin, conLaiTrongNgay, nickImLang, HAN_MUC_NICK_NGAY } from "./kenhNgoai.js";

const BAY_GIO = new Date("2026-09-24T03:00:00.000Z");

describe("docSuKienZcrm — đọc webhook công cụ chat ngoài", () => {
  it("đọc tin khách gửi theo dạng { event, data }", () => {
    const s = docSuKienZcrm({
      event: "message.received",
      data: { zaloId: "1234567890", name: "Chị Lan", content: "Cho hỏi lớp robot lớp 3", messageId: "m-1", timestamp: 1758682800000 },
    }, BAY_GIO);
    assert.equal(s?.loai, "tin_den");
    assert.equal(s?.nguoiId, "1234567890");
    assert.equal(s?.tenHienThi, "Chị Lan");
    assert.equal(s?.tinId, "m-1");
    assert.equal(s?.noiDung, "Cho hỏi lớp robot lớp 3");
    assert.equal(duDeGhiTin(s!), true);
  });

  it("chấp nhận tên trường kiểu snake_case và tin lồng trong message", () => {
    const s = docSuKienZcrm({
      type: "message_received",
      payload: { thread_id: "999", contact: { name: "Anh Minh", phone: "0901234567" }, message: { id: "abc", text: "xin bảng giá" } },
    }, BAY_GIO);
    assert.equal(s?.nguoiId, "999");
    assert.equal(s?.tinId, "abc");
    assert.equal(s?.noiDung, "xin bảng giá");
    // SĐT được chuẩn hoá về 84… để khớp với hồ sơ phụ huynh
    assert.equal(s?.sdt, "84901234567");
  });

  it("thời điểm nhận cả giây lẫn mili-giây lẫn ISO", () => {
    const giay = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "a", text: "x", timestamp: 1758682800 } }, BAY_GIO);
    const mili = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "b", text: "x", timestamp: 1758682800000 } }, BAY_GIO);
    const iso = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "c", text: "x", createdAt: "2026-09-24T02:20:00.000Z" } }, BAY_GIO);
    assert.equal(giay!.luc.getTime(), 1758682800000);
    assert.equal(mili!.luc.getTime(), 1758682800000);
    assert.equal(iso!.luc.toISOString(), "2026-09-24T02:20:00.000Z");
  });

  it("thiếu thời điểm thì lấy lúc nhận, không để rỗng", () => {
    const s = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "a", text: "x" } }, BAY_GIO);
    assert.equal(s!.luc.getTime(), BAY_GIO.getTime());
  });

  it("tin chỉ có ảnh vẫn ghi được, tin rỗng hẳn thì không", () => {
    const anh = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "a", attachments: [{ type: "image", url: "https://x.test/a.jpg" }] } }, BAY_GIO);
    assert.equal(anh!.tepDinhKem.length, 1);
    assert.equal(duDeGhiTin(anh!), true);
    const rong = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "a" } }, BAY_GIO);
    assert.equal(duDeGhiTin(rong!), false);
  });

  it("bỏ tệp đính kèm không phải http(s) — không để công cụ ngoài chèn đường dẫn lạ", () => {
    const s = docSuKienZcrm({ event: "message.received", data: { zaloId: "1", id: "a", text: "x", attachments: [{ url: "javascript:alert(1)" }, { url: "https://ok.test/a.png" }] } }, BAY_GIO);
    assert.deepEqual(s!.tepDinhKem.map((t) => t.url), ["https://ok.test/a.png"]);
  });

  it("phân biệt tin nhân viên trả lời bên ngoài và khách mới", () => {
    assert.equal(docSuKienZcrm({ event: "message.sent", data: { zaloId: "1", id: "a", text: "dạ em gửi ạ" } }, BAY_GIO)?.loai, "tin_di");
    assert.equal(docSuKienZcrm({ event: "contact.created", data: { zaloId: "2", name: "Khách mới" } }, BAY_GIO)?.loai, "khach_moi");
    assert.equal(docSuKienZcrm({ event: "zalo.disconnected", data: { accountId: "nick-1" } }, BAY_GIO)?.loai, "mat_ket_noi");
  });

  it("sự kiện lạ thì bỏ qua chứ không nổ", () => {
    assert.equal(docSuKienZcrm({ event: "friend.request", data: {} }, BAY_GIO)?.loai, "bo_qua");
    assert.equal(docSuKienZcrm("không phải json object"), null);
    assert.equal(docSuKienZcrm(null), null);
  });
});

describe("hạn mức & sức khoẻ nick", () => {
  it("hạn mức mặc định thấp hơn trần của công cụ (200) cho an toàn", () => {
    assert.ok(HAN_MUC_NICK_NGAY < 200);
  });

  it("còn lại không bao giờ âm", () => {
    assert.equal(conLaiTrongNgay({ daGui: 10, hanMuc: 180 }), 170);
    assert.equal(conLaiTrongNgay({ daGui: 250, hanMuc: 180 }), 0);
  });

  it("quá 30 phút không tín hiệu coi như nick đã rụng", () => {
    assert.equal(nickImLang(new Date(BAY_GIO.getTime() - 10 * 60_000), BAY_GIO), false);
    assert.equal(nickImLang(new Date(BAY_GIO.getTime() - 31 * 60_000), BAY_GIO), true);
    assert.equal(nickImLang(null, BAY_GIO), true);
  });
});
