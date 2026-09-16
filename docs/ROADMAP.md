# Lộ trình

| Giai đoạn | Phạm vi | Định nghĩa xong |
|---|---|---|
| **1. Nền tảng + Academics + Teacher app** (repo này) | Monorepo, core rules + test, schema, tRPC, Teacher app (Hôm nay → điểm danh → nhận xét → hoàn tất), Ops (hàng đợi, lớp, buổi, mở lớp), migrate script, CI | GV chốt được buổi trong 1 màn; hàng đợi quá hạn tự giảm; CI xanh |
| **2. Admissions + Engagement** (đã có, CI #11) | 10 trạng thái lead (có "Đang học thử"), LeadChild, chia lead 3 chế độ + bảng sale + đặt lại lượt, bàn giao hàng loạt, chuyển lead liên cơ sở, lead lâu chưa chăm, chốt hàng loạt (tài khoản PH chờ kích hoạt, consent ảnh), SLA/tham số theo cơ sở, Kanban + CRM summary, outbox + rule engine + worker, việc chăm sóc, thông báo nội bộ, form web công khai | CRM cũ tắt được (còn: import Excel, OTP Zalo kích hoạt PH, affiliate/hoa hồng, ZNS thật) |
| 3. Lớp/Buổi nâng cao (ADMIN-SPEC §15 dòng 1–2) | Lịch nhiều giai đoạn + "áp lịch mới"/"kiểm tra lệch lịch", duyệt mở lớp, loại buổi, trợ giảng, checklist, nhận xét + điểm từng HS, học bạ năng lực theo tiêu chí (mốc 5/12), ảnh lớp có duyệt + consent + signed URL, lớp Trial | Giáo vụ + GV vận hành hoàn toàn trên hệ mới |
| 4. Finance + People | Ledger bất biến, đơn/kế hoạch trả góp/QR/SePay đối khớp, sale ghi nhận → kế toán xác nhận, công nợ, hoàn theo buổi, hoa hồng, MISA; chấm công, đơn từ, kỳ công | Module tài chính cũ tắt được |
| 5. LMS + Parent app + Public site + Báo cáo | Giáo trình/bài học/bài tập/SCORM, kho, CMS, nối `sata-ui` vào backend thật (PWA, push), 9 báo cáo, cài đặt vận hành, DSAR | Cut-over hoàn tất, hệ cũ read-only |

## Tiến độ Giai đoạn 3 (khu quản trị mới, menu giống admin.satarobo.vn)

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 3A | Học viên, tài khoản PH (mã kích hoạt, khoá), đăng ký học (bảo lưu ≤ 3 tháng, đổi gói), chuyển lớp / cơ sở, sắp hết khoá, cơ sở, phòng học | Xong |
| 3B | Lịch tổng theo tuần, điểm danh theo lớp (sửa hồi tố có lý do + báo GV), học bù, cảnh báo rủi ro | Xong |
| 3C | Tiêu chí học bạ, học bạ theo mốc (GV viết → duyệt → gửi PH), sổ học bạ, hoàn thành khoá + chứng chỉ, ảnh lớp (upload, consent, duyệt, signed URL) | Xong |
| 3D | **Lớp Trial** (xếp khách vào buổi có sẵn, kiểm tra chỗ + trần lượt thử, khoá chống tranh chỗ, đổi lịch/huỷ có lý do + báo GV, GV ghi có đến/không đến ngay trong màn buổi học, kết quả đẩy trạng thái lead và tạo việc gọi chốt); **Tài khoản** (tạo, cấp/gỡ vai trò theo cơ sở, khoá/mở có lý do, không tự khoá, luôn còn ≥ 1 Quản trị tối cao); **Vai trò & quyền** (ma trận đọc từ policy engine); **Audit Log** (lọc theo phân hệ / đối tượng / người / ngày, xem trước → sau); **Báo cáo Lead / trải nghiệm / đào tạo / hiệu suất GV** (lọc kỳ + cơ sở theo quyền, xuất CSV) | Xong |
| 3E | Lịch nhiều giai đoạn + áp lịch mới, duyệt mở lớp, loại buổi, trợ giảng, checklist buổi | Tiếp theo |

## Việc kỹ thuật còn lại trong Giai đoạn 1 (sau khi CI xanh)

1. Supabase MFA cho SUPER_ADMIN/HO_*; middleware `proxy.ts` chặn route theo role.
2. `session_media` upload qua presigned URL (R2) + duyệt ảnh + lọc theo `media_consent`.
3. Offline queue cho điểm danh (IndexedDB + background sync) trong Teacher PWA.
4. Bảng `outbox` + worker (Inngest/Trigger.dev) phát sự kiện `session.completed` → thông báo PH.
5. RLS policies sinh từ policy engine (script) làm lớp phòng thủ cuối.
6. Trang Ops: học viên, ghi danh (UI cho `classes.enroll`), đổi lịch (đóng rule cũ + sinh lại buổi tương lai).
