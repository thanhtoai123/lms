import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docCauHinhS3, thieuBienS3 } from "./s3.js";
import { moTaKho } from "./index.js";

const DU = {
  S3_BUCKET: "satarobo",
  S3_ENDPOINT: "https://tk.r2.cloudflarestorage.com",
  S3_ACCESS_KEY_ID: "AKIA",
  S3_SECRET_ACCESS_KEY: "bi-mat",
};

describe("chọn kho tệp theo biến môi trường", () => {
  it("khai đủ bốn biến thì dùng S3", () => {
    const cfg = docCauHinhS3(DU)!;
    assert.equal(cfg.bucket, "satarobo");
    assert.equal(cfg.region, "auto", "R2 không phân vùng khu vực nên mặc định auto");
    assert.equal(cfg.pathStyle, true, "R2 và MinIO đều cần path-style");
  });

  it("thiếu một biến là không dùng S3 — không có chế độ nửa vời", () => {
    for (const k of Object.keys(DU)) {
      const env = { ...DU, [k]: "" };
      assert.equal(docCauHinhS3(env), null, `thiếu ${k} mà vẫn nhận cấu hình`);
      assert.deepEqual(thieuBienS3(env), [k]);
    }
  });

  it("khoảng trắng không tính là đã khai", () => {
    assert.equal(docCauHinhS3({ ...DU, S3_BUCKET: "   " }), null);
  });

  it("đổi được khu vực và tắt được path-style cho S3 thật", () => {
    const cfg = docCauHinhS3({ ...DU, S3_REGION: "ap-southeast-1", S3_FORCE_PATH_STYLE: "0" })!;
    assert.equal(cfg.region, "ap-southeast-1");
    assert.equal(cfg.pathStyle, false);
  });
});

describe("mô tả kho cho trang Vận hành", () => {
  it("có S3 thì báo ổn và nói rõ bucket, không lộ khoá", () => {
    const m = moTaKho(DU, true);
    assert.equal(m.loai, "s3");
    assert.equal(m.trang_thai, "ok");
    assert.ok(m.mo_ta.includes("satarobo"));
    assert.ok(!m.mo_ta.includes("bi-mat") && !m.ghi_chu.includes("bi-mat"), "không được lộ khoá bí mật");
  });

  it("chạy thật mà vẫn dùng đĩa thì báo NGUY HIỂM và nói thiếu biến nào", () => {
    const m = moTaKho({ STORAGE_DIR: "/var/satarobo" }, true);
    assert.equal(m.loai, "dia");
    assert.equal(m.trang_thai, "nguy_hiem");
    assert.match(m.ghi_chu, /mất sau mỗi lần triển khai/);
    assert.match(m.ghi_chu, /S3_BUCKET/);
  });

  it("máy phát triển dùng đĩa thì chỉ nhắc nhẹ", () => {
    assert.equal(moTaKho({}, false).trang_thai, "canh_bao");
  });
});
