# Chuẩn hoá hệ thống theo TH STEAM Academy

Hệ thống chuyển hẳn sang thương hiệu **TH STEAM Academy** (thay hoàn toàn Sata Robo). Có bốn phần: nhận diện thương hiệu,
khung chương trình đào tạo, học bạ theo chương trình chuẩn và website. Mọi số buổi, độ tuổi, tên cuộc thi, học phí lấy từ
**một nguồn**: danh mục chuẩn trong `packages/core/src/curriculum/`, sinh từ 8 bộ slide chương trình đã duyệt.

Lệnh chuyển đổi (chạy lại an toàn, không xoá dữ liệu):

```
pnpm db:seed-thsteam            # nhận diện + danh mục chuẩn + ngừng bán danh mục cũ + website (xuất bản khi không phải production)
pnpm db:seed-thsteam --giu-cu   # giữ các khoá cũ đang bán
pnpm db:seed-thsteam --nhap     # website chỉ ghi nháp
```

Màn quản trị: **Chương trình & học liệu → Khung chương trình chuẩn** (`/khung-chuong-trinh`).

## 1. Nhận diện thương hiệu

| Mục | Giá trị | Ở đâu |
| --- | --- | --- |
| Tên | TH STEAM Academy (wordmark TH STEAM ACADEMY) | `TH_BRAND` (`packages/core/src/system/th-brand.ts`) |
| Pháp nhân | Trung tâm Đào tạo Tin học AI & Công nghệ TH STEAM | chân trang, Cài đặt chung |
| Tagline | IGNITING FUTURE INNOVATION — Thắp lửa đổi mới cho tương lai | |
| Liên hệ | Hotline 0971 29 30 31 · thsteam.edu.vn · Fanpage TH STEAM ACADEMY | học online nên không có địa chỉ cơ sở |
| Màu | Deep Ocean Blue `#1D4ED8` (đậm `#1E40AF`), Emerald `#10B981`, Cosmic Gold `#F59E0B` (Amber `#D97706`), Midnight Navy `#0F172A`, trắng, Slate `#F8FAFC` | `BRAND_DEFAULT_COLORS`, `globals.css`, `landingCss()` |
| Phông | Plus Jakarta Sans (`--font-brand`) | `apps/web/src/app/layout.tsx` |
| Logo | `apps/web/public/thsteam/` — biểu tượng, logo ngang / đứng (bản màu và bản nền tối), app icon; chữ đã chuyển nét | `icon.svg` = biểu tượng TH |
| Giấy chứng nhận | Nền mặc định `mau-chung-nhan/th-steam-mac-dinh.svg` (A4 ngang, viền vàng kép, dấu triện); số hiệu `TH-…` | `certificates/rules.ts` |

Quy tắc giao diện: nút kêu gọi chính màu Cosmic Gold chữ navy; chữ navy trên nền trắng; vàng chỉ để nhấn. Ảnh minh hoạ
website (`apps/web/public/anh-site/`) là vector chỉ dùng màu trong bảng màu (kiểm bằng test `home.test.ts`).

## 2. Khung chương trình

```
Chuyên ngành (4) → Chương trình theo cấp học (9) → Năm học = khoá học (45 buổi) → Học phần (3 × 15 buổi) → Buổi (90 phút)
                                                  + Khoá luyện thi tự chọn, học thêm sau năm học (10 khoá)
```

| Chuyên ngành | Tiểu học 8–10 | THCS | THPT 15–18 |
| --- | --- | --- | --- |
| Lập trình Robotics AI | RoboSim → RoboVR · 2 năm học | Chưa mở | Chưa mở |
| Trí tuệ nhân tạo AI | AI for kids · 1 năm học | AI for teen 11–14 · 1 năm học | Chưa mở |
| Thiết kế đồ họa AI | Tinkercad · 1 năm học | Photoshop 11–14 · 1 năm học | Chưa mở |
| Lập trình & phát triển ứng dụng AI | Scratch → CreatiCode AI · 2 năm học | Roblox Lua → App Inventor 11–13; Python → Lập trình web 13–15 | Web full-stack → WordPress · 2 năm học |

- Mỗi học phần: buổi 1–4 và 6–12 học và làm dự án; **buổi 5 ôn tập**; **buổi 13–14 dự án cuối học phần** (lên ý tưởng, demo);
  **buổi 15 báo cáo trước phụ huynh** — đây là **mốc học bạ** (`reportCardMilestones(45) = [15, 30, 45]`).
- Học online qua ClassIn, lớp nhóm 6–8 học sinh hoặc kèm 1:1, 90 phút/buổi, 1 buổi/tuần.
- Khoá luyện thi: tên "Luyện thi: <cuộc thi>", 15 buổi (Robotics, AI, Đồ họa) hoặc 30 buổi (Lập trình) — đúng như bộ slide.

### Trong CSDL

Khoá khớp với danh mục qua **mã khoá** (không thêm cột):

