# Đối sánh ZCRM (Zalo CRM đang dùng) ↔ hệ thống Sata Robo

_Khảo sát 24/09/2026. Nguồn: màn hình thật tại `admin.satarobo.vn/zalo-crm` (chỉ xem, không thao tác)
+ tài liệu công khai của ZCRM v3.4. Không sao chép dữ liệu khách (tên/SĐT) — chỉ cấu trúc, nhãn, luồng._

## 1. ZCRM nằm ở đâu trong hệ cũ

Hệ cũ **nhúng ZCRM thành một trang** trong menu *CSKH & Phụ huynh → Zalo CRM*. Bên trong là ứng dụng
riêng ("Satarobo CS2 CRM") với thanh menu: Dashboard · Tin nhắn · Bạn bè · Khách hàng · Lịch hẹn ·
Kho ảnh · Marketing · Báo cáo · Cài đặt. Nói cách khác: hệ cũ **không tự làm CRM Zalo**, nó mượn
công cụ ngoài và chỉ đặt một cửa vào.

Hệ mình đi xa hơn một bước: giữ công cụ ngoài để chat (rủi ro khoá nick nằm ngoài máy chủ học vụ —
xem `ZALO-KENH-TRINH-CAM.md`), nhưng **kéo phần nghiệp vụ bán hàng về trong hệ thống** để lead, lịch
hẹn và lịch sử không phụ thuộc công cụ đó.

## 2. Màn "Tin nhắn" của ZCRM — đọc từng mảnh

| Mảnh trên màn | Ý nghĩa nghiệp vụ | Hệ mình (24/09/2026) |
|---|---|---|
| Ô đếm **Chưa đọc · Chưa rep · Đình trệ · Sẵn sàng** | Chia hội thoại theo *việc phải làm*, không theo trạng thái kỹ thuật | ✅ Đã có, bấm vào lọc luôn (`core/outreach/hopThu`) |
| Bộ lọc lưu sẵn ("Có triển vọng", "Công việc", "Đã học"…) + nút **+ Lưu** | Mỗi người một góc nhìn quen tay | ⏳ Chưa có (lọc thì có, **lưu** góc nhìn thì chưa) |
| **Phạm vi xem** (ALL — toàn bộ, đếm nick online/offline) | Chọn xem hộp thư của nick nào | ✅ Tương đương: lọc theo kênh + trạng thái nick ở màn Zalo CRM |
| **Tag** | Nhãn tự đặt, gắn lên hội thoại, lọc được | ✅ Đã có (tạo/tắt nhãn, gắn nhiều nhãn, lọc theo nhãn) |
| **Tin nhắn**: Chưa trả lời · Bot trả lời (No Sale) · Sale đã trả lời | Ai đang nợ khách, chỗ nào bot tự trả | ✅ "Chưa trả lời" đã có · ⏳ tách "bot trả lời / người trả lời" chưa có |
| **Điểm & Trạng thái** | Chấm điểm khách để biết gọi ai trước | ✅ Đã có `/leads/diem` — có thêm phần **giải thích từng điểm**, ZCRM không hiện |
| **Thời gian** | Lọc theo mốc thời gian | ⏳ Chưa (hiện chỉ có sắp xếp mới nhất) |
| **Sự kiện sắp tới**: Sinh nhật 7 ngày · Lịch hẹn 24h · Hẹn quá hạn | Ba cớ để chủ động nhắn khách | ✅ Đã có, hiện ngay trên hộp thư |
| Dòng hội thoại: nhãn, "Đang chat", số tin chưa đọc, biểu cảm | Nhìn một dòng biết ngay tình trạng | ✅ nhãn + việc phải làm + thời gian chờ · ⏳ trạng thái "đang chat", biểu cảm chưa có |

## 3. Các màn khác của ZCRM

