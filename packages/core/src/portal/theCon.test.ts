import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tomTatCon, tienVi, NGUONG_CHUYEN_CAN, type TinHieuCon } from "./theCon.js";

const goc: TinHieuCon = { buoiDaHoc: 0, buoiTong: 0, chuyenCanTong: 0, chuyenCanCoMat: 0, baiCho: 0, hocPhiConLai: 0 };
const o = (t: ReturnType<typeof tomTatCon>, khoa: "chuyen_can" | "bai_cho" | "hoc_phi") => t.o.find((x) => x.khoa === khoa)!;

describe("thẻ tóm tắt một con", () => {
  it("con mới, chưa có buổi nào: không chia cho 0 và KHÔNG báo chuyên cần 0%", () => {
    const t = tomTatCon(goc);
    assert.equal(t.tienDoPhanTram, null);
    assert.equal(t.tienDoNhan, null);
    assert.equal(o(t, "chuyen_can").giaTri, "—");
    assert.equal(o(t, "chuyen_can").muc, "chua_co");
  });

  it("đang học: hiện phần trăm và số buổi", () => {
    const t = tomTatCon({ ...goc, buoiDaHoc: 1, buoiTong: 48 });
    assert.equal(t.tienDoPhanTram, 2);
    assert.equal(t.tienDoNhan, "2% · 1/48");
  });

  it("học vượt số buổi ghi danh thì kẹp lại, không quá 100%", () => {
    const t = tomTatCon({ ...goc, buoiDaHoc: 50, buoiTong: 48 });
    assert.equal(t.tienDoPhanTram, 100);
    assert.equal(t.tienDoNhan, "100% · 48/48");
  });

  it("chuyên cần: đủ mốc thì ổn, dưới mốc thì cần chú ý", () => {
    const tot = tomTatCon({ ...goc, chuyenCanTong: 10, chuyenCanCoMat: 9 });
    assert.equal(o(tot, "chuyen_can").giaTri, "90%");
    assert.equal(o(tot, "chuyen_can").muc, "ok");
    const kem = tomTatCon({ ...goc, chuyenCanTong: 10, chuyenCanCoMat: 5 });
    assert.equal(o(kem, "chuyen_can").muc, "can_chu_y");
    const vuaDu = tomTatCon({ ...goc, chuyenCanTong: 100, chuyenCanCoMat: NGUONG_CHUYEN_CAN });
    assert.equal(o(vuaDu, "chuyen_can").muc, "ok");
  });

  it("học phí: hết nợ thì 'Đủ', còn nợ thì hiện đúng số tiền", () => {
    assert.equal(o(tomTatCon(goc), "hoc_phi").giaTri, "Đủ");
    assert.equal(o(tomTatCon(goc), "hoc_phi").muc, "ok");
    const no = tomTatCon({ ...goc, hocPhiConLai: 4_200_000 });
    assert.equal(o(no, "hoc_phi").giaTri, "4.200.000đ");
    assert.equal(o(no, "hoc_phi").muc, "can_chu_y");
  });

  it("bài chờ: không có thì nói 'Không có' chứ không để số 0 trơ ra", () => {
    assert.equal(o(tomTatCon(goc), "bai_cho").giaTri, "Không có");
    assert.equal(o(tomTatCon({ ...goc, baiCho: 3 }), "bai_cho").giaTri, "3");
    assert.equal(o(tomTatCon({ ...goc, baiCho: 3 }), "bai_cho").muc, "can_chu_y");
  });

  it("số liệu hỏng (âm) không làm vỡ thẻ", () => {
    const t = tomTatCon({ buoiDaHoc: -5, buoiTong: -1, chuyenCanTong: -2, chuyenCanCoMat: -3, baiCho: -1, hocPhiConLai: -100 });
    assert.equal(t.tienDoPhanTram, null);
    assert.equal(o(t, "chuyen_can").giaTri, "—");
    assert.equal(o(t, "bai_cho").giaTri, "Không có");
    assert.equal(o(t, "hoc_phi").giaTri, "Đủ");
  });

  it("có mặt nhiều hơn số buổi điểm danh thì kẹp về 100%", () => {
    assert.equal(o(tomTatCon({ ...goc, chuyenCanTong: 4, chuyenCanCoMat: 9 }), "chuyen_can").giaTri, "100%");
  });

  it("tiền hiển thị theo kiểu Việt Nam", () => {
    assert.equal(tienVi(1_000_000), "1.000.000đ");
    assert.equal(tienVi(0), "0đ");
  });
});
