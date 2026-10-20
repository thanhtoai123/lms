# Landing page theo khối

Bộ dựng landing trong khu quản trị: chọn mẫu → sửa chữ / ảnh / thứ tự khối → **Xuất bản** → trang công khai cập nhật ngay. Có thể tải tệp HTML để đưa lên host khác.

## Dùng thế nào

1. **Website → Landing page → + Tạo landing mới.** Đặt tên, đường dẫn (`/lp/<tên>`), chọn một trong 3 mẫu.
2. Trình soạn có 3 phần: danh sách **khối** bên trái (bật/tắt bằng ô tích, ▲▼ đổi thứ tự, ✕ xoá, “+ Thêm khối”), **form sửa** của khối đang chọn, **xem trước** thật (đổi giữa Máy tính / Điện thoại).
3. **Lưu nháp** không đổi trang công khai. **Xuất bản** mới đổi. Mỗi lần xuất bản giữ một phiên bản; “Đưa về nháp” để quay lại bản cũ rồi xuất bản lại.
4. Đường dẫn `trang-chu` = **trang chủ của website** (địa chỉ gốc `/`, hiện cho khách chưa đăng nhập; người đã đăng nhập vẫn vào thẳng ứng dụng).
5. **Tải HTML** (khi đang công khai): tệp một trang, CSS nhúng sẵn, không script, đưa lên host bất kỳ. Ảnh / liên kết nội bộ đổi thành địa chỉ tuyệt đối của hệ thống; form được thay bằng nút dẫn về `/dang-ky` (HTML tĩnh không gửi form sang miền khác được).

## Mẫu

| Mẫu | Hợp với |
|---|---|
| Đầy đủ — thuyết phục phụ huynh | Trang chủ, quảng cáo thương hiệu (cam kết, chương trình, quy trình, hỏi đáp, form) |
| Gọn — dễ đọc trên điện thoại | Trang đích quảng cáo Facebook / Zalo |
| Chiến dịch — nổi bật | Sự kiện, khai giảng, ưu đãi có thời hạn |

Mẫu **không** có số thành tích, giá, phần thưởng hay lời phụ huynh: các khối đó để trống và tự ẩn cho tới khi nhập số THẬT.

## Khối có sẵn (14)

Đầu trang & menu · Mở đầu (Hero) · Số liệu · Cam kết / lợi ích · Chương trình học · Phản hồi phụ huynh · Dải kêu gọi · Các bước · Lịch / mốc thời gian · Thư viện ảnh · Câu hỏi thường gặp · Form đăng ký học thử · Đoạn chữ tự do · Chân trang. Định nghĩa trường nằm ở `packages/core/src/landing/model.ts` (`SECTION_DEFS`) — thêm trường chỉ sửa một chỗ.

## Kiểm tra trước khi xuất bản

Lỗi chặn xuất bản: thiếu trường bắt buộc, liên kết / ảnh sai dạng, thiếu khối Hero, không có form hoặc nút kêu gọi. Chỉ nhắc (không chặn): số liệu còn là `0`, chữ giữ chỗ (`0.000.000đ`, “đang cập nhật”, lorem), khối bật nhưng chưa có dòng nào.

## Đo lường và lead

- Trang công khai ghi `page_view` (đường dẫn `/lp/<tên>` hoặc `/`), `form_view`, `form_start`, `cta_click`.
- Nút dẫn sang `/dang-ky` được nối thêm UTM của lượt truy cập và `lp=<đường dẫn>`. Form trong landing gửi vào `/api/public/leads` như form đăng ký cũ → lead vào CRM kèm nguồn.
- Danh sách landing hiện **lượt xem và số lead 30 ngày** của từng trang.

## An toàn