| Màn | ZCRM làm gì | Hệ mình |
|---|---|---|
| **Dashboard** | Biểu đồ + KPI theo nick, trạng thái kết nối | ✅ Màn *Zalo CRM* (token, nick, hạn mức, ZNS) + Dashboard chung |
| **Bạn bè** | Danh bạ nick Zalo, quét nhóm | ❌ Cố ý không làm: đồng bộ danh bạ cá nhân về hệ thống là thu thập dữ liệu cá nhân (NĐ 13/2023) |
| **Khách hàng** | Hồ sơ khách, bậc phễu Mới → Đã liên hệ → Quan tâm → Chuyển đổi → Mất, gộp trùng | ✅ Lead có sẵn phễu riêng, nhập/gộp theo SĐT, chia lead, bàn giao — **mạnh hơn** ZCRM ở phần tiền/ghi danh |
| **Lịch hẹn** | Đặt hẹn, nhắc hằng ngày | ✅ Đã có `/lich-hen` (gọi lại / tư vấn / học thử, quá hạn, 24h tới) |
| **Kho ảnh** | Sao lưu ảnh khách gửi | ✅ Hệ mình có kho ảnh lớp + duyệt ảnh (mục đích khác, mạnh hơn) |
| **Marketing** | Gửi hàng loạt, quét nhóm | ✅ Có gửi hàng loạt **kèm chặn theo đồng ý nhận tin** (ZCRM không có) |
| **Báo cáo** | 6 nhóm báo cáo (điều hành, vận hành nick, hiệu suất sale, tương tác, sức khoẻ hệ thống, nâng cao) | ✅ Bộ báo cáo riêng (lead, học thử, đào tạo, doanh thu…) · ⏳ chưa có "hiệu suất sale theo hội thoại" |
| **Cài đặt** | Nhãn, chấm điểm, API key, webhook, vai trò | ✅ Nhãn + khoá kênh + webhook đã có; ⏳ màn chỉnh **trọng số chấm điểm** chưa có |

## 4. Những gì đã bê về (24/09/2026)

1. **Hộp thư kiểu ZCRM**: bốn ô đếm việc phải làm, đánh dấu đã đọc khi mở hội thoại, nhãn hội thoại
   (tạo/tắt/gắn/lọc), nhãn "việc" trên từng dòng.
2. **Lịch hẹn**: màn `/lich-hen` với *Quá hạn · 24 giờ tới · Hôm nay · Của tôi*, đặt hẹn ngay trong
   hội thoại, chốt hẹn (xong / khách không đến / huỷ).
3. **Sự kiện sắp tới** cạnh hộp thư: hẹn quá hạn, hẹn 24h tới, sinh nhật học viên 7 ngày tới.
4. **Điểm & trạng thái khách** `/leads/diem`: điểm từ tín hiệu thật, hao mòn theo ngày im lặng, nhãn
   nóng/ấm/lạnh/nguội/nguy cơ mất/ngủ đông, **kèm lý do từng điểm**, và cảnh báo *lead đình trệ* theo bậc phễu.

## 5. Còn lại, theo thứ tự đáng làm

1. **Lưu góc nhìn** ("+ Lưu") — mỗi người một bộ lọc quen tay; rẻ và dùng hằng ngày.
2. **Tách "bot trả lời" và "người trả lời"** — biết chỗ nào tự động đang thay người.
3. **Màn chỉnh trọng số chấm điểm** — để quản lý tự đổi ngưỡng nóng/ấm mà không cần sửa mã.
4. **Hiệu suất sale theo hội thoại** — thời gian phản hồi đầu tiên, số hội thoại chốt được, theo người.
5. **Lọc theo thời gian** trên hộp thư.

## 6. Ranh giới cố ý không sao chép

- **Bạn bè / quét nhóm / đồng bộ danh bạ**: dữ liệu cá nhân của người chưa liên hệ với trung tâm —
  không đưa vào hệ thống (NĐ 13/2023, Luật BVDLCN 2025).
- **Tự chạy thư viện Zalo không chính thức trong máy chủ học vụ**: giữ ở công cụ ngoài, xem
  `ZALO-KENH-TRINH-CAM.md` mục 3.
