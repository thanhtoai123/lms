import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docSuKienZaloOa } from "./zaloOa.js";

const BAY_GIO = new Date("2026-09-24T10:00:00.000Z");
const TS = "1790244000000"; // 2026-09-24T10:00:00Z

describe("docSuKienZaloOa", () => {
  it("tin khách nhắn tới OA", () => {
    const s = docSuKienZaloOa({ event_name: "user_send_text", sender: { id: "u1" }, message: { msg_id: "m1", text: "Chào trung tâm" }, timestamp: TS }, BAY_GIO);
    assert.equal(s?.loai, "tin_den");
    assert.equal(s?.nguoiId, "u1");
    assert.equal(s?.tinId, "m1");
    assert.equal(s?.noiDung, "Chào trung tâm");
    assert.equal(s?.luc.toISOString(), "2026-09-24T10:00:00.000Z");
  });

  it("tin ảnh không có text thì ghi loại tin thay vì để trống", () => {
    const s = docSuKienZaloOa({ event_name: "user_send_image", sender: { id: "u1" }, message: { msg_id: "m2" }, timestamp: TS }, BAY_GIO);
    assert.equal(s?.noiDung, "[image]");
  });

  it("quan tâm / bỏ quan tâm OA", () => {
    assert.equal(docSuKienZaloOa({ event_name: "follow", follower: { id: "u9" }, timestamp: TS }, BAY_GIO)?.loai, "quan_tam");
    assert.equal(docSuKienZaloOa({ event_name: "follow", follower: { id: "u9" }, timestamp: TS }, BAY_GIO)?.nguoiId, "u9");
    assert.equal(docSuKienZaloOa({ event_name: "unfollow", follower: { id: "u9" }, timestamp: TS }, BAY_GIO)?.loai, "bo_quan_tam");
  });

  it("khách tự chia sẻ tên + SĐT (JSON trong message.text)", () => {
    const s = docSuKienZaloOa({
      event_name: "user_submit_info", sender: { id: "u3" },
      message: { msg_id: "m3", text: '{"name":"Chị Lan","phone":"0912345678"}' }, timestamp: TS,
    }, BAY_GIO);
    assert.equal(s?.loai, "gui_thong_tin");
    assert.equal(s?.ten, "Chị Lan");
    assert.equal(s?.sdt, "84912345678");
  });

  it("khách tự chia sẻ — dạng trải thẳng ở info", () => {
    const s = docSuKienZaloOa({ event_name: "user_submit_info", sender: { id: "u4" }, info: { name: "Anh Minh", phone: "84987654321" }, timestamp: TS }, BAY_GIO);
    assert.equal(s?.ten, "Anh Minh");
    assert.equal(s?.sdt, "84987654321");
  });

  it("text không phải JSON thì không nổ, chỉ là không có thông tin", () => {
    const s = docSuKienZaloOa({ event_name: "user_submit_info", sender: { id: "u5" }, message: { msg_id: "m5", text: "{hỏng" }, timestamp: TS }, BAY_GIO);
    assert.equal(s?.loai, "gui_thong_tin");
    assert.equal(s?.ten, null);
    assert.equal(s?.sdt, null);
  });

  it("ZNS đã tới máy khách", () => {
    const s = docSuKienZaloOa({ event_name: "user_received_message", recipient: { id: "u6" }, message: { msg_id: "zns-1" }, timestamp: TS }, BAY_GIO);
    assert.equal(s?.loai, "da_nhan_zns");
    assert.equal(s?.znsTinId, "zns-1");
  });

  it("sự kiện lạ và payload hỏng", () => {
    assert.equal(docSuKienZaloOa({ event_name: "oa_send_text", timestamp: TS }, BAY_GIO)?.loai, "bo_qua");
    assert.equal(docSuKienZaloOa({ event_name: "user_send_text", sender: {}, message: {} }, BAY_GIO)?.loai, "bo_qua");
    assert.equal(docSuKienZaloOa("chuỗi"), null);
  });

  it("thiếu timestamp thì lấy lúc nhận", () => {
    const s = docSuKienZaloOa({ event_name: "follow", follower: { id: "u9" } }, BAY_GIO);
    assert.equal(s?.luc.getTime(), BAY_GIO.getTime());
    assert.equal(s?.timestamp, null);
  });
});
