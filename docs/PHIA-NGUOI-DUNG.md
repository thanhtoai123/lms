# Phía người dùng — cổng phụ huynh `/ph` và app giáo viên `/teacher`

> Yêu cầu của chủ dự án: "…và **tiếp tục phát triển phía người dùng**".
> Tài liệu này ghi lại **rà soát hành trình** (viết trước khi làm), các quyết định thiết kế,
> và cách xem thử. Liên quan: `docs/HO-SO-HOC-TAP.md`, `docs/CHUNG-NHAN-LO-TRINH.md`, `docs/TRAI-NGHIEM-MOT-CHAM.md`.

## 1. Rà soát hành trình (trước khi làm)

Đếm "chạm" từ lúc mở ứng dụng (đã đăng nhập) tới khi xong việc; gõ phím không tính.

### 1.1 Phụ huynh — việc hằng ngày / hằng tuần

| # | Việc | Hiện trạng | Chạm | Thiếu gì | Ưu tiên |
|---|---|---|---|---|---|
| P1 | Con học buổi tới lúc nào, ở đâu, với ai | Trang chủ: một dòng ngày giờ · lớp · phòng · cơ sở | 0 | Không có tên GV, không nổi bật, không có hành động kèm | Cao |
| P2 | Xin nghỉ một buổi | **Không có luồng**: vào trang con → "Hỏi trung tâm" → gõ chủ đề + nội dung → gửi; CSKH nhập tay thành yêu cầu | 4 + gõ | Nút một chạm tạo yêu cầu nghỉ (`parent_requests` loại `absence`), hỏi có cần học bù | **Rất cao** |
| P3 | Xem nhận xét buổi gần nhất | Trang chủ → Chi tiết → Hồ sơ học tập → cuộn tìm phiếu mới nhất | 2 + cuộn dài | Tóm tắt phiếu gần nhất ngay trang chủ (mức, nhận xét, ảnh) | **Rất cao** |
| P4 | Đóng học phí | Băng vàng trang chủ → Học phí → mở "Chuyển khoản (QR)" | 2 | Hạn / số tiền nổi hơn, mở thẳng QR | Trung bình |
| P5 | Đọc thông báo chưa đọc | Tab "Thông báo" (số chưa đọc trong nhãn) | 1 | Tóm tắt 3 thông báo mới trên trang chủ | Trung bình |
| P6 | Xem lịch học tháng / tuần | **Không có** — chỉ 10 buổi sắp tới + 30 buổi gần đây dạng danh sách | — | Lịch tháng/tuần có buổi thường, học bù, nghỉ lễ, trạng thái điểm danh | Cao |
| P7 | Theo dõi yêu cầu đã gửi (nghỉ, học bù, hỏi) | **Không có** — chỉ một thông báo "Trung tâm đã nhận yêu cầu" | — | Danh sách "Yêu cầu của tôi" + trạng thái + lịch sử | Cao |
| P8 | Xin học bù buổi con đã vắng | **Không có** | — | Nút "Xin học bù" trên buổi vắng (trong hạn) | Cao |
| P9 | Xem SataCoin của con | Trang con: một dòng số xu | 1 | Lịch sử, quà đổi được, yêu cầu đổi quà | Trung bình |
| P10 | Hành trình học (khoá đã / đang học, % buổi, học bạ, chứng nhận) | Trang con: danh sách lớp + học bạ dạng chữ; hồ sơ học tập ở trang riêng | 1–2 | Dòng thời gian lộ trình, biểu đồ tiến bộ, sản phẩm, **in / chia sẻ chứng nhận** | Cao |
| P11 | Phản hồi sau buổi | **Không có** (CSKH ghi hộ qua điện thoại) | — | Thả cảm xúc một chạm + ghi chú; "Cần trao đổi" → việc chăm sóc | Cao |
| P12 | Nhiều con | Trang chủ xếp chồng thẻ từng con, phải cuộn | cuộn | Chip chuyển nhanh giữa các con | Cao |
| P13 | Hỏi trung tâm | Trang con → form cuối trang | 1 + cuộn | Lối vào từ "Yêu cầu của tôi" | Thấp |
| P14 | Mở app khi mất mạng | Trình duyệt báo lỗi | — | Màn "offline" tối giản; manifest đúng màu thương hiệu | Trung bình |

