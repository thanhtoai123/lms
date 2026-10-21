# DESIGN.md — Website TH STEAM Academy (trang chính)

Hướng thiết kế: **"sáng, rõ, như một sản phẩm thật"** — nhiều khoảng trắng, chữ lớn đậm, ảnh thật (ảnh chụp / ảnh AI bối cảnh
và ảnh màn hình phần mềm) thay cho tranh vẽ, bố cục đổi nhịp giữa các khối (không khối nào cũng là 3–6 thẻ giống nhau).
Tham khảo cách trình bày của brilliant.org (EdTech: tiêu đề lớn, ảnh sản phẩm trong khung bo tròn, tab dạng viên thuốc,
thanh menu nổi) — chỉ học cách bố cục, giữ nguyên bộ nhận diện TH STEAM. Không dựa trên thư viện UXKIN (chưa kết nối).

Áp dụng cho trang chính qua kiểu giao diện `studio` (`.lp--studio` trong `packages/core/src/landing/render.ts`);
landing quảng cáo `/lp/...` giữ kiểu cũ cho tới khi duyệt.

## Màu (chỉ dùng bảng màu bộ nhận diện)

| Token | Giá trị | Vai trò |
|---|---|---|
| `--th-ink` | #0F172A Midnight Navy | Tiêu đề, chữ chính, nền khối tối, chân trang |
| `--th-text` | #475569 | Chữ thân |
| `--th-muted` | #64748B | Chú thích, nguồn |
| `--th-line` | #E2E8F0 | Viền, đường kẻ |
| `--th-bg` | #FFFFFF | Nền trang |
| `--th-bg-soft` | #F8FAFC | Nền khối xen kẽ |
| `--th-blue` | #1D4ED8 Deep Ocean Blue | Màu chính: liên kết, tab đang chọn, chữ nhấn trong tiêu đề, biểu tượng |
| `--th-blue-ink` | #1E40AF | Chữ xanh trên nền nhạt (tương phản ≥ 4.5:1) |
| `--th-blue-tint` | #DBEAFE | Nền khung ảnh, ô biểu tượng |
| `--th-green` | #10B981 Emerald | Dấu ✓, "sau khi học", trạng thái tốt |
| `--th-green-ink` | #047857 | Chữ xanh ngọc trên nền trắng |
| `--th-green-tint` | #D1FAE5 | Nền khung ảnh, ô biểu tượng |
| `--th-gold` | #F59E0B Cosmic Gold | CHỈ nút hành động chính và con số nổi bật trên nền tối |
| `--th-gold-ink` | #B45309 | Chữ vàng trên nền sáng (nhãn nhỏ) |
| `--th-gold-tint` | #FEF3C7 | Nền nhãn nhỏ |

Không gradient tím–xanh, không chữ gradient, không kính mờ (trừ thanh menu nổi), không emoji làm biểu tượng.
Trang không có chế độ tối.

## Chữ

Một họ chữ: **Plus Jakarta Sans** (đã tự host qua next/font). Thân chữ 17px, dòng 1.65, tối đa ~68 ký tự mỗi dòng.

| Cỡ | Máy tính / điện thoại | Dòng | Độ đậm | Dùng cho |
|---|---|---|---|---|
| display | 60 / 36 px | 1.05 | 800, -0.03em | H1 |
| h2 | 44 / 28 px | 1.12 | 800, -0.02em | Tiêu đề khối |
| h3 | 22 / 19 px | 1.3 | 700 | Tiêu đề thẻ, tab |
| lead | 20 / 18 px | 1.55 | 500 | Câu dẫn dưới tiêu đề |
| body | 17 / 16 px | 1.65 | 400–500 | Đoạn văn |
| small | 14 px | 1.5 | 500 | Chú thích, nhãn |
| kicker | 13 px | 1.2 | 800, IN HOA, +0.14em | Dòng nhỏ trên tiêu đề |

Nhấn trong tiêu đề: một cụm từ màu `--th-blue` (không gạch chân, không gradient).

## Khoảng cách, khung

- Thang 8: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 120.
- Khoảng cách giữa các khối: 120px máy tính, 72px điện thoại. Khung nội dung tối đa 1200px, lề 24px (điện thoại 20px).
- Đầu khối căn trái (trừ khối kêu gọi cuối trang); tiêu đề tối đa 760px.

## Hình khối, độ sâu

- Bo góc: 12 (ô nhỏ, ô nhập) · 20 (thẻ) · 28 (khung ảnh lớn) · 999 (nút, nhãn, tab).
- Bóng: `--th-shadow-sm` 0 1px 2px rgba(15,23,42,.06) cho thẻ; `--th-shadow-lg` 0 24px 60px -24px rgba(15,23,42,.28)
  CHỈ cho phần nổi lên (thanh menu, form, chip trên ảnh). Thẻ thường: viền 1px `--th-line`, không bóng lớn.

## Thành phần

- **Nút chính:** nền vàng, chữ navy 700, cao 52px, bo 999; hover đậm hơn (#D97706); focus viền 3px xanh dương.
- **Nút phụ:** nền trắng, viền navy 1.5px, chữ navy. **Nút nhẹ:** chữ xanh dương + mũi tên.
- **Thanh menu:** viên thuốc trắng nổi, cách mép trên 12px, bóng lớn, mờ nền nhẹ; điện thoại: logo + nút ☰.
- **Ô nhập:** cao 52px, bo 12, viền #CBD5E1, focus viền xanh + vòng 3px #DBEAFE; lỗi đỏ #B91C1C kèm chữ.
- **Tab:** rãnh nền `--th-bg-soft`, tab chọn là viên trắng có bóng nhỏ, chữ navy.
- **Thẻ:** nền trắng, viền 1px, bo 20, đệm 28px; ô biểu tượng 48px bo 14 nền tint.
- **Khối tối:** nền navy, số vàng lớn, chữ trắng 78%.
- **Chân trang:** nền navy, logo chữ trắng.

## Ảnh và biểu tượng

- Ảnh bối cảnh (ảnh AI do trung tâm tạo theo bộ lệnh): góc học ở nhà, bàn học, laptop, điện thoại phụ huynh — không trẻ em
  nhìn rõ mặt, không chữ, không logo. Khung bo 28, `object-fit: cover`, có width/height, ảnh đầu trang tải ngay.
- Ảnh màn hình phần mềm: trong khung cửa sổ trình duyệt (thanh 3 chấm), ghi nguồn + giấy phép dưới ảnh.
- Biểu tượng: một bộ nét 1.9px (đã có trong render.ts), trong ô tint.
- Bỏ tranh vector nhân vật khỏi trang chính.

## Chuyển động

Hiện dần khi cuộn (CSS `animation-timeline: view()`), tab chuyển mờ dần 300ms; tắt hết khi máy bật "giảm chuyển động".