| Loại | Mã | Ví dụ |
| --- | --- | --- |
| Năm học | `<chương trình>-N<năm>` | `ROBO-TH-N1`, `CODE-THCS1-N2` |
| Luyện thi | `<chương trình>-THI-<cuộc thi>` | `ROBO-TH-THI-STR`, `CODE-THPT-THI-TNTHPT` |

`syncThSteamCatalog` (`packages/db/src/thsteam-sync.ts`, dùng chung cho lệnh và nút "Đồng bộ danh mục chuẩn"):

- Khoá: tạo / cập nhật tên, mô tả, số buổi, lớp ở trường (6 tuổi = lớp 1), học phí niêm yết; nối **khoá tiếp theo** Năm 1 → Năm 2.
- Giáo trình "Chuẩn TH STEAM 2026–2027" là giáo trình đang dùng; đủ 45 buổi với tên buổi theo học phần
  ("HP1 · Basic — Làm quen robot ảo · bài 1", "Ôn tập", "Dự án cuối học phần", "Báo cáo học phần"), buổi 15/30/45 đánh dấu mốc học bạ.
  Buổi đã có chỉ được cập nhật chữ, không xoá.
- Tiêu chí học bạ: thêm tiêu chí còn thiếu; mô tả 3 mức chỉ điền khi tiêu chí chưa có mô tả đúng thang (không đè chỉnh sửa tay).
- Gói học phí (lớp nhóm, kèm 1:1) và lộ trình chứng nhận cho từng chương trình (năm học bắt buộc, luyện thi tự chọn).
- Tuỳ chọn "ngừng bán" khoá / gói / lộ trình ngoài danh mục: chỉ đặt `is_active = false`, lớp và học bạ cũ vẫn xem được.

### Học phí năm học 2026–2027 (giống nhau ở 4 chuyên ngành)

| Gói | Niêm yết | Ưu đãi | Học phí |
| --- | --- | --- | --- |
| Lớp nhóm · 1 năm học (45 buổi) | 7.500.000đ | −25% | 5.625.000đ |
| Lớp nhóm · combo 2 năm học | 15.000.000đ | −35% | 9.750.000đ |
| Kèm 1:1 · 1 năm học | 22.500.000đ | −15% | 19.125.000đ |
| Kèm 1:1 · combo 2 năm học | 45.000.000đ | −15% | 38.250.000đ |
| Luyện thi 15 buổi / 30 buổi | 3.000.000đ / 6.000.000đ (1:1: 9.000.000đ / 18.000.000đ) | | chưa gồm lệ phí dự thi |

Ưu đãi "đăng ký trong 15 phút" và thông tin chuyển khoản của bộ slide **không** đưa vào hệ thống.

## 3. Học bạ theo chương trình chuẩn

- 6 năng lực (Tư duy: Tư duy công nghệ, Tư duy phản biện · Kỹ năng số: Kỹ năng vi tính, Tiếng Anh chuyên ngành ·
  Bản lĩnh: Tự tin, trình bày; Tự chủ, hành vi số) + 3 phẩm chất (Chăm chỉ, Trách nhiệm, Trung thực).
- **Thang 3 mức ở mọi nơi**: 1 Cần cố gắng · 2 Đạt · 3 Tốt (như Thông tư 27/2020). `RUBRIC_SCALE = 3`, `RUBRIC_VERSION = "2026.10-thsteam"`.
- Mô tả 3 mức của từng tiêu chí lấy từ bảng "Con thay đổi gì sau mỗi năm học" của từng chương trình
  (Cần cố gắng = trước khi học, Đạt = sau năm 1, Tốt = sau năm 2) — `programCriteria(p)`.
- Phiếu buổi / học bạ cũ chấm thang 4 **giữ nguyên nhãn cũ** khi xem lại (mỗi bản chụp nhớ thang của nó); khi tổng hợp,
  điểm được quy đổi tuyến tính sang thang mới (`convertScore`), xếp loại cuối khoá quy về thang 5 trong SQL theo `rubric_scale`.
- Xếp loại hoàn thành khoá: Hoàn thành tốt / Hoàn thành. Giấy chứng nhận học phần ghi cấp độ Basic / Advanced / Expert.

## 4. Website