### 1.2 Giáo viên — "xong việc trong 5 phút sau giờ dạy"

| # | Việc | Hiện trạng | Chạm | Thiếu gì | Ưu tiên |
|---|---|---|---|---|---|
| G1 | Lịch dạy hôm nay / tuần | Trang chủ: Hôm nay + 7 ngày tới + Cần chốt | 0 | Sĩ số trên thẻ, lối vào "Chuẩn bị" | Trung bình |
| G2 | Điểm danh → phiếu → hoàn tất | Màn buổi dạy một trang, ba bước | 1 | (giữ nguyên) | — |
| G3 | Phiếu cần hoàn thiện | Thẻ trên trang chủ | 1 | (giữ nguyên) | — |
| G4 | Chuẩn bị buổi dạy | Khối "Buổi này cần hoàn thiện" **ẩn với buổi tương lai**; tài liệu ở `/teaching-materials` (khu quản trị); không có danh sách HV cần lưu ý | 3+ | Màn "Chuẩn bị": bài, mục tiêu, học cụ, tiêu chí trọng tâm + mô tả mức, tài liệu của bài, HV cần lưu ý (sức khoẻ, vắng buổi trước, thẻ nổi bật, PH cần trao đổi) | **Rất cao** |
| G5 | Chụp & gắn ảnh trong buổi | Sang `/media` (khu quản trị, giao diện máy tính): chọn lớp, buổi, tải, gắn thẻ, gửi duyệt | 7+ | Chụp bằng camera ngay trên màn buổi, gắn nhiều em một chạm, cảnh báo em chưa đồng ý đăng ảnh | **Rất cao** |
| G6 | Xem phản hồi của phụ huynh | **Không có** (chỉ CSKH thấy ở `/parent-feedback`) | — | Thẻ "Phản hồi mới của PH" trang chủ + trên màn buổi | Cao |
| G7 | Lớp của tôi: tiến độ, HV nguy cơ, học bạ sắp đến hạn | Tiến độ x/y; bấm vào mở trang quản trị | 1 | HV nguy cơ (vắng nhiều, mức giảm), mốc học bạ sắp đến | Cao |
| G8 | Lương / chấm công của tôi | Chỉ qua menu quản trị "Của tôi" | 3 | Lối tắt từ app GV | Thấp |

### 1.3 Lỗ hổng rõ ràng khác

- Cổng PH: chữ 11–12 px ở nhiều chỗ, vùng chạm của thanh điều hướng < 44 px ở một số máy, không có `aria-label` cho nút biểu tượng.
- Manifest `/ph`: `theme_color` trắng (không phải tím Sata Robo), không có màn offline, SW không lưu gì.
- Trang con hiện `remark` từ điểm danh — đúng (nhận xét cho PH), **không** lộ `private_note` (đã kiểm).
- Dữ liệu PH chỉ theo `student_guardians` của phiên — giữ nguyên nguyên tắc cho mọi procedure mới.

### 1.4 Thứ tự làm

1. Lõi thuần + test (`packages/core/src/portal/`): lịch tháng, dòng thời gian lộ trình, chọn phiếu gần nhất, phân loại phản hồi → việc chăm sóc, nguy cơ HV, mốc học bạ sắp đến.
2. Service phụ huynh (phạm vi theo phiên PH) + route `/api/ph/*` có trần tần suất, audit trong transaction.
3. Trang PH: Hôm nay của con → Lịch học → Yêu cầu của tôi → Hành trình → SataCoin → offline.
4. App GV: trang chủ (phản hồi PH, lối tắt chấm công) → màn Chuẩn bị → ảnh nhanh → Lớp của tôi.
5. Seed + tài liệu.
