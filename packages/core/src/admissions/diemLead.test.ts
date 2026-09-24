import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chamDiemLead, leadDinhTre, LEAD_TEMPS, LEAD_TEMP_VI, LEAD_TEMP_CHIP, NGUONG_NHIET, type TinHieuLead } from "./diemLead.js";

const NOW = new Date("2026-09-24T10:00:00Z");
const truoc = (ngay: number) => new Date(NOW.getTime() - ngay * 86_400_000);

const goc: TinHieuLead = {
  soTinKhachGui: 0, soLuotCham: 0, coSdt: false, soCuocHen: 0, daHocThu: false, daGhiDanh: false,
  tuongTacCuoi: NOW, taoLuc: truoc(1),
};

describe("chấm điểm lead", () => {
  it("mọi nhãn đều có tên tiếng Việt và màu", () => {
    for (const t of LEAD_TEMPS) {
      assert.ok(LEAD_TEMP_VI[t]);
      assert.ok(LEAD_TEMP_CHIP[t].includes("bg-"));
    }
  });

  it("khách nhắn nhiều + có SĐT + đã học thử thì nóng", () => {
    const r = chamDiemLead({ ...goc, soTinKhachGui: 6, coSdt: true, daHocThu: true, soCuocHen: 1 }, NOW);
    assert.ok(r.diem >= NGUONG_NHIET.nong, `điểm ${r.diem}`);
    assert.equal(r.temp, "nong");
    // có giải thích từng khoản
    assert.ok(r.lyDo.some((x) => x.khoan.includes("Có số điện thoại")));
    assert.ok(r.lyDo.some((x) => x.khoan.includes("học thử")));
  });

  it("một người nhắn rất nhiều vẫn không vượt trần điểm tin", () => {
    const it10 = chamDiemLead({ ...goc, soTinKhachGui: 5 }, NOW);
    const it50 = chamDiemLead({ ...goc, soTinKhachGui: 50 }, NOW);
    assert.equal(it50.diem - it10.diem, 0, "đã chạm trần nên không cộng thêm");
  });

  it("càng im lặng điểm càng tụt và đổi nhãn", () => {
    const hot = { ...goc, soTinKhachGui: 6, coSdt: true, daHocThu: true, soCuocHen: 1 };
    const moi = chamDiemLead(hot, NOW);
    const imLang10 = chamDiemLead({ ...hot, tuongTacCuoi: truoc(10) }, NOW);
    const imLang30 = chamDiemLead({ ...hot, tuongTacCuoi: truoc(30) }, NOW);
    const imLang60 = chamDiemLead({ ...hot, tuongTacCuoi: truoc(60) }, NOW);
    assert.ok(imLang10.diem < moi.diem);
    assert.equal(imLang10.temp, "nguoi");
    assert.equal(imLang30.temp, "rui_ro");
    assert.equal(imLang60.temp, "ngu_dong");
    assert.equal(imLang10.imLangNgay, 10);
  });

  it("đã ghi danh thì luôn là 'đã ghi danh', không còn xếp nhiệt bán hàng", () => {
    const r = chamDiemLead({ ...goc, daGhiDanh: true, tuongTacCuoi: truoc(90) }, NOW);
    assert.equal(r.temp, "vo_dich");
  });

  it("lead trơ trọi, chưa tương tác lần nào thì tụt dần theo tuổi, điểm không âm", () => {
    const moi = chamDiemLead({ ...goc, tuongTacCuoi: null, taoLuc: truoc(1) }, NOW);
    assert.equal(moi.temp, "lanh");
    const cu = chamDiemLead({ ...goc, tuongTacCuoi: null, taoLuc: truoc(40) }, NOW);
    assert.equal(cu.temp, "rui_ro");
    const raatCu = chamDiemLead({ ...goc, tuongTacCuoi: null, taoLuc: truoc(60) }, NOW);
    assert.equal(raatCu.temp, "ngu_dong");
    assert.ok(cu.diem >= 0);
  });
});

describe("lead đình trệ theo bậc phễu", () => {
  it("mốc khác nhau theo bậc", () => {
    assert.equal(leadDinhTre({ status: "new", capNhatCuoi: truoc(3) }, NOW).dinhTre, true);
    assert.equal(leadDinhTre({ status: "new", capNhatCuoi: truoc(1) }, NOW).dinhTre, false);
    assert.equal(leadDinhTre({ status: "interested", capNhatCuoi: truoc(5) }, NOW).dinhTre, false);
    assert.equal(leadDinhTre({ status: "interested", capNhatCuoi: truoc(9) }, NOW).dinhTre, true);
  });

  it("bậc không có mốc thì không bao giờ báo đình trệ", () => {
    assert.equal(leadDinhTre({ status: "enrolled", capNhatCuoi: truoc(100) }, NOW).dinhTre, false);
  });
});
