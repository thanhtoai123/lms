# Kịch bản kiểm thử nghiệp vụ theo vai trò

`scripts/kiem-thu/kich-ban-vai-tro.ps1` chạy trên máy đã dựng sẵn CSDL + máy chủ dev
(`http://localhost:3000`), gọi thẳng API tRPC bằng cookie `x-dev-actor` của 7 vai:
quản trị · quản lý cơ sở · tư vấn · kế toán · nhân sự · giáo vụ · giáo viên.

Chạy: `powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-vai-tro.ps1`

> Kịch bản này là **bộ D** của bộ kiểm thử lớn hơn ở `docs/KIEM-THU-TOAN-DIEN.md`
> (`scripts/kiem-thu/kich-ban-toan-dien.ps1`), bộ đó chạy thêm bảo mật, cách ly trung tâm
> nhượng quyền và trải nghiệm một chạm rồi gom tất cả vào một báo cáo Markdown.

Mỗi dòng in `PASS` / `FAIL` kèm thông báo lỗi thật của hệ thống, cuối cùng in tổng kết.
Dòng `SKIP` là bước bỏ qua vì môi trường thiếu dữ liệu — không tính vào PASS/FAIL.

## Chọn dữ liệu mẫu có kiểm tra tiền đề

Hai nhóm dưới đây **không** lấy phần tử đầu danh sách, vì làm vậy dễ trúng dữ liệu không
đủ điều kiện và báo lỗi oan:

| Nhóm | Điều kiện chọn | Không thoả thì |
|---|---|---|
| F (điểm danh) | buổi `scheduled` **đã diễn ra** (`recordAttendance` chặn buổi tương lai) và thuộc lớp có `roster ≥ 1` (lớp rỗng → `enrollmentId` null → zod báo "Expected string, received null") | `SKIP F2–F6` |
| G (ảnh lớp) | ảnh trong kho có `isClassWide = true` hoặc đã gắn học viên (`canSubmitMedia` từ chối ảnh chưa gắn ai và chưa đánh dấu ảnh chung) | `SKIP G2–G5` |

`submitMedia` / `reviewMedia` / `restoreMedia` trả về `{ results, ok, failed }` — `ok` là **số
dòng thành công của nghiệp vụ**. Kịch bản khẳng định `ok ≥ 1` chứ không chỉ khẳng định lời gọi
thành công, và in `results[].message` khi hỏng; nếu không sẽ có chuỗi đạt giả rồi hỏng ở bước
cuối. Các bước tạo bản ghi (B2, B4, C1, D1, D2, J2, L2, L4, O1) cũng chỉ báo đạt khi có id trả về.

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

## Lịch sử kết quả

**18/09/2026 — lần đầu**: 94 PASS / 3 FAIL. Ba mục không đạt là hạn chế của chính kịch bản
(chọn ảnh trong kho chưa gắn thẻ học viên nên không gửi duyệt được; lớp lấy mẫu chưa có ghi danh),
không phải lỗi nghiệp vụ.

**Lỗi thật đã tìm ra và sửa trong đợt này**: kế toán cơ sở / kế toán Hội sở không chốt được kỳ công
(bản gốc ghi rõ người chốt là "Kế toán cơ sở hoặc Kế toán Hội sở") → đã thêm quyền `timesheet:lock`.

**18/09/2026 — chạy trong bộ toàn diện**: 191 PASS / 6 FAIL / 6 SKIP trên 203 bước (bộ bảo mật
41/41). Cả sáu mục không đạt đều là khiếm khuyết của kịch bản, **không có lỗi sản phẩm nào**:

| Mục | Nguyên nhân | Đã sửa |
|---|---|---|
| F2, F3 | Buổi lấy mẫu thuộc lớp không còn học viên → `enrollmentId` null | Chọn buổi đã diễn ra của lớp còn học viên, không thoả thì `SKIP F2–F6` |
| G5 | Ảnh đầu kho chưa đủ điều kiện gửi duyệt; G2 chỉ khẳng định lời gọi thành công nên đạt giả, hỏng dây chuyền tới G5 | Chọn ảnh đủ điều kiện + khẳng định `ok` nghiệp vụ ở cả ba lệnh ảnh |
| C06 | Kịch bản toàn diện suy kỳ vọng từ tên tài khoản; `giaovu.cs1` thật ra là CENTER_CLASS_MANAGER nên 5 nhóm việc nó trả về là đúng quyền | Đối chiếu quyền đọc sống từ `system.roles` / `auth.me` / `admin.groups` |
| B16 | Đếm thẳng đối tượng `{source, canWaive, items}` nên luôn ra 1 | Lấy `.items` và đối chiếu tenant của từng lớp |
