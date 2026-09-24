import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chuaDoc, chuaTraLoi, dinhTre, sanSang, nhanHoiThoai, validateTag, INBOX_VIEWS, INBOX_VIEW_VI, TAG_COLORS, TAG_COLOR_CLASS } from "./hopThu.js";

const T = (s: string) => new Date(s);
const NOW = T("2026-09-24T10:00:00Z");

describe("hộp thư — bốn ô đếm", () => {
  it("chưa đọc: khách nhắn sau lần cuối có người mở", () => {
    assert.equal(chuaDoc({ lastInboundAt: T("2026-09-24T09:50:00Z"), staffSeenAt: T("2026-09-24T09:40:00Z") }), true);
    assert.equal(chuaDoc({ lastInboundAt: T("2026-09-24T09:30:00Z"), staffSeenAt: T("2026-09-24T09:40:00Z") }), false);
    // chưa ai mở lần nào mà khách đã nhắn -> vẫn là chưa đọc
    assert.equal(chuaDoc({ lastInboundAt: T("2026-09-24T09:50:00Z"), staffSeenAt: null }), true);
    // khách chưa nhắn gì (hội thoại do trung tâm mở) -> không tính
    assert.equal(chuaDoc({ lastInboundAt: null, staffSeenAt: null }), false);
  });

  it("chưa trả lời: tin cuối là của khách", () => {
    assert.equal(chuaTraLoi({ lastInboundAt: T("2026-09-24T09:50:00Z"), lastOutboundAt: T("2026-09-24T09:00:00Z"), status: "open" }), true);
    assert.equal(chuaTraLoi({ lastInboundAt: T("2026-09-24T09:00:00Z"), lastOutboundAt: T("2026-09-24T09:50:00Z"), status: "open" }), false);
    assert.equal(chuaTraLoi({ lastInboundAt: T("2026-09-24T09:50:00Z"), lastOutboundAt: null, status: "open" }), true);
    // hội thoại đã đóng thì không còn nợ ai
    assert.equal(chuaTraLoi({ lastInboundAt: T("2026-09-24T09:50:00Z"), lastOutboundAt: null, status: "closed" }), false);
  });

  it("đình trệ: chờ quá chỉ tiêu", () => {
    assert.equal(dinhTre(T("2026-09-24T09:30:00Z"), NOW, 60), false);
    assert.equal(dinhTre(T("2026-09-24T08:30:00Z"), NOW, 60), true);
    assert.equal(dinhTre(null, NOW, 60), false);
  });

  it("sẵn sàng: đã trả lời, chờ khách", () => {
    assert.equal(sanSang({ lastInboundAt: T("2026-09-24T09:00:00Z"), lastOutboundAt: T("2026-09-24T09:50:00Z"), status: "pending" }), true);
    assert.equal(sanSang({ lastInboundAt: T("2026-09-24T09:50:00Z"), lastOutboundAt: T("2026-09-24T09:00:00Z"), status: "open" }), false);
    assert.equal(sanSang({ lastInboundAt: null, lastOutboundAt: null, status: "open" }), false);
  });

  it("một hội thoại chỉ mang một nhãn, ưu tiên việc gấp nhất", () => {
    const quaHan = { lastInboundAt: T("2026-09-24T08:00:00Z"), lastOutboundAt: null, staffSeenAt: null, waitingSince: T("2026-09-24T08:00:00Z"), status: "open" };
    assert.equal(nhanHoiThoai(quaHan, NOW, 60).key, "dinh_tre");
    assert.equal(nhanHoiThoai(quaHan, NOW, 60).gap, true);

    const moiToi = { lastInboundAt: T("2026-09-24T09:55:00Z"), lastOutboundAt: null, staffSeenAt: null, waitingSince: T("2026-09-24T09:55:00Z"), status: "open" };
    assert.equal(nhanHoiThoai(moiToi, NOW, 60).key, "chua_doc");

    const daDocChuaRep = { lastInboundAt: T("2026-09-24T09:55:00Z"), lastOutboundAt: null, staffSeenAt: T("2026-09-24T09:56:00Z"), waitingSince: T("2026-09-24T09:55:00Z"), status: "open" };
    assert.equal(nhanHoiThoai(daDocChuaRep, NOW, 60).key, "chua_tra_loi");

    const choKhach = { lastInboundAt: T("2026-09-24T09:00:00Z"), lastOutboundAt: T("2026-09-24T09:30:00Z"), staffSeenAt: T("2026-09-24T09:30:00Z"), waitingSince: null, status: "pending" };
    assert.equal(nhanHoiThoai(choKhach, NOW, 60).key, "san_sang");
    assert.equal(nhanHoiThoai(choKhach, NOW, 60).gap, false);
  });
});

describe("nhãn hội thoại", () => {
  it("mọi ô đếm đều có nhãn tiếng Việt", () => {
    for (const v of INBOX_VIEWS) assert.ok(INBOX_VIEW_VI[v]?.length > 0, v);
  });

  it("mọi màu đều có lớp CSS", () => {
    for (const c of TAG_COLORS) assert.ok(TAG_COLOR_CLASS[c]?.includes("bg-"), c);
  });

  it("tên nhãn quá ngắn hoặc quá dài đều bị chặn", () => {
    assert.deepEqual(validateTag("Chờ báo giá"), []);
    assert.equal(validateTag(" a ").length, 1);
    assert.equal(validateTag("x".repeat(41)).length, 1);
  });
});