Nội dung dựng từ danh mục + bộ nhận diện (`packages/core/src/site/thsteam-content.ts`), không còn chữ "[DEMO]" trừ chính sách bảo mật.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang chủ theo cấu trúc trang mẫu Teky: hero, thông số thật (4 chuyên ngành, 8–18 tuổi, lớp 6–8, 45 buổi), vì sao chọn, 4 chuyên ngành, học trải nghiệm 1:1, 6 năng lực, buổi 90 phút, lộ trình theo cấp học, 4 bước đăng ký, đồng hành phụ huynh, giảng viên, buổi báo cáo, hỏi đáp, form. Không nêu học phí, không ghi "miễn phí". |
| `/gioi-thieu` | Ý nghĩa thương hiệu, giá trị cốt lõi, chuẩn đào tạo (GDPT 2018, TT 02/2025, QĐ 2422), giảng viên |
| `/khoa-hoc` | 4 chuyên ngành, lộ trình 4 × 3 cấp học ("Chưa mở" đúng chỗ), học phần 15 buổi, buổi 90 phút, **bảng học phí** (`#hoc-phi`) |
| `/khoa-hoc/robotics-ai`, `/tri-tue-nhan-tao-ai`, `/thiet-ke-do-hoa-ai`, `/lap-trinh-ung-dung-ai` | Chương trình theo cấp học, từng năm học → 3 học phần (con học / sản phẩm / con làm được), luyện thi, con thay đổi gì, 6 năng lực, buổi báo cáo, hỏi đáp |
| `/lien-he` | Hotline, website, fanpage, cách phản ánh (phản hồi 24 giờ, xử lý 5 ngày làm việc), form |
| `/chinh-sach/dieu-khoan` | Điều khoản đăng ký học (8 mục của bộ slide) |
| `/chinh-sach/bao-mat` | **Bản nháp** `[DEMO]` — cần người có thẩm quyền duyệt |
| `/dang-ky` | "Đăng ký học trải nghiệm 1:1" (lớp 1–12) |

Trang khoá học cũ (`khoa-hoc-lap-trinh-robot`, `-luyen-thi-robosim`, `-hoc-online`) chuyển "lưu trữ", không xoá; bản cũ của
mọi trang vẫn nằm trong lịch sử xuất bản (Website → Landing page → Lịch sử).

## 5. Dữ liệu mẫu làm mới (10/2026)

Cơ sở dữ liệu phát triển được **xoá sạch và nạp lại** chỉ với dữ liệu TH STEAM (sao lưu bản cũ trước khi xoá:
`sao-luu\satarobo-truoc-th-<ngày>.dump` trên máy chạy hệ thống). Lệnh làm lại từ đầu:

```
ALLOW_DB_RESET=1 pnpm db:reset && pnpm db:push && pnpm db:apply-sql && pnpm db:seed && pnpm db:seed-thsteam
```

- **Một trung tâm** `TH` (TH STEAM Academy, mặc định) với **một cơ sở online** `ONL` — "TH STEAM Academy Online",
  học qua ClassIn; phòng học là phòng ClassIn `CI01…CI11` (8 chỗ). Không còn chuỗi / nhượng quyền / cơ sở 2 mẫu.
- **Danh mục chuẩn** (24 khoá, 9 lộ trình, gói học phí) do `syncThSteamCatalog` tạo; lớp mẫu dùng mã khoá chuẩn
  (`ONL.ROBO-TH-N1.26.001` …), 1 buổi/tuần, 45 buổi/năm học, mốc học bạ 15 / 30 / 45, thang 3 mức.
- Ca làm việc: `OLT` dạy online buổi tối, `OLC` cuối tuần, `OLS` sáng + tối, `VPO` văn phòng + trực lớp online.
- Tính năng vận hành offline (kho, nhượng quyền, chấm công, xu thưởng…) **giữ nguyên**, chỉ đổi tên: "SataCoin" → **TH Coin**
  (`/th-coin`, liên kết cũ `/satacoin` tự chuyển), nội dung chuyển khoản `THSTEAM …`, mã trung tâm mặc định `TH`.
- Dữ liệu mẫu chỉ dùng tên giả ("Học viên mẫu 1", "Phụ huynh mẫu 1", "GV Minh (mẫu)"), email `@example.test`.
- Link xem thử không cần đăng nhập: `/hs/xem-thu-ho-so-hoc-tap-th-steam-mau`, `/cn/xem-thu-giay-chung-nhan-th-steam-mau`,
  `/pdg/xem-thu-phieu-danh-gia-th-steam-mau`.
- Tên kỹ thuật nội bộ giữ nguyên để không phá cấu hình: gói `@satarobo/*`, CSDL `satarobo`, vai trò `satarobo_app`, khoá module `satacoin`.

## 6. Điểm cần chủ trung tâm xác nhận

1. Công khai bảng học phí trên `/khoa-hoc` (đang hiện) hay chỉ gửi khi tư vấn.
2. Số buổi khoá luyện thi Lập trình: 30 buổi (theo bộ slide) so với 15 buổi ở các chuyên ngành khác.
3. Độ tuổi: bộ nhận diện ghi 6–17 tuổi, danh mục chương trình hiện 8–18 tuổi; AI / Đồ họa THCS 11–14, Lập trình THCS 11–13 và 13–15 (chồng ở 13 tuổi).
4. Văn bản chính sách bảo mật chính thức.
5. Liên kết fanpage, email liên hệ (đang để trống), ảnh giảng viên và ảnh lớp học thật (đã được đồng ý) để thay hình minh hoạ.

## Kiểm thử

`packages/core/src/curriculum/thsteam.test.ts` (danh mục, 45 buổi, mốc học bạ, luyện thi, tiêu chí, gói học phí, lộ trình),
`portfolio/*.test.ts` (thang 3, đọc phiếu thang 4 cũ), `site/site.test.ts` (trang con, chuyên ngành, bảng học phí),
`landing/home.test.ts` (trang chủ, liên hệ thật, không "miễn phí", ảnh đúng bảng màu).
