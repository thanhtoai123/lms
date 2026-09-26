/**
 * Chọn kho tệp theo biến môi trường, và chỉ chọn MỘT LẦN cho cả tiến trình.
 *
 * Luật chọn cố ý đơn giản: **khai đủ bốn biến `S3_*` thì dùng S3, không thì dùng đĩa.**
 * Không có biến "bật/tắt" riêng — một cái công tắc nữa chỉ tạo thêm một cách để triển khai
 * nhầm rồi mất tệp mà không ai biết.
 */
import { khoDia } from "./dia";
import { docCauHinhS3, taoKhoS3, thieuBienS3 } from "./s3";
import type { KhoTep } from "./loai";

export type { KhoTep } from "./loai";
export { thieuBienS3 } from "./s3";
export { thuMucGoc } from "./dia";

let daChon: KhoTep | null = null;

export function kho(env: Record<string, string | undefined> = process.env): KhoTep {
  if (daChon) return daChon;
  const cfg = docCauHinhS3(env);
  daChon = cfg ? taoKhoS3(cfg) : khoDia;
  return daChon;
}

/** Chỉ dùng trong kiểm thử — buộc chọn lại sau khi đổi biến môi trường */
export function quenLuaChonKho() {
  daChon = null;
}

/**
 * Mô tả kho đang dùng cho trang Vận hành. Không bao giờ trả khoá bí mật — chỉ tên bucket
 * và endpoint, vốn không phải bí mật.
 */
export function moTaKho(env: Record<string, string | undefined> = process.env, production = false): {
  loai: "dia" | "s3";
  mo_ta: string;
  trang_thai: "ok" | "canh_bao" | "nguy_hiem";
  ghi_chu: string;
} {
  const thieu = thieuBienS3(env);
  if (thieu.length === 0) {
    return {
      loai: "s3",
      mo_ta: `${env.S3_BUCKET} @ ${env.S3_ENDPOINT}`,
      trang_thai: "ok",
      ghi_chu: "Tệp nằm ngoài máy chủ ứng dụng — triển khai lại không mất gì.",
    };
  }
  if (production) {
    return {
      loai: "dia",
      mo_ta: thuMucGocMoTa(env),
      trang_thai: thieu.length === 4 ? "nguy_hiem" : "nguy_hiem",
      ghi_chu:
        `Đang lưu tệp trên đĩa của chính máy chủ. Nếu nền tảng triển khai dùng đĩa tạm thời ` +
        `(Vercel và tương tự) thì MỌI ảnh lớp, tài liệu, CV, bài nộp sẽ mất sau mỗi lần triển khai. ` +
        `Khai đủ ${thieu.join(", ")} để chuyển sang kho đối tượng.`,
    };
  }
  return {
    loai: "dia",
    mo_ta: thuMucGocMoTa(env),
    trang_thai: "canh_bao",
    ghi_chu: `Đĩa cục bộ — hợp lý khi phát triển. Khi chạy thật cần khai ${thieu.join(", ")}.`,
  };
}

function thuMucGocMoTa(env: Record<string, string | undefined>): string {
  return env.STORAGE_DIR ?? "(mặc định .data/uploads)";
}
