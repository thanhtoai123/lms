/**
 * Giao diện chung của kho tệp. Hai bản cài: đĩa cục bộ (`dia.ts`) cho máy phát triển,
 * và dịch vụ tương thích S3 (`s3.ts`) cho môi trường thật.
 *
 * Giữ giao diện đúng bốn thao tác — mọi thứ khác (ký URL, kiểm quyền) nằm ở tầng trên,
 * nên đổi nhà cung cấp kho tệp không đụng tới phần còn lại của hệ thống.
 */
export interface KhoTep {
  /** Tên hiển thị ở trang Vận hành: "dia" hoặc "s3" */
  ten: "dia" | "s3";
  dat(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  /** `null` khi không có tệp — không ném lỗi, vì "chưa có ảnh" là chuyện thường */
  lay(key: string): Promise<Buffer | null>;
  xoa(key: string): Promise<void>;
  /** Xoá cả một thư mục theo tiền tố (gói SCORM là hàng trăm tệp) */
  xoaTheoTienTo(prefix: string): Promise<void>;
  /** Thử kết nối — ném lỗi có nội dung đọc được nếu cấu hình sai */
  kiemTra(): Promise<void>;
}
