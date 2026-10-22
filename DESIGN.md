# DESIGN.md — Website TH STEAM Academy (trang chính)

Hướng thiết kế (21/10/2026): **"sắc màu"** — kiểu giao diện `vivid` (`.lp--vivid` trong `packages/core/src/landing/render.ts`).
Bản `studio` trước đó (trắng, tối giản) bị đánh giá là nhạt; giữ lại trong bộ dựng nhưng trang chính không dùng nữa.

## Tham khảo: Teky, MindX (xem trực tiếp 21/10/2026)

| Điều phụ huynh Việt quen thấy | Teky / MindX làm | TH STEAM làm |
|---|---|---|
| Màu thương hiệu phủ mảng lớn | MindX đỏ, Teky xanh ngọc cả đầu trang | Đầu trang và dải kêu gọi phủ Deep Ocean Blue #1D4ED8 |
| Tiêu đề khối căn giữa, chữ đậm | Có | Có, câu dẫn ≤ 680px |
| Thẻ khoá học có màu + độ tuổi | MindX: ảnh trên nền màu + nút mũi tên | 4 thẻ chọn chuyên ngành 4 màu, biểu tượng, độ tuổi; bảng chi tiết trắng bên dưới |
| Dải số liệu nền tối | Teky: thẻ đen | Tấm navy bo 32px, số vàng, **mọi số có nguồn** |
| Ảnh học sinh thật | Rất nhiều | **Chưa có ảnh có đồng ý** → dải ảnh sản phẩm thật làm bằng phần mềm con học (game Roblox, robot RoboVR, AI, nhà 3D) |
| Nút đăng ký lặp lại | Có | Form đầu trang, dải kêu gọi, form cuối, thanh cố định trên điện thoại |

Không chép: bố cục banner trượt, số liệu không nguồn ("300.000+ dự án", "96% có việc làm"), chữ "hàng đầu".

## Điểm nhớ duy nhất

**Quỹ đạo vàng của logo**: đường cong vàng trên nền xanh đầu trang, nét gạch dưới cụm từ nhấn (`*cụm từ*` trong tiêu đề),
lặp lại ở dải kêu gọi; ngôi sao 4 cánh vàng làm điểm chấm. Mọi thứ khác giữ yên: thẻ trắng viền mảnh, ít bóng.

## Màu (chỉ bảng màu nhận diện)

| Vai trò | Màu |
|---|---|
| Mảng đầu trang, dải kêu gọi, thẻ Robotics | #1D4ED8 (chữ xanh trên nền nhạt: #1E40AF) |
| Tấm số liệu, thẻ Lập trình, chân trang | #0F172A |
| Thẻ Trí tuệ nhân tạo, "sau khi học", dấu ✓ | #047857 / #10B981, nền #D1FAE5 |
| Nút chính, quỹ đạo, ngôi sao, viền trên form, số trên nền tối | #F59E0B (hover #D97706), thẻ Đồ họa nền #FEF3C7 |
| Nền xen kẽ / form cuối | #F8FAFC / #DBEAFE |
| Chữ thân, chú thích, viền | #475569, #64748B, #E2E8F0 |

## Chữ

Plus Jakarta Sans (một họ). H1 36–58px / 800 / -0.025em; H2 29–43px / 800; thân 17px, dòng 1.65.
Dòng nhỏ trên tiêu đề: viên thuốc nền #DBEAFE, **viết thường** (không IN HOA giãn chữ).

## Bố cục từng khối

1. Đầu trang: thanh trắng, logo ngang, menu, hotline xanh, nút vàng.
2. Mở đầu: nền xanh; trái = nhãn, H1 trắng có gạch vàng, mô tả, ✓, chip; phải = form trắng viền trên vàng.
   Hàng dưới: dải 4 thẻ ảnh sản phẩm thật (khung trắng 8px, bo 26px, cao thấp so le, nhãn trắng có vạch màu chuyên ngành)
   vắt từ nền xanh xuống nền trắng; điện thoại: vuốt ngang. Nguồn ảnh gom một dòng bên dưới.
3. Nỗi lo: tấm navy bo tròn trong khung, 4 thẻ số vàng + nguồn.
4. Bối cảnh: thẻ trắng có vạch màu trên, số xanh.
5. So sánh: cột trái xám, mũi tên vàng tròn, cột phải nền xanh ngọc nhạt.
6. Chuyên ngành: 4 thẻ màu (máy tính 4 cột, điện thoại 2×2), thẻ đang chọn có viền vàng + mũi nhọn; bảng chi tiết trắng nổi.
7. Trước → sau, Vì sao yên tâm (lưới bento), Một buổi học (5 bước đánh số vì là trình tự thật), Sản phẩm (thẻ ảnh + chú thích + nguồn).
8. Giảng viên, dải kêu gọi xanh + quỹ đạo, hỏi đáp (danh sách giữa), form cuối nền xanh nhạt, chân trang navy.

## Chuyển động

Một chuyển động duy nhất: 4 thẻ ảnh đầu trang nổi lên lần lượt khi tải trang. Không hiệu ứng hiện dần từng khối. Tắt khi máy bật "giảm chuyển động".

## Ảnh

- Ảnh sản phẩm: ảnh thật lấy từ nguồn mở (Roblox Creator Docs CC BY 4.0, Wikimedia Commons) hoặc trang của nhà sản xuất
  (WhalesBot, Google, Autodesk — ghi nguồn, xin phép trước khi chạy quảng cáo). Ảnh chia sẻ `og-trang-chu.jpg` dựng bằng
  `tools/minh-hoa/ghep_anh.py`.
- Không ảnh trẻ em giả, không người AI. Khi có ảnh lớp học / học viên thật có đồng ý: thay dần dải ảnh đầu trang hoặc thêm vào khối Sản phẩm.
- Ảnh AI (nếu tạo sau): chỉ bối cảnh, thiết bị, đồ vật; ghi "Ảnh minh hoạ".