- Nội dung chỉ là chữ, ảnh, liên kết — **không** nhận HTML / script. Mọi chữ được escape khi hiển thị; liên kết chỉ nhận `https://`, `/đường-dẫn`, `#mốc`, `tel:`, `mailto:` (không `javascript:`, `data:`); ảnh phải tải lên từ thư viện ảnh website hoặc `https://`. Có test (`landing.test.ts`).
- HTML sinh ra không chứa `<script>` nên chạy đúng với CSP theo nonce; tương tác (form, gắn UTM) do thành phần React lo.
- Quyền: xem = `site:read`, sửa / xuất bản = `site:update` (nhóm Marketing, Quản trị). Mọi thay đổi ghi nhật ký (module `site`, entity `landing_page`).
- Hai người cùng sửa: lưu sau sẽ báo “vừa được người khác sửa — tải lại”, không ghi đè.
- Đường dẫn đã từng xuất bản thì khoá (tránh gãy liên kết); muốn đổi hãy nhân bản.

## Màu và giao diện

Màu lấy tự động từ **Cài đặt hệ thống → Nhận diện thương hiệu** (đổi logo / màu là mọi landing đổi theo, kể cả khi tải HTML lại). Ba kiểu giao diện: Cổ điển, Dịu, Nổi bật.

## Kỹ thuật

| Phần | Vị trí |
|---|---|
| Mô hình, kiểm tra, mẫu, hiển thị HTML + CSS | `packages/core/src/landing/` (có test) |
| Bảng `landing_pages`, `landing_page_history` | `packages/db/src/schema/growth.ts` (chạy `pnpm db:push`) |
| Dịch vụ + tRPC `landing.*` | `packages/api/src/services/landing.ts`, `routers/growth.ts` |
| Trang công khai `/lp/[slug]`, trang chủ `/` | `apps/web/src/app/lp`, `app/page.tsx`, `components/landing/` |
| Quản trị `/landing`, `/landing/[id]` | `apps/web/src/app/(admin)/landing/` |
| Tải HTML | `apps/web/src/app/api/landing/[id]/export/route.ts` |

## Chưa làm (có thể bổ sung)

- Khối “Chương trình” tự lấy từ danh sách khoá / giá thật trong hệ thống (hiện nhập tay).
- Thử nghiệm A/B hai phiên bản; xem trước trước khi xuất bản bằng liên kết riêng.
- Xuất ZIP kèm ảnh (hiện tệp HTML trỏ ảnh về hệ thống).

## Trang chủ TH STEAM Academy (19/10/2026)

Trang chủ viết lại cho TH STEAM Academy (`HOME_PAGE`, `template = "trang-chu-thsteam"`), giữ bố cục theo trang mẫu Teky nhưng toàn bộ chữ lấy từ
danh mục chương trình chuẩn và bộ nhận diện: 4 chuyên ngành, học online qua ClassIn, lớp 6–8 học sinh, buổi 90 phút, 6 năng lực + 3 phẩm chất,
buổi báo cáo mỗi 15 buổi, giảng viên Thầy Phan Thành Toại, 4 bước đăng ký, hỏi đáp theo điều khoản đăng ký học. Không có số liệu thành tích, không
ghi "miễn phí", không nêu học phí; phản hồi phụ huynh tắt. Nút chính màu Cosmic Gold chữ navy theo bộ nhận diện. Nạp / xuất bản: `pnpm db:seed-thsteam`.
Các mục dưới đây là lịch sử bản Sata Robo trước đó.

## Trang chủ người dùng (bản chữ "kaizen" — Sata Robo, đã thay)

Nội dung trang chủ nằm ở `packages/core/src/landing/home.ts` (`HOME_PAGE`), dựa trên satarobo.vn. Tạo bản nháp bằng `pnpm db:seed-home`
(chỉ tạo NHÁP đường dẫn `trang-chu`, không xuất bản, không ghi đè nếu đã có). Quản trị vào Website → Landing page → xem trước, sửa chữ, **Xuất bản**
thì khách chưa đăng nhập vào `/` sẽ thấy trang này.

