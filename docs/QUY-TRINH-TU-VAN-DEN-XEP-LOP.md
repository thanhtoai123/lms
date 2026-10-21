# Quy trình: lead → học trải nghiệm → đơn → tiền về → tự xếp lớp

| Bước | Ai | Ở đâu | Trạng thái lead |
|---|---|---|---|
| 1. Lead vào (form landing / nhập tay), chia cho sale | hệ thống / sale | Leads | Mới → Đã liên hệ |
| 2. Hẹn học trải nghiệm 1:1 (ClassIn) | sale | Lớp trial → Đặt lịch | Đã hẹn học thử |
| 3. Ghi kết quả buổi thử + Báo cáo học thử gửi phụ huynh | giáo viên / sale | Lớp trial · Báo cáo học thử | Đã học thử (không đến → Nuôi dưỡng) |
| 4. Phụ huynh đồng ý → **Tạo đơn hàng cho lead này** | sale | Trang lead | |
| 5. Thu tiền: Xuất QR (tiền về tự xác nhận) hoặc ghi nhận tiền mặt → kế toán xác nhận | sale / kế toán | Trang đơn | |
| 6. Chốt học viên: hồ sơ phụ huynh + học viên + ghi danh lớp | **tự động** khi tiền về (nếu đơn đã chọn lớp) hoặc sale bấm Chốt | Trang lead → Chốt | Đã đăng ký |

## Tạo đơn (bước 4)

- Dòng đơn: chọn **gói bán** (Lớp nhóm 6–8 học sinh / Kèm 1:1 · 1 năm học) hoặc **combo 2 năm học**
  (`thComboOffers`, TH_PRICING.combo: lớp nhóm 9.750.000đ −35%, kèm 1:1 38.250.000đ −15%) — combo thành hai dòng
  Năm 1 + Năm 2, mỗi dòng nửa giá combo.
- **Lớp sẽ TỰ XẾP khi tiền về** (tuỳ chọn, mỗi dòng): lớp đang tuyển / đang học, cùng cơ sở, đúng khoá của dòng.
  Lưu ở `order_items.target_class_id` (sql/0021).
- Hình thức lớp đi theo gói: gói `…-1KEM1` là Kèm 1:1; nhập tay Kèm 1:1 thì giá niêm yết × 3.

## Tự xếp lớp (bước 6, packages/api/src/services/autoEnroll.ts)

1. Khoản tiền đầu tiên của đơn từ lead được xác nhận (SePay tự khớp, kế toán xác nhận, nhập sao kê…) →
   `recomputeOrderStatus` ghi sự kiện outbox `order.first_payment` **trong cùng transaction**.
2. Worker xử lý outbox → `autoEnrollOrder`: mỗi con lấy dòng đầu tiên có lớp tự xếp (combo: Năm 1), kiểm lớp còn
   mở và còn chỗ, rồi gọi đúng hàm chốt tay `convertLead` với **quyền của người tạo đơn** (kiểm quyền, khoá tiên
   quyết, cổng thanh toán giữ nguyên).
3. Thành công: thông báo "Đã tự xếp lớp" cho sale; sự kiện `auto_enroll` trên đơn; nhật ký.
   Dòng Năm 2 của combo giữ học viên, chờ ghi danh năm sau.
4. Không tự xếp được (chưa chọn lớp, lớp đầy / đóng, thiếu quyền, khoá tiên quyết…): thông báo
   "Tiền đã về — cần chốt xếp lớp" kèm lý do + đường dẫn trang Chốt. Không làm kẹt hàng đợi.

Kiểm thử: `THU_TT_DON=<mã đơn> pnpm thu-thanh-toan` — gửi webhook giả lập 10.000đ cho đúng đơn rồi chờ worker xếp lớp.
