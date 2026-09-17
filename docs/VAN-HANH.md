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

## Hoá đơn điện tử, thẻ QR, cổng phụ huynh (Giai đoạn 6)

- **Hoá đơn điện tử**: Cấu hình tại /hoa-don?tab=settings (chỉ Hội sở). Nhà cung cấp `sandbox` chỉ để thử, bị chặn ở production (trừ khi đặt `EINVOICE_ALLOW_SANDBOX=1` cho môi trường staging). Khi đã ký nhà cung cấp thật: đặt `EINVOICE_API_URL`, `EINVOICE_API_KEY`, chọn nhà cung cấp `http`, nhập ký hiệu năm hiện tại (ví dụ `1C26TSR`) và ngày bắt đầu. Đầu năm mới phải đổi ký hiệu. Kế toán xử lý hằng ngày: tab danh sách → "Phát hành lỗi", "Quá hạn lập", "Khoản thu chưa có hoá đơn", "Hoàn tiền cần điều chỉnh".
- **Thẻ QR**: In theo lớp tại /the-hoc-vien. Thẻ ký bằng `MEDIA_SIGNING_SECRET` — đổi khoá này làm mọi thẻ cũ mất hiệu lực (phải in lại). Mất thẻ → "Cấp lại thẻ" (thẻ cũ hết hiệu lực ngay).
- **Cổng phụ huynh** (/ph): OTP gửi qua Zalo ZNS (`ZALO_ZNS_TOKEN`); khi chưa có ZNS, phụ huynh dùng mã kích hoạt do trung tâm cấp. Phiên 30 ngày; phụ huynh tự thu hồi thiết bị ở trang Tài khoản. Khoá tài khoản phụ huynh ở trang học viên sẽ chặn đăng nhập ngay.

## Chuyển đổi dữ liệu và go-live (Giai đoạn 7)

Thứ tự cho mỗi cơ sở:

1. Tạo cơ sở, phòng, khoá học, lớp (đúng mã lớp như hệ cũ) trên hệ mới.
2. /chuyen-doi → "Học viên + phụ huynh": xuất danh sách từ hệ cũ ra CSV (cột theo file mẫu), chọn file, xem kết quả kiểm tra, nhập. Dòng lỗi sửa trong file rồi nhập lại cả file — dòng đã nhập tự bỏ qua.
3. "Ghi danh": mỗi dòng mã HV + mã lớp + số buổi gói + đã học (hoặc còn lại).
4. "Phiếu thu cũ" (/nhap-giao-dich-cu).
5. "Đối soát": nhập số liệu tổng đang thấy trên hệ cũ → "So và lưu" phải khớp; tải file buổi còn lại / công nợ từng học viên để so chi tiết.
6. /go-live: đánh dấu danh mục, Hội sở chuyển sang "Chạy song song". Mỗi tối quản lý cơ sở ghi 4 số liệu của hệ cũ; lệch phải ghi nguyên nhân. Đủ 5 ngày khớp liên tiếp + danh mục → Hội sở chuyển "Chính thức", sau đó khoá hệ cũ và chuyển "Hệ cũ chỉ đọc" (không quay lại được).

## Kênh gửi Zalo ZNS / SMS

- Cấu hình tại /cau-hinh-van-hanh?tab=zalo (quản trị Hội sở). Biến môi trường: `ZALO_ZNS_TOKEN` (access token OA, cần làm mới định kỳ), `ZNS_API_URL` (tuỳ chọn), `SMS_API_URL`, `SMS_API_KEY`.
- Chế độ "Giả lập" chỉ dùng khi thử nghiệm; bị chặn ở production trừ khi đặt `DELIVERY_ALLOW_SANDBOX=1` (staging).
- Mẫu ZNS phải được Zalo duyệt trước; nhập template_id và ánh xạ tham số (ví dụ `otp=otp` cho mẫu OTP).
- Worker gửi hàng đợi mỗi chu kỳ; tin không phải OTP chờ hết giờ yên lặng. Lỗi mạng thử lại 3 lần (5 / 30 / 120 phút); ZNS lỗi (không có Zalo…) chuyển SMS nếu bật dự phòng. Lỗi cấu hình (thiếu mẫu, thiếu biến) không chuyển SMS — sửa cấu hình rồi gửi lại.
- Cổng SMS dùng hợp đồng HTTP chung: `POST SMS_API_URL` với `Authorization: Bearer SMS_API_KEY`, thân `{to, brandname, text, ref}`, trả `{id}`; nhà cung cấp khác định dạng cần một lớp chuyển đổi nhỏ.

## Thông báo đẩy (cổng phụ huynh) và pilot (Giai đoạn 8)

- Tạo khoá một lần: `node scripts/ops/vapid-keys.mjs` → đặt `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` vào môi trường máy chủ. Không đổi khoá sau khi đã dùng (đổi khoá: mọi phụ huynh phải bật lại).
- Phụ huynh bật ở /ph/tai-khoan → "Thông báo trên điện thoại". iPhone (iOS 16.4+) cần "Thêm vào Màn hình chính" rồi mở từ biểu tượng mới bật được.
- Worker đẩy mọi thông báo trong app chưa đọc (≤ 12 giờ) tới thiết bị đã bật, theo giờ yên lặng ở Cấu hình vận hành → Tin Zalo. Đăng ký hết hạn (404/410) hoặc lỗi 5 lần liên tiếp tự gỡ.
- Trong pilot: nhân viên ghi phản hồi ở /go-live → "Phản hồi pilot". Mức "chặn công việc" báo Quản trị tối cao và phải xử lý trong 4 giờ; còn mục này thì không chuyển được "Chính thức" / "Hệ cũ chỉ đọc".
- Theo dõi /bao-cao/sau-go-live hằng tuần; chỉ số đỏ là dưới mục tiêu (điểm danh chốt trong ngày ≥ 95%, tự khớp chuyển khoản ≥ 60%, phủ hoá đơn ≥ 98%, phụ huynh dùng cổng ≥ 50%, OTP ≥ 95%, tin gửi thành công ≥ 95%).

## Chuẩn bị pilot (Giai đoạn 9)

- Mỗi nhân sự có vai trò tại cơ sở pilot vào **Hướng dẫn & đào tạo** (/huong-dan), học bài theo vai trò và trả lời đúng câu hỏi kiểm tra. Danh mục go-live "nhân sự đã học" tự đạt khi mọi tài khoản đang hoạt động của cơ sở học xong.
- /go-live → mỗi cơ sở có mục **Kiểm tra trước pilot**: xử lý hết mục đỏ (chặn), mục vàng nên xử lý trước ngày chạy song song. Mục "Kiểm tra dữ liệu trước pilot không còn mục chặn" tự đạt.

## Cấu hình vận hành và điểm danh mất mạng (Giai đoạn 10)

- /cau-hinh-van-hanh: tab OTP và Nhắc tự động chỉ đặt ở mức toàn hệ thống (Quản trị Hội sở). Các tab Học viên, Lớp, Chấm công, Thanh toán: chọn cơ sở, bỏ "Theo mặc định" để đặt riêng; quản lý cơ sở sửa được cơ sở của mình. Mỗi lần lưu ghi vào Audit Log kèm lý do.
- App giáo viên: nếu mất mạng khi đang ở trang buổi học, vẫn điểm danh và bấm lưu bình thường — dữ liệu lưu trên điện thoại, thanh trên cùng báo "chờ gửi", tự gửi khi có mạng (hoặc bấm "Gửi ngay"). Lưu ý: cần mở trang buổi học khi còn mạng; không đăng xuất / xoá dữ liệu trình duyệt khi còn buổi chờ gửi.