Nguyên tắc chữ: giữ thông tin thật của trang cũ (2 cơ sở, hotline, chương trình, học thử 1-1 = 45 phút kiểm tra đầu vào + 90 phút học, lớp ≤ 12 bé);
bỏ phần lặp (20 thẻ phản hồi lặp 4 lần, hai danh sách chân trang) và chữ giữ chỗ (0+, ≤0, 0.000.000đ); không viết các khẳng định đang mâu thuẫn hoặc chưa có
nguồn (độc quyền / duy nhất tại Đà Nẵng, tư vấn 24/7, ban tổ chức cuộc thi, hạn hoàn tiền Sata8). Số liệu 1000+ / 98% / 50+ / 4,9/5 giữ như trang cũ theo
quyết định của chủ dự án — chủ dự án chịu trách nhiệm số đúng. Trang chủ KHÔNG nêu chính sách hoàn tiền. Phản hồi phụ huynh tắt cho tới khi có lời thật được phép đăng — **đã đổi (10/10/2026)**: xem mục dưới.

### Bố cục theo trang mẫu edtech.teky.edu.vn (10/10/2026)

Thứ tự các phần học theo trang đích của Teky (15 phần, nhiều nút "Học thử miễn phí"): hero → 4 số liệu → vì sao chọn → khoá học → suất học thử → giá trị cho gia đình
→ hành trang cho con → kêu gọi → lộ trình theo cấp lớp → cách bắt đầu → hệ sinh thái → phản hồi phụ huynh → đội ngũ giáo viên → học viên tiêu biểu → hỏi đáp → form.
Chỉ học **cấu trúc**; không chép chữ và không chép khẳng định của Teky (số 1, chứng chỉ quốc tế, đại diện độc quyền, ưu đãi theo tuần…). Hệ thống chỉ có một form
mỗi trang nên mọi nút "Học thử / Đăng ký" cuộn tới form cuối trang.
Ba khối **phản hồi phụ huynh, đội ngũ giáo viên, học viên tiêu biểu** là chữ mẫu có "[DEMO]" (xuất bản sẽ có cảnh báo). Thay bằng nội dung thật, đã được đồng ý đăng.
Nạp lại bản nháp bằng chữ mới: `pnpm db:seed-home --lam-moi` (chỉ khi trang chưa xuất bản).

## Landing chạy quảng cáo (20/10/2026)

Năm trang dựng sẵn từ danh mục chương trình chuẩn (`packages/core/src/landing/ads.ts`), xuất bản khi chạy `pnpm db:seed-thsteam`:

| Đường dẫn | Nhóm quảng cáo | Từ khoá chính |
| --- | --- | --- |
| `/lp/hoc-cong-nghe-online` | Thương hiệu / chung | khóa học công nghệ cho trẻ em, học lập trình cho trẻ online |
| `/lp/robotics-ai-cho-tre` | Robotics AI 8–10 tuổi | khóa học robotics cho trẻ em, học lập trình robot online |
| `/lp/tri-tue-nhan-tao-ai-cho-hoc-sinh` | AI 8–14 tuổi | khóa học AI cho học sinh, học trí tuệ nhân tạo cho trẻ em |
| `/lp/thiet-ke-do-hoa-ai-cho-hoc-sinh` | Đồ họa 3D, Photoshop | học thiết kế đồ họa cho học sinh, khóa học photoshop cho học sinh |
| `/lp/lap-trinh-ai-cho-tre-em` | Lập trình 8–18 tuổi | khóa học lập trình cho trẻ em, học scratch / python online |

**Bố cục:** Mở đầu + form 4 ô (H1 chứa từ khoá; điện thoại: form ngay dưới tiêu đề) → Vì sao chọn → Lộ trình → Con học gì từng năm
→ Phần mềm thật (ảnh chụp có ghi nguồn) → Học online trực tiếp → Học phần 15 buổi → Dải kêu gọi → Báo cáo cuối khoá → 6 năng lực
→ Đồng hành phụ huynh → Giảng viên → Bắt đầu thế nào → Hỏi đáp → Form cuối trang → Chân trang. Trên điện thoại có thanh
"Gọi / Đăng ký học thử" cố định ở đáy màn hình.

