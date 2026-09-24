import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateLichHen, henQuaHan, henSapToi, denGioNhac, nhanLichHen, sinhNhatTrongVong, APPOINTMENT_KINDS, APPOINTMENT_KIND_VI, APPOINTMENT_STATUSES, APPOINTMENT_STATUS_VI } from "./lichHen.js";

const NOW = new Date("2026-09-24T10:00:00Z");
const sau = (phut: number) => new Date(NOW.getTime() + phut * 60_000);

describe("lịch hẹn", () => {
  it("mọi loại và trạng thái đều có nhãn tiếng Việt", () => {
    for (const k of APPOINTMENT_KINDS) assert.ok(APPOINTMENT_KIND_VI[k]);
    for (const s of APPOINTMENT_STATUSES) assert.ok(APPOINTMENT_STATUS_VI[s]);
  });

  it("chặn nội dung rỗng, thời điểm hỏng, thời lượng vô lý", () => {
    assert.deepEqual(validateLichHen({ title: "Gọi lại chị Lan", at: sau(60), durationMin: 30 }), []);
    assert.equal(validateLichHen({ title: "a", at: sau(60) }).length, 1);
    assert.equal(validateLichHen({ title: "Gọi lại", at: "không phải ngày" }).length, 1);
    assert.equal(validateLichHen({ title: "Gọi lại", at: sau(60), durationMin: 1 }).length, 1);
    assert.equal(validateLichHen({ title: "Gọi lại", at: sau(60), durationMin: 600 }).length, 1);
  });

  it("quá hạn: qua giờ mà vẫn 'đã đặt'", () => {
    assert.equal(henQuaHan({ at: sau(-30), status: "dat" }, NOW), true);
    assert.equal(henQuaHan({ at: sau(30), status: "dat" }, NOW), false);
    // đã xử lý rồi thì không còn là quá hạn
    assert.equal(henQuaHan({ at: sau(-30), status: "xong" }, NOW), false);
    assert.equal(henQuaHan({ at: sau(-30), status: "huy" }, NOW), false);
  });

  it("sắp tới trong 24 giờ", () => {
    assert.equal(henSapToi({ at: sau(120), status: "dat" }, NOW), true);
    assert.equal(henSapToi({ at: sau(25 * 60), status: "dat" }, NOW), false);
    assert.equal(henSapToi({ at: sau(-10), status: "dat" }, NOW), false);
    assert.equal(henSapToi({ at: sau(120), status: "huy" }, NOW), false);
  });

  it("nhắc trước một giờ, chỉ nhắc một lần", () => {
    assert.equal(denGioNhac({ at: sau(30), status: "dat", remindedAt: null }, NOW), true);
    assert.equal(denGioNhac({ at: sau(120), status: "dat", remindedAt: null }, NOW), false);
    assert.equal(denGioNhac({ at: sau(30), status: "dat", remindedAt: sau(-5) }, NOW), false);
  });

  it("nhãn hiển thị ưu tiên việc gấp", () => {
    assert.equal(nhanLichHen({ at: sau(-30), status: "dat" }, NOW).key, "qua_han");
    assert.equal(nhanLichHen({ at: sau(-30), status: "dat" }, NOW).gap, true);
    assert.equal(nhanLichHen({ at: sau(60), status: "dat" }, NOW).key, "sap_toi");
    assert.equal(nhanLichHen({ at: sau(10 * 60), status: "dat" }, NOW).key, "hom_nay");
    assert.equal(nhanLichHen({ at: sau(48 * 60), status: "dat" }, NOW).key, "sau_nay");
    assert.equal(nhanLichHen({ at: sau(-30), status: "vang" }, NOW).label, "Khách không đến");
  });
});

describe("sinh nhật sắp tới", () => {
  it("đếm số ngày còn lại, bỏ qua năm sinh", () => {
    assert.equal(sinhNhatTrongVong("2018-09-24", NOW, 7), 0); // đúng hôm nay
    assert.equal(sinhNhatTrongVong("2018-09-27", NOW, 7), 3);
    assert.equal(sinhNhatTrongVong("2018-10-05", NOW, 7), null); // quá 7 ngày
  });

  it("qua giao thừa vẫn tính đúng", () => {
    const cuoiNam = new Date("2026-12-30T10:00:00Z");
    assert.equal(sinhNhatTrongVong("2015-01-02", cuoiNam, 7), 3);
  });

  it("không có ngày sinh hoặc ngày hỏng thì bỏ qua", () => {
    assert.equal(sinhNhatTrongVong(null, NOW, 7), null);
    assert.equal(sinhNhatTrongVong("không phải ngày", NOW, 7), null);
  });
});
