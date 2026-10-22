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
| 9 | Sản phẩm (`#hinh-anh`) | Sản phẩm thật làm bằng công cụ của từng chuyên ngành, 2 ảnh mỗi ngành (ghi nguồn) |
| 10 | Giảng viên (`#giang-vien`) | Ảnh và chứng chỉ thật |
| 11 | Kêu gọi học thử + hỏi đáp + form (`#hoi-dap`, `#dang-ky`) | Rủi ro thấp: thử trước, quyết sau |

Không nêu số học phần, số buổi, cấp độ Basic/Advanced/Expert, học phí trên trang chính. Học phí: giáo viên gửi sau buổi học
trải nghiệm hoặc phụ huynh gọi hotline (website không còn trang học phí riêng).
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
- Menu chung (khung website) trỏ `/#noi-lo`, `/#chuyen-nganh`, `/#con-thay-doi`, `/#quy-trinh`, `/#giang-vien`, `/#hoi-dap`.
- Website chỉ còn MỘT trang chính. Trang đã gộp (`SITE_MERGED`): `/gioi-thieu`, `/lien-he`, `/khoa-hoc`, 4 trang
  `/khoa-hoc/<ngành>` (mở đúng tab) và mọi `/khoa-hoc/<…>` khác → chuyển hướng 308 tới đúng phần; seed lưu trữ các trang này
  nên chúng rời sitemap. Còn lại: chính sách (bắt buộc cho ô đồng ý của form), tin tức, tuyển dụng, `/dang-ky`, landing `/lp/...`.

## 4. Hình ảnh

- Giao diện: kiểu `vivid` ("sắc màu"), quy chuẩn ở `DESIGN.md` (tham khảo Teky, MindX).
- Ảnh đầu trang: lưới 5 ảnh sản phẩm thật (danh sách `showcase` của khối mở đầu; đủ 5 ảnh thì ảnh đầu to ở giữa):
  robot lắp ghép RoboSim (WhalesBot), game Scratch, robot sao Hỏa (CreatiCode 3D), mô hình 3D Tinkercad (Autodesk, ô "Thiết kế đồ họa"),
  game 3D Roblox (Roblox Creator Docs, CC BY 4.0). Nguồn hiện một dòng dưới lưới. Ảnh nhà sản xuất: xin phép trước khi chạy
  quảng cáo trả tiền. Không dùng ảnh có nhân vật có bản quyền (vd Mario trong ảnh App Inventor).
  Ảnh chia sẻ `lp-anh/og-trang-chu.jpg` (`ghep_anh.py og-trang-chu`). Tranh vector `tc-hero.svg`, `tc-xem-tao.svg` không còn dùng trên trang chính.
- Ảnh phần mềm thật, ưu tiên giấy phép mở, nguồn + liên kết hiện dưới ảnh (trường `credit`, `creditUrl`):

| Ảnh | Nguồn · giấy phép |
|---|---|
| scratch-trinh-soan.webp | Wikimedia Commons / MouseCursor · CC BY-SA 2.0 |
| teachable-machine-du-lieu.webp | Google Creative Lab, teachablemachine-community · Apache-2.0 |
| appinventor-thiet-ke-app.webp | Wikimedia Commons / Florian Schäffer · CC0 |
| roblox-studio-dua-xe.webp, roblox-studio-lau-dai.webp | Roblox Creator Docs (GitHub) · CC BY 4.0 |
| python-pygame-ma.webp | Wikimedia Commons / Rikulpatel1 · CC0 |
| wordpress-soan-bai.webp | Wikimedia Commons / Gmoran6 · GPL |
| robovr-*, tinkercad-*, creaticode-*, photoshop-*, robosim-* | Ảnh giới thiệu của nhà sản xuất / ban tổ chức — xin phép trước khi dùng trong quảng cáo trả tiền |

- Scratch đổi điều khoản 22/01/2026: dự án chia sẻ không còn được coi là CC BY-SA 2.0 → không lấy ảnh dự án mới từ scratch.mit.edu.

## 5. Đo lường và quảng cáo

- Thẻ Meta Pixel / GA4 / Google Ads chỉ nạp khi phụ huynh bấm "Đồng ý" ở banner (`components/landing/consent-banner.tsx`,
  khoá `th-ads-consent`); chân trang có "Đổi lựa chọn đo lường" (`/#do-luong`).
- Meta Conversions API: route `/api/public/leads` gửi sự kiện Lead (cùng `event_id` với Pixel, số điện thoại băm SHA-256)
  khi có `META_CAPI_TOKEN` + Pixel ID + đồng ý; nhật ký ở Hệ thống → Chạy lại webhook (nguồn `meta_capi`). Thử bằng
  `META_CAPI_TEST_CODE`. Google Ads enhanced conversions: form đặt `user_data.phone_number` trước sự kiện chuyển đổi.
- Hướng dẫn chạy quảng cáo + checklist vận hành: doc "Vận hành & chạy quảng cáo trang chính" (Claude Docs).

## 6. Việc còn chờ trung tâm

- Ảnh thật có đồng ý: màn hình lớp ClassIn đang dạy, sản phẩm học viên (thay dần ảnh phần mềm ở khối Sản phẩm).
- Lời phụ huynh thật → bật khối "Phụ huynh nói gì".
- Ảnh AI (nếu dùng): chỉ bối cảnh, thiết bị, đồ vật; ghi "Ảnh minh hoạ".
- Duyệt chính sách bảo mật mới (Luật 91/2025, NĐ 356/2025).

## 7. Chuyên ngành Trí tuệ nhân tạo AI — hiểu đúng

Chương trình dạy ỨNG DỤNG công cụ AI (ChatGPT, Gemini, Canva, Suno AI, công cụ video AI, công cụ làm web AI) để làm ra tranh,
truyện tranh, poster, bài hát, video ngắn, trang web, kèm khái niệm AI cơ bản và dùng AI an toàn — KHÔNG phải dự án nghiên cứu /
huấn luyện mô hình AI. Ảnh trên trang chính cho chuyên ngành này là ảnh minh hoạ loại sản phẩm (`tools/minh-hoa/san_pham_ai.py`):
tranh nền tạo bằng AI lấy từ Wikimedia Commons (CC0 / phạm vi công cộng), khung poster / trình phát video / trình duyệt tự dựng.
Khi có sản phẩm thật của học viên (có đồng ý của phụ huynh) thì thay vào.

