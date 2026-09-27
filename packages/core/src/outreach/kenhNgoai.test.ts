import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docSuKienZcrm, duDeGhiTin, conLaiTrongNgay, nickImLang, HAN_MUC_NICK_NGAY, khoaHoiThoai, timHoiThoaiZcrm, thanGuiZcrm, docLichHenZcrm } from "./kenhNgoai.js";

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

/*
 * Hình dạng THẬT của ZCRM v3.4 (đọc từ mã nguồn công khai, `message-handler.ts` + `webhook-service.ts`):
 *   { event, timestamp, data: { messageId, conversationId, senderUid, content, contentType, sentAt } }
 * Bản đọc cũ đoán tên trường nên bỏ sót `senderUid` — mọi tin thật đều bị coi là "không đủ dữ liệu".
 */
describe("ZCRM v3.4 — payload thật", () => {
  const tinDen = {
    event: "message.received",
    timestamp: "2026-09-27T08:00:01.000Z",
    data: { messageId: "b1f0c2d4-0000-4000-8000-000000000001", conversationId: "c0nv-0000-4000-8000-000000000001", senderUid: "7712345678901234567", content: "Cho em hỏi lớp robot thứ 7", contentType: "text", sentAt: "2026-09-27T08:00:00.000Z" },
  };

  it("tin khách: đọc được người gửi, hội thoại, nội dung", () => {
    const s = docSuKienZcrm(tinDen, BAY_GIO)!;
    assert.equal(s.loai, "tin_den");
    assert.equal(s.nguoiId, "7712345678901234567");
    assert.equal(s.hoiThoaiId, "c0nv-0000-4000-8000-000000000001");
    assert.equal(s.tinId, "b1f0c2d4-0000-4000-8000-000000000001");
    assert.equal(s.luc.toISOString(), "2026-09-27T08:00:00.000Z");
    assert.equal(duDeGhiTin(s), true);
  });

  it("tin nhân viên gửi đi: gom theo HỘI THOẠI, không theo người gửi (người gửi là chính nick)", () => {
    const s = docSuKienZcrm({ ...tinDen, event: "message.sent", data: { ...tinDen.data, senderUid: "uid-cua-nick", content: "Dạ có ạ" } }, BAY_GIO)!;
    assert.equal(s.loai, "tin_di");
    assert.equal(khoaHoiThoai(s), "c0nv-0000-4000-8000-000000000001");
  });

  it("tên sự kiện lấy được từ header X-Webhook-Event khi thân không có", () => {
    const { event: _bo, ...khongTen } = tinDen;
    assert.equal(docSuKienZcrm(khongTen, BAY_GIO, "message.received")?.loai, "tin_den");
  });

  it("tin ảnh: nội dung là URL → thành tệp đính kèm + nhãn", () => {
    const s = docSuKienZcrm({ ...tinDen, data: { ...tinDen.data, contentType: "image", content: "https://minio.example/zalo-image.jpg" } }, BAY_GIO)!;
    assert.equal(s.noiDung, "[Hình ảnh]");
    assert.deepEqual(s.tepDinhKem, [{ type: "image", url: "https://minio.example/zalo-image.jpg" }]);
  });

  it("sự kiện nick: accountId là mã nick trong ZCRM", () => {
    assert.equal(docSuKienZcrm({ event: "zalo.disconnected", data: { accountId: "nick-uuid" } }, BAY_GIO)?.nickId, "nick-uuid");
  });

  it("tìm hội thoại trong danh sách API công khai để lấy tên, SĐT, mã luồng", () => {
    const json = { conversations: [
      { id: "khac", threadType: "user", externalThreadId: "1", contact: { id: "k1", fullName: "Người khác", phone: null } },
      { id: "c0nv-1", threadType: "user", externalThreadId: "7712345678901234567", contact: { id: "ct-1", fullName: "Chị Lan", phone: "0901234567" } },
    ] };
    assert.deepEqual(timHoiThoaiZcrm(json, "c0nv-1"), { id: "c0nv-1", threadId: "7712345678901234567", loaiLuong: "user", nickId: null, lienHeId: "ct-1", ten: "Chị Lan", sdt: "84901234567" });
    assert.equal(timHoiThoaiZcrm(json, "khong-co"), null);
    assert.equal(timHoiThoaiZcrm({ loi: 1 }, "c0nv-1"), null);
  });

  it("nhận ra hội thoại nhóm (không đưa tin nhóm lớp vào hệ thống)", () => {
    const json = { conversations: [{ id: "g1", threadType: "group", externalThreadId: "nhom-1", contact: null, groupName: "Lớp Robot 3A" }] };
    assert.equal(timHoiThoaiZcrm(json, "g1")?.loaiLuong, "group");
  });

  it("thân gửi tin đúng bốn trường ZCRM đòi", () => {
    assert.deepEqual(thanGuiZcrm({ nickId: "n1", threadId: "t1", noiDung: "Dạ" }), { zaloAccountId: "n1", threadId: "t1", content: "Dạ", threadType: "user" });
  });

  it("lịch hẹn ZCRM → lịch hẹn LMS: ghép ngày + giờ Việt Nam, đổi loại và trạng thái", () => {
    const h = docLichHenZcrm({ id: "a1", appointmentDate: "2026-09-30T00:00:00.000Z", appointmentTime: "19:30", type: "call", status: "scheduled", notes: "Gọi lại tư vấn", contact: { id: "ct", fullName: "Chị Lan", phone: "0901234567" } })!;
    assert.equal(h.luc.toISOString(), "2026-09-30T12:30:00.000Z");
    assert.equal(h.loai, "goi_lai");
    assert.equal(h.trangThai, "dat");
    assert.equal(h.sdt, "84901234567");
    assert.match(h.tieuDe, /Chị Lan/);
    assert.equal(docLichHenZcrm({ id: "a2", appointmentDate: "2026-09-30T00:00:00.000Z", type: "meeting", status: "no_show" })!.trangThai, "vang");
    assert.equal(docLichHenZcrm({ id: "a3" }), null);
  });
});
