# Lộ trình

| Giai đoạn | Phạm vi | Định nghĩa xong |
|---|---|---|
| **1. Nền tảng + Academics + Teacher app** (repo này) | Monorepo, core rules + test, schema, tRPC, Teacher app (Hôm nay → điểm danh → nhận xét → hoàn tất), Ops (hàng đợi, lớp, buổi, mở lớp), migrate script, CI | GV chốt được buổi trong 1 màn; hàng đợi quá hạn tự giảm; CI xanh |
| 2. Admissions + Engagement | Lead inbox theo SLA, timeline hợp nhất, automation rules (outbox + worker), ZNS/push, nhận xét buổi → PH, NPS, rủi ro → việc chăm sóc, OpenAPI cho Zalo Mini App | CRM cũ tắt được; tracking Meta/GA4 chạy |
| 3. Finance + People | Ledger bất biến, đơn/thu/nợ/hoàn theo buổi đã học, VietQR, đối soát MISA, hoa hồng, chấm công, kho | Module tài chính cũ tắt được |
| 4. Parent/Student app + Public site | Nối `sata-ui` vào backend thật (PWA, offline điểm danh cho GV, push), Public site SSG + CMS, báo cáo/BI, DSAR | Cut-over hoàn tất, hệ cũ read-only |

## Việc kỹ thuật còn lại trong Giai đoạn 1 (sau khi CI xanh)

1. Supabase MFA cho SUPER_ADMIN/HO_*; middleware `proxy.ts` chặn route theo role.
2. `session_media` upload qua presigned URL (R2) + duyệt ảnh + lọc theo `media_consent`.
3. Offline queue cho điểm danh (IndexedDB + background sync) trong Teacher PWA.
4. Bảng `outbox` + worker (Inngest/Trigger.dev) phát sự kiện `session.completed` → thông báo PH.
5. RLS policies sinh từ policy engine (script) làm lớp phòng thủ cuối.
6. Trang Ops: học viên, ghi danh (UI cho `classes.enroll`), đổi lịch (đóng rule cũ + sinh lại buổi tương lai).
