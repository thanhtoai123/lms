# Kịch bản kiểm thử nghiệp vụ theo vai trò

`scripts/kiem-thu/kich-ban-vai-tro.ps1` chạy trên máy đã dựng sẵn CSDL + máy chủ dev
(`http://localhost:3000`), gọi thẳng API tRPC bằng cookie `x-dev-actor` của 7 vai:
quản trị · quản lý cơ sở · tư vấn · kế toán · nhân sự · giáo vụ · giáo viên.

Chạy: `powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-vai-tro.ps1`

> Kịch bản này là **bộ D** của bộ kiểm thử lớn hơn ở `docs/KIEM-THU-TOAN-DIEN.md`
> (`scripts/kiem-thu/kich-ban-toan-dien.ps1`), bộ đó chạy thêm bảo mật, cách ly trung tâm
> nhượng quyền và trải nghiệm một chạm rồi gom tất cả vào một báo cáo Markdown.

Mỗi dòng in `PASS` / `FAIL` kèm thông báo lỗi thật của hệ thống, cuối cùng in tổng kết.

## Nhóm kiểm thử

| Nhóm | Nội dung |
|---|---|
| 0 | Dữ liệu tham chiếu: cơ sở, khoá, phương thức thanh toán, lớp |
| A | Tư vấn: tạo lead, nhập lại trùng SĐT gộp vào lead cũ, thêm con (giới tính/ngày sinh/cơ sở quan tâm), ghi hoạt động gọi điện, **chặn chuyển "Đã mất" khi không có lý do**, bật dùng chung lead |
| B | Lớp trải nghiệm: tạo lớp, thêm buổi khác giờ, xếp học viên, **học viên có mặt ở cả buổi tạo sau**, **chặn đổi lịch khi lý do < 5 ký tự**, điểm danh buổi hôm nay, **chặn điểm danh buổi chưa diễn ra**, **hết chỗ thì chặn**, chỉ người có quyền mới vượt sĩ số |
| C | Nhóm lớp: tạo và đọc lại |
| D | Tài chính: tạo đơn cọc + 2 đợt, sale ghi nhận, **sale không xác nhận được**, kế toán xác nhận, điều chỉnh khoản đã xác nhận, **đếm số lần điều chỉnh**, xuất QR và dùng lại QR còn hiệu lực, công nợ có "Thiếu — PH đang thấy" và "Thiếu thật" |
| E | Hoa hồng: **chặn chính sách vượt trần 9%**, chấp nhận chính sách trong trần |
| F | Buổi học: điểm danh vắng có phép kèm nhu cầu học bù và lý do PH, **chặn chốt buổi khi chưa đủ điều kiện**, xác nhận bài đã dạy, ghi nhận xét, **huỷ buổi kiểu dời giữ nguyên tổng buổi** |
| G | Ảnh lớp hai tầng: kho → gửi duyệt → loại → khôi phục trong 7 ngày |
| H | Học viên: bảo lưu, kết thúc bảo lưu, **chặn bảo lưu không lý do** |
| I | Chấm công: sinh lưới chạy thử, ghi đè công, **kế toán chốt kỳ** (hoặc nói rõ vì sao chưa chốt được), **kỳ đã chốt chặn sửa công**, **chặn mở lại kỳ khi không có lý do** |
| J | Cây tổ chức: tạo đơn vị con, **mã không đổi được sau khi tạo**, xoá mềm |
| K | Quyền nhóm & nhật ký: cấp quyền nhóm, **chặn cấp quyền hệ thống qua nhóm**, nhật ký che PII, **mở xem đầy đủ cần lý do ≥10 ký tự** |
| L | Đánh giá & khảo sát v2: **chặn radio < 2 lựa chọn**, tạo phiếu hợp lệ, **chặn câu hỏi ảnh ngoài phiếu buổi học**, tạo và mở/đóng đợt |
| M | Thông báo: chạy rà soát cảnh báo, trung tâm thông báo, danh mục 54 loại |
| N | Quyền theo vai: giáo viên không xem thanh toán, tư vấn không xem hồ sơ nhân sự, quản lý cơ sở không quản lý tài khoản |
| O | Học bù: tạo yêu cầu, danh sách buổi nhận bù, xếp bù |
| P | Cổng phụ huynh: các trang trả về hợp lệ |

## Kết quả lần chạy 18/09/2026

94 PASS / 3 FAIL — 3 mục còn lại là hạn chế của chính kịch bản (chọn ảnh trong kho chưa gắn thẻ
học viên nên không gửi duyệt được; lớp lấy mẫu chưa có ghi danh), không phải lỗi nghiệp vụ.

**Lỗi thật đã tìm ra và sửa trong đợt này**: kế toán cơ sở / kế toán Hội sở không chốt được kỳ công
(bản gốc ghi rõ người chốt là "Kế toán cơ sở hoặc Kế toán Hội sở") → đã thêm quyền `timesheet:lock`.