**Khối mới** (dùng được cho mọi landing trong Website → Landing page): Mở đầu + form (quảng cáo), Lộ trình học, Phần mềm / công cụ,
Ảnh + nội dung, Giảng viên. Trang có khối "Mở đầu + form" thì form cuối trang cũng dùng form gọn.

**Form gọn:** Họ tên phụ huynh · SĐT/Zalo (kiểm số Việt Nam) · Lớp của con · Chuyên ngành quan tâm (trang chuyên ngành chọn sẵn) ·
ô đồng ý xử lý dữ liệu (bắt buộc, không đánh dấu sẵn — Nghị định 13/2023). Lead vào CRM kèm UTM, trang đích đầy đủ (gclid, fbclid,
utm_term, utm_content nằm trong `landing_page`), mã sự kiện; chuyên ngành và từ khoá ghi vào ghi chú lead.

**SEO:** title ≤ 60 ký tự, description 120–160 ký tự, canonical, Open Graph + Twitter với ảnh 1200×630 (`/lp-anh/og-*.png`),
một H1, ảnh có width/height + alt, ảnh đầu trang tải ưu tiên, còn lại tải lười. JSON-LD: EducationalOrganization, WebPage,
BreadcrumbList, FAQPage, Course (Google đã ngừng hiện thẻ khoá học từ 09/2025 và chỉ hiện FAQ cho một số trang chính phủ / y tế —
dữ liệu vẫn giúp máy tìm kiếm hiểu trang). Các landing `ads-*` có trong `sitemap.xml`.

**Đo lường quảng cáo:** Marketing → Cấu hình tracking: Meta Pixel ID, GA4 Measurement ID, Google Ads ID (AW-…) + nhãn chuyển đổi.
Có ID thì trang công khai tự gắn thẻ (đoạn mồi có nonce CSP); form gửi thành công bắn `Lead` (Meta), `generate_lead` (GA4) và
`conversion` (Google Ads) cùng một `eventID`. CSP đã mở connect-src / frame-src cho Google, Meta (tắt bằng `adsTags:false`).
Meta Conversions API phía máy chủ chưa làm.

**Ảnh:** tranh minh hoạ vector (`apps/web/public/lp-anh/*.svg`, sinh bằng `gen/art_lp*.py`; nhân vật vẽ, không phải ảnh trẻ em
thật); ảnh chụp phần mềm lấy từ bộ slide chương trình, ghi nguồn dưới mỗi ảnh (`/lp-anh/that/*.webp`): Scratch (AGPL-3.0),
Roblox Creator Docs (CC BY 4.0), MIT App Inventor (Apache-2.0), Raspberry Pi/Thonny (CC BY-SA 4.0), MDN (CC BY-SA 2.5),
Bootstrap (MIT), WordPress (GPL-2.0) — giấy phép mở; ảnh của Autodesk Tinkercad, Adobe, WhalesBot, CreatiCode và ảnh thể lệ
Cuộc thi Sáng tạo Robotics là ảnh giới thiệu của chủ sở hữu — nên xin phép hoặc thay bằng ảnh chụp màn hình lớp học của trung tâm
trước khi chạy quảng cáo lớn. Ảnh và chứng chỉ của giảng viên do trung tâm cung cấp. Kích thước ảnh: `landing/media.ts`
(sinh bằng `gen/media_manifest.py`).

**Sửa nội dung:** sửa trong Website → Landing page rồi Xuất bản. Trang đã sửa tay sẽ KHÔNG bị `db:seed-thsteam` ghi đè;
muốn dựng lại từ danh mục: `pnpm db:seed-thsteam -- --lp-moi`.
