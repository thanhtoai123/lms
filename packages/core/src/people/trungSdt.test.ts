import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keHoachGop, keHoachGopTheoSo, type DongPhuHuynh } from "./trungSdt.js";

const d = (id: string, p: Partial<DongPhuHuynh> = {}): DongPhuHuynh => ({
  id,
  fullName: `Phụ huynh ${id}`,
  accountStatus: "none",
  email: null,
  zaloId: null,
  soCon: 0,
  soDon: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...p,
});

describe("chọn dòng giữ lại khi trùng số điện thoại", () => {
  it("một dòng thì không có gì để gộp", () => {
    assert.equal(keHoachGop([d("a")]), null);
    assert.equal(keHoachGop([]), null);
  });

  it("ưu tiên dòng đã kích hoạt tài khoản cổng, dù ít con hơn", () => {
    const k = keHoachGop([d("a", { soCon: 3 }), d("b", { accountStatus: "active", soCon: 1 })])!;
    assert.equal(k.giuLai.id, "b");
    assert.deepEqual(k.gopVao.map((x) => x.id), ["a"]);
    assert.match(k.lyDo, /kích hoạt/);
  });

  it("cùng trạng thái thì giữ dòng gắn nhiều con nhất", () => {
    const k = keHoachGop([d("a", { soCon: 1 }), d("b", { soCon: 4 }), d("c", { soCon: 2 })])!;
    assert.equal(k.giuLai.id, "b");
    assert.equal(k.gopVao.length, 2);
    assert.match(k.lyDo, /4 con/);
  });

  it("cùng số con thì giữ dòng nhiều đơn học phí hơn", () => {
    const k = keHoachGop([d("a", { soCon: 2, soDon: 0 }), d("b", { soCon: 2, soDon: 5 })])!;
    assert.equal(k.giuLai.id, "b");
    assert.match(k.lyDo, /5 đơn/);
  });

  it("hoà hết thì giữ Zalo ID, rồi email, rồi dòng tạo sớm nhất", () => {
    assert.equal(keHoachGop([d("a"), d("b", { zaloId: "z1" })])!.giuLai.id, "b");
    assert.equal(keHoachGop([d("a"), d("b", { email: "x@y.z" })])!.giuLai.id, "b");
    const sominh = keHoachGop([d("a", { createdAt: new Date("2026-05-01") }), d("b", { createdAt: new Date("2025-02-01") })])!;
    assert.equal(sominh.giuLai.id, "b");
    assert.match(sominh.lyDo, /sớm nhất/);
  });

  it("hoà tuyệt đối thì vẫn ra cùng kết quả dù đọc theo thứ tự nào", () => {
    const x = d("aaa");
    const y = d("bbb");
    assert.equal(keHoachGop([x, y])!.giuLai.id, "aaa");
    assert.equal(keHoachGop([y, x])!.giuLai.id, "aaa");
  });

  it("dòng giữ lại không bao giờ nằm trong danh sách gộp vào", () => {
    const k = keHoachGop([d("a", { soCon: 1 }), d("b", { soCon: 2 }), d("c", { soCon: 3 })])!;
    assert.ok(!k.gopVao.some((r) => r.id === k.giuLai.id));
    assert.equal(k.gopVao.length + 1, 3);
  });
});

describe("gộp theo số đã chuẩn hoá", () => {
  const rows = [
    { ...d("a1", { soCon: 1 }), sdt: "84911000001" },
    { ...d("a2", { soCon: 2 }), sdt: "84911000001" },
    { ...d("a3"), sdt: "84911000001" },
    { ...d("b1"), sdt: "84911000002" },
    { ...d("c1"), sdt: "84911000003" },
    { ...d("c2", { accountStatus: "active" }), sdt: "84911000003" },
  ];

  it("chỉ trả nhóm thật sự trùng", () => {
    const k = keHoachGopTheoSo(rows);
    assert.deepEqual(k.map((x) => x.sdt), ["84911000001", "84911000003"]);
  });

  it("nhóm sai nhiều nhất xếp lên đầu", () => {
    assert.equal(keHoachGopTheoSo(rows)[0]!.gopVao.length, 2);
  });

  it("mỗi nhóm chọn đúng dòng giữ lại của nhóm đó", () => {
    const k = keHoachGopTheoSo(rows);
    assert.equal(k.find((x) => x.sdt === "84911000001")!.giuLai.id, "a2");
    assert.equal(k.find((x) => x.sdt === "84911000003")!.giuLai.id, "c2");
  });

  it("dòng không có số thì bỏ qua, không gom thành một nhóm rỗng", () => {
    assert.deepEqual(keHoachGopTheoSo([{ ...d("x"), sdt: "" }, { ...d("y"), sdt: "" }]), []);
  });
});
