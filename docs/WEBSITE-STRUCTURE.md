# Cấu trúc website công khai

Khung website của Sata Robo: mọi trang công khai dựng bằng **bộ khối** (Website → Landing page), dùng chung **một đầu trang + một chân trang**.
Nội dung hiện là bản **DEMO** (mỗi khối có chữ `[DEMO]`); thay chữ thật rồi bấm Xuất bản từng trang.

## Sơ đồ trang

| Đường dẫn | Slug trang dựng khối | Ghi chú |
|---|---|---|
| `/` | `trang-chu` | Trang chủ (khách chưa đăng nhập). Nội dung kaizen: `packages/core/src/landing/home.ts` |
| `/gioi-thieu` | `gioi-thieu` | Giới thiệu |
| `/khoa-hoc` | `khoa-hoc` | Danh sách khoá học |
| `/khoa-hoc/<x>` | `khoa-hoc-<x>` | Chi tiết từng khoá (demo: `lap-trinh-robot`, `luyen-thi-robosim`, `hoc-online`) |
| `/lien-he` | `lien-he` | Liên hệ |
| `/chinh-sach/<x>` | `chinh-sach-<x>` | Chính sách (demo: `bao-mat`, `dieu-khoan`) |
| `/tin-tuc`, `/tuyen-dung`, `/dang-ky` | — | Trang hệ thống (quản lý ở Tin tức, Tuyển dụng, Nội dung trang) nhưng dùng cùng đầu/chân trang |

Đường dẫn công khai suy ra từ slug (`packages/core/src/site/map.ts`, hàm `sitePathOf`). Trang site không đổi slug được.
Landing quảng cáo `/lp/<slug>` vẫn có đầu / chân trang riêng.

## Khung chung (đầu trang & chân trang)

Lưu một lần ở `app_settings` khoá `site_chrome` (điện thoại, nút chính, menu ≤ 6, giới thiệu ngắn, email, pháp nhân, bản quyền, địa chỉ ≤ 4, liên kết chân trang ≤ 12).
Áp dụng lúc hiển thị (`applyChrome`), nên sửa menu / địa chỉ **không** cần xuất bản lại từng trang. Sửa tại **Website → Cấu trúc & khung**.
Trong trình soạn, khối Đầu trang / Chân trang của trang site hiển thị “dùng chung” và dẫn sang trang này.

## Quản trị

- **Website → Cấu trúc & khung** (`/website`): sơ đồ trang + trạng thái, “Tạo các trang demo còn thiếu”, “+ Thêm khoá học”, “+ Thêm trang chính sách”, sửa khung chung.
- Quyền: `site:read` xem, `site:update` sửa. Nhật ký: module `site`, entity `landing_page` / `site_chrome`.
- Xuất bản trang còn `[DEMO]` vẫn được nhưng hệ thống cảnh báo.

## Khởi tạo dữ liệu

```
pnpm db:seed-home        # bản nháp trang chủ kaizen
pnpm db:seed-site        # dev: tạo + xuất bản 8 trang demo; production: chỉ nháp (hoặc --draft / --publish)
```
Chạy lại an toàn (trang đã có thì giữ nguyên).

## SEO

`/sitemap.xml` (trang đã xuất bản + bài tin + tin tuyển dụng đang mở; cần `NEXT_PUBLIC_APP_URL`) và `/robots.txt` (chặn khu quản trị và cổng).
