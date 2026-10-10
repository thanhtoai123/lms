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
