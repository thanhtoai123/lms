# Sổ tay vận hành Sata Robo

Tài liệu cho người triển khai và vận hành hệ thống quản trị. Trang **Hệ thống → Vận hành & sao lưu** (`/van-hanh`) hiển thị trạng thái thực tế của hầu hết mục dưới đây.

## 1. Kiến trúc chạy thật

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| Web (Next.js) | Trang quản trị, trang công khai, API | `pnpm --filter @satarobo/web build && pnpm --filter @satarobo/web start` sau reverse proxy HTTPS |
| Worker | Outbox, SLA lead, email, khảo sát, đăng bài hẹn giờ, thưởng giới thiệu, ẩn danh định kỳ | `pnpm --filter @satarobo/api worker` (chạy như dịch vụ, tự khởi động lại). Nếu không chạy được worker: gọi `/api/cron/outbox` mỗi phút kèm `Authorization: Bearer $CRON_SECRET` |
| PostgreSQL 16 | Dữ liệu | Không để mật khẩu mặc định; bật SSL khi DB ở máy khác |
| Thư mục tệp (`STORAGE_DIR`) | Tài liệu, CV, ảnh, bài nộp | Đường dẫn tuyệt đối, nằm trong kế hoạch sao lưu |

Theo dõi sống: cấu hình dịch vụ giám sát (UptimeRobot, BetterStack…) gọi `GET /api/health` mỗi 1–5 phút. `200` = ổn, `"status":"degraded"` = worker chậm, `503` = CSDL hoặc lưu trữ hỏng.

## 2. Biến môi trường

Xem `.env.example`. Bắt buộc khi chạy thật: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `MEDIA_SIGNING_SECRET` (≥ 32 ký tự), `OTP_PEPPER` (≥ 16), `CRON_SECRET` (≥ 24), `STORAGE_DIR`. **Không bật `ALLOW_DEV_ACTOR`** — ở production hệ thống tự bỏ qua tài khoản mẫu kể cả khi biến này bị bật nhầm. Giá trị bí mật không bao giờ hiển thị trên giao diện.

## 3. Sao lưu và khôi phục

- Hằng ngày 02:15: `scripts/ops/backup.sh` (Linux) hoặc `scripts/ops/backup.ps1` (Windows + Docker). Tạo `db-<thời điểm>.dump` (pg_dump custom) + tệp nén thư mục tải lên + `LATEST.json`. Giữ 14 ngày.
- Chép thêm một bản ra ngoài máy chủ (ổ khác / dịch vụ đám mây) — quy tắc 3-2-1.
- Mỗi tháng thử khôi phục: `scripts/ops/restore-test.ps1` (khôi phục vào CSDL tạm, so số dòng, ghi `restoreTestedAt`) hoặc `restore.sh` với `TARGET_URL` là CSDL thử nghiệm.
- Khôi phục thật: dừng web + worker → `pg_restore --clean --if-exists` vào CSDL chính → giải nén tệp vào `STORAGE_DIR` → chạy `pnpm db:apply-sql` → khởi động lại → kiểm tra `/api/health`.

## 4. Nâng cấp phiên bản

1. Sao lưu (mục 3).
2. `git pull` → `pnpm install --frozen-lockfile` → `pnpm db:push` (xem trước thay đổi) → `pnpm db:apply-sql` → `pnpm build`.
3. Khởi động lại web và worker; kiểm tra `/api/health` và `/van-hanh`.
4. Đặt `APP_VERSION` = mã commit để trang Vận hành hiển thị đúng phiên bản.

## 5. Sự cố thường gặp

| Hiện tượng | Kiểm tra | Xử lý |
|---|---|---|
| `/api/health` trả 503 | Mục `checks` | CSDL: kết nối / ổ đĩa đầy. Lưu trữ: quyền ghi `STORAGE_DIR` |
| Worker "Quá hạn" | Nhịp worker ở `/van-hanh` | Khởi động lại dịch vụ worker; xem log |
| Outbox kẹt | `/van-hanh` → Hàng đợi | Xem lỗi trong bảng `outbox.last_error`; sửa nguyên nhân rồi đặt lại `attempts` |
| Webhook SePay / Messenger / Zalo bị từ chối | Hệ thống → Chạy lại webhook | Sai khoá / chữ ký: đối chiếu biến môi trường với cấu hình bên cung cấp |
| Tin nhắn "chưa gửi ra kênh" | Quản trị hội thoại → Kênh kết nối | Thiếu token gửi, hoặc quá cửa sổ nhắn (Messenger 24h/7 ngày, Zalo OA 7 ngày) |

## 6. Bảo vệ dữ liệu cá nhân (Luật BVDLCN 2025, NĐ 356/2025 — hiệu lực 01/01/2026)

- **Yêu cầu của chủ thể dữ liệu** (Hệ thống → Tuân thủ dữ liệu): phản hồi tiếp nhận trong 2 ngày làm việc; thực hiện: xem / chỉnh sửa 10 ngày, rút đồng ý / hạn chế / phản đối 15 ngày, xoá 20 ngày; gia hạn tối đa 1 lần.
- **Sự cố dữ liệu** (lộ, mất, gửi nhầm): ghi ngay vào Sổ sự cố; mức trung bình / nghiêm trọng thông báo cơ quan chuyên trách (A05 – Bộ Công an) trong 72 giờ; ghi biện pháp khắc phục trước khi đóng.
- **Lưu giữ**: lead không chuyển đổi tự ẩn danh sau thời hạn cấu hình (mặc định 24 tháng); hồ sơ ứng viên không trúng tuyển ẩn danh sau 12 tháng; chứng từ kế toán giữ 10 năm (xoá chỉ ẩn danh thông tin liên hệ).
- Xem thông tin liên hệ đầy đủ / xuất dữ liệu luôn ghi nhật ký kèm lý do.
- Tài liệu này là hướng dẫn kỹ thuật, không thay thế tư vấn pháp lý — nên có luật sư rà soát điều khoản đồng ý và quy trình trước khi chạy thật.

## 7. Danh mục go-live

1. Biến môi trường đạt (trang Vận hành không còn mục đỏ).
2. Supabase Auth bật; tạo tài khoản thật, gán vai trò theo cơ sở; tắt tài khoản mẫu.
3. HTTPS, tên miền, `PUBLIC_FORM_ORIGINS` đúng domain website.
4. Worker chạy như dịch vụ; `/api/health` có giám sát và cảnh báo.
5. Sao lưu hằng ngày + đã thử khôi phục thành công.
6. Nhập dữ liệu cũ (`scripts/migrate-legacy`) vào môi trường thử, đối soát số học viên / công nợ / số dư xu với admin.satarobo.vn, rồi mới nhập thật.
7. Chạy song song hệ thống cũ 1–2 tuần cho các cơ sở pilot; chốt ngày dừng nhập liệu trên hệ thống cũ.
8. Đào tạo theo vai trò (quản lý cơ sở, tư vấn, giáo vụ, giáo viên, kế toán, nhân sự) và phát sổ tay.
