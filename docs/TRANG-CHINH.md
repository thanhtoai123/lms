# Trang chính một trang — TH STEAM Academy

Phương án B (21/10/2026): website gộp về **một trang chính** dựng bằng bộ dựng landing có sẵn. Nội dung nằm ở
`packages/core/src/landing/home.ts`; sửa chữ trong quản trị **Website → Landing page → Trang chủ** rồi Xuất bản.

## 1. Mạch nội dung

Nỗi lo → bối cảnh → giải pháp → chuyên ngành → giá trị → bằng chứng → hành động.

| # | Khối (id) | Mục đích |
|---|---|---|
| 1 | Mở đầu + form (`mo-dau`) | Gọi đúng nỗi lo, hứa chuyển đổi cụ thể; form 4 ô ngay màn hình đầu |
| 2 | Số liệu có nguồn, nền navy (`noi-lo`) | Con dùng màn hình nhiều giờ — nhưng để làm gì? |
| 3 | Số liệu có nguồn (`tuong-lai`) | Thế giới con lớn lên: AI, kỹ năng, chương trình của Bộ GD&ĐT |
| 4 | So sánh (`sang-tao`) | Dùng công nghệ ↔ tạo ra công nghệ (thông điệp "bố mẹ làm được") |
| 5 | Tab chuyên ngành (`chuyen-nganh`) | Hợp với bạn nhỏ nào, con làm được gì; ảnh phần mềm thật |
| 6 | Trước → sau (`con-thay-doi`) | Tiêu chí đánh giá thật (6 năng lực + 3 phẩm chất), nói "hướng tới" |
| 7 | Vì sao yên tâm (`#cam-ket`) | Giáo viên trực tiếp, lớp nhỏ, báo cáo trước phụ huynh… |
| 8 | Một buổi học (`#quy-trinh`) | Phụ huynh hình dung lớp online |
| 9 | Sản phẩm (`#hinh-anh`) | Loại sản phẩm con làm ra (ảnh phần mềm, ghi nguồn) |
| 10 | Giảng viên (`#giang-vien`) | Ảnh và chứng chỉ thật |
| 11 | Kêu gọi học thử + hỏi đáp + form (`#hoi-dap`, `#dang-ky`) | Rủi ro thấp: thử trước, quyết sau |

Không nêu số học phần, số buổi, cấp độ Basic/Advanced/Expert, học phí trên trang chính — chi tiết ở `/khoa-hoc`.
Lời phụ huynh để tắt cho tới khi có lời thật, có đồng ý.

## 2. Nguồn số liệu (đọc trực tiếp 21/10/2026)

| Con số | Nguồn |
|---|---|
| 89% trẻ lên mạng mỗi ngày, 5–7 giờ (Cục Trẻ em, thứ cấp) | Tuổi Trẻ 04/08/2025 |
| 60% giải trí / 25% học (Hưng Yên) | Tuổi Trẻ 24/06/2026 |
| 53% gặp nội dung độc hại; 2.775 trẻ, 16 tỉnh (A05) | Báo Văn Hóa 05/01/2026 |
| 2–3% thời gian màn hình để sáng tạo (Mỹ) | Common Sense Census 2019 |
| AAP: xem chất lượng, không chỉ số giờ | AAP Screen Time Guidelines 2025 |
| 39% kỹ năng cốt lõi thay đổi đến 2030 | WEF Future of Jobs 2025 |
| 91% lãnh đạo DN Việt cân nhắc tuyển vị trí AI | Microsoft Work Trend Index 2025 (Việt Nam News) |
| 12 tiết AI/năm từ năm học 2026–2027 (QĐ 2422) | Báo Văn Hóa 20/08/2026 |
| Khung năng lực số 6 miền (TT 02/2025) | VnEconomy 06/02/2025 |

Liên kết đầy đủ: `HOME_SOURCES` trong `home.ts`. Kiểm thử chặn con số không có nguồn trong danh sách này.
Không dùng: "thiếu 150–200 nghìn nhân lực CNTT", "tuổi có điện thoại trung bình là 9", "40% trẻ 8–12 tuổi dùng điện thoại hơn 4 giờ".

## 3. Kỹ thuật

- Khối mới của bộ dựng: `insights` (số liệu + nguồn, kiểu nền `toi`), `contrast`, `tracks` (tab không cần JavaScript, nhóm radio
  + CSS), `change`. Định nghĩa ở `landing/model.ts`, hiển thị ở `landing/render.ts`.
- `/?nganh=robotics|ai|do-hoa|lap-trinh` (dùng cho quảng cáo): mở sẵn tab, đổi H1 sang `headline` của tab, chọn sẵn chuyên ngành
  trong form. Canonical vẫn là `/` nên không tạo trang trùng.
- Hiệu ứng: hiện dần khi cuộn bằng CSS `animation-timeline: view()` (không JavaScript); trình duyệt chưa hỗ trợ hoặc máy bật
  "giảm chuyển động" thì không chạy hiệu ứng. Ảnh đầu trang tải ngay, ảnh còn lại tải lười, có width/height chống nhảy bố cục.
- SEO: một H1, tiêu đề ≤ 70 ký tự, mô tả ≤ 160, ảnh chia sẻ `og-hoc-cong-nghe-online.png`; JSON-LD EducationalOrganization +
  WebPage + FAQPage + 4 Course (từ khối tab).
- Menu chung (khung website) trỏ `/#noi-lo`, `/#chuyen-nganh`, `/#quy-trinh`, `/#giang-vien`, `/khoa-hoc#hoc-phi`, `/#hoi-dap`.
- Trang đã gộp (`SITE_MERGED`): `/gioi-thieu`, `/lien-he`, 4 trang `/khoa-hoc/<ngành>` → chuyển hướng 308 tới đúng phần
  (trang ngành mở đúng tab); seed lưu trữ các trang này nên chúng rời sitemap. Giữ `/khoa-hoc` (chương trình từng năm + học phí),
  chính sách, tin tức, tuyển dụng, 5 landing quảng cáo `/lp/...`.

## 4. Việc còn chờ trung tâm

- Ảnh thật có đồng ý: màn hình lớp ClassIn đang dạy, sản phẩm học viên (thay dần ảnh phần mềm ở khối Sản phẩm).
- Lời phụ huynh thật → bật khối "Phụ huynh nói gì".
- Ảnh AI (nếu dùng): chỉ bối cảnh, thiết bị, đồ vật; ghi "Ảnh minh hoạ".
