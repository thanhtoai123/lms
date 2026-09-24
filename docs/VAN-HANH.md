# Sổ tay vận hành Sata Robo

Tài liệu cho người triển khai và vận hành hệ thống quản trị. Trang **Hệ thống → Vận hành & sao lưu** (`/van-hanh`) hiển thị trạng thái thực tế của hầu hết mục dưới đây.

## 1. Kiến trúc chạy thật

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| Web (Next.js) | Trang quản trị, trang công khai, API | `pnpm --filter @satarobo/web build && pnpm --filter @satarobo/web start` sau reverse proxy HTTPS |
| Worker | Outbox, SLA lead, email, khảo sát, đăng bài hẹn giờ, thưởng giới thiệu, ẩn danh định kỳ | `pnpm --filter @satarobo/api worker` (chạy như dịch vụ, tự khởi động lại). Nếu không chạy được worker: gọi `/api/cron/outbox` mỗi phút kèm `Authorization: Bearer $CRON_SECRET` |
| PostgreSQL 16 | Dữ liệu | Không để mật khẩu mặc định; bật SSL khi DB ở máy khác |
| Thư mục tệp (`STORAGE_DIR`) | Tài liệu, CV, ảnh, bài nộp | Đường dẫn tuyệt đối, nằm trong kế hoạch sao lưu |

Theo dõi sống — **hai endpoint, hai câu hỏi khác nhau** (chi tiết ở `docs/HIEU-NANG.md`):

| Endpoint | Câu hỏi | Chạm CSDL | Dùng cho |
|---|---|---|---|
| `GET /api/health` | Tiến trình còn sống không? | Không | Docker / systemd / Kubernetes quyết định **khởi động lại**. Luôn `200` khi web còn chạy |
| `GET /api/ready` | Nhận lưu lượng được không? | Có (`select 1` + tồn đọng outbox) | Bộ cân bằng tải và dịch vụ giám sát (UptimeRobot, BetterStack…) gọi mỗi 1–5 phút. `200` = sẵn sàng, `503` = CSDL hỏng **hoặc** việc nền tồn đọng |

Không trộn hai vai: nếu dò "còn sống" mà phụ thuộc CSDL thì một sự cố Postgres sẽ giết và khởi động lại vòng quanh toàn bộ cụm web trong khi không tiến trình nào hỏng. Cả hai endpoint không cần đăng nhập và không tiết lộ cấu trúc hệ thống (không câu SQL, không tên bảng, không thông điệp lỗi gốc của Postgres).

Trang `/van-hanh` vẫn là nơi xem chi tiết (CSDL, lưu trữ, nhịp worker, phiên bản) — endpoint chỉ trả mã và vài từ khoá.

## 2. Biến môi trường

Xem `.env.example`. Bắt buộc khi chạy thật: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `MEDIA_SIGNING_SECRET` (≥ 32 ký tự), `OTP_PEPPER` (≥ 16), `CRON_SECRET` (≥ 24), `STORAGE_DIR`. **Không bật `ALLOW_DEV_ACTOR`** — ở production hệ thống tự bỏ qua tài khoản mẫu kể cả khi biến này bị bật nhầm. Giá trị bí mật không bao giờ hiển thị trên giao diện.

## 3. Sao lưu và khôi phục

- Hằng ngày 02:15: `scripts/ops/backup.sh` (Linux) hoặc `scripts/ops/backup.ps1` (Windows + Docker). Tạo `db-<thời điểm>.dump` (pg_dump custom) + tệp nén thư mục tải lên + `LATEST.json`. Giữ 14 ngày.
- Chép thêm một bản ra ngoài máy chủ (ổ khác / dịch vụ đám mây) — quy tắc 3-2-1.
- Mỗi tháng thử khôi phục: `scripts/ops/restore-test.ps1` (khôi phục vào CSDL tạm, so số dòng, ghi `restoreTestedAt`) hoặc `restore.sh` với `TARGET_URL` là CSDL thử nghiệm.
- Khôi phục thật: dừng web + worker → `pg_restore --clean --if-exists` vào CSDL chính → giải nén tệp vào `STORAGE_DIR` → chạy `pnpm db:apply-sql` → khởi động lại → kiểm tra `/api/ready`.

## 4. Nâng cấp phiên bản

1. Sao lưu (mục 3).
2. `git pull` → `pnpm install --frozen-lockfile` → `pnpm db:push` (xem trước thay đổi) → `pnpm db:apply-sql` → `pnpm build`.
3. Khởi động lại web và worker; kiểm tra `/api/ready` và `/van-hanh`.
4. Đặt `APP_VERSION` = mã commit để trang Vận hành hiển thị đúng phiên bản.

## 5. Sự cố thường gặp

| Hiện tượng | Kiểm tra | Xử lý |
|---|---|---|
| `/api/ready` trả 503 | Mục `checks` trong phản hồi | `database: "down"` → kết nối CSDL / ổ đĩa đầy. `outbox: "backlog"` → worker chết hoặc chạy không kịp (xem `/van-hanh` → Hàng đợi) |
| Worker "Quá hạn" | Nhịp worker ở `/van-hanh` | Khởi động lại dịch vụ worker; xem log |
| Outbox kẹt | `/van-hanh` → Hàng đợi & cảnh báo → "Outbox trong hàng đợi chết" | Xem lý do ở `outbox.last_error` (hoặc `engagement.outboxStats`); sửa nguyên nhân rồi đẩy lại bằng `engagement.retryDeadLetter`. Chi tiết ở `docs/HIEU-NANG.md` mục 3 |
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
4. Worker chạy như dịch vụ; `/api/health` và `/api/ready` có giám sát và cảnh báo.
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

## Token Zalo OA (bắt buộc đọc trước khi chạy thật)

Zalo cấp access token sống **25 giờ**; refresh token sống 3 tháng và **chỉ dùng được một lần**
(refresh xong Zalo trả token mới, token cũ vô hiệu). Vì vậy **không để token trong `.env`**:

1. Vào **Tích hợp → Zalo OA (tin tư vấn) → Khai báo ứng dụng**, dán `app_id`, `secret_key` và
   `refresh_token` lấy từ developers.zalo.me. Khoá được mã hoá trước khi lưu, không hiển thị lại.
2. Hệ thống tự làm mới khi token còn dưới 2 giờ (worker kiểm mỗi nhịp) và ghi đè refresh token mới.
3. Màn Tích hợp hiện "còn N giờ M phút"; hỏng thì hiện lỗi làm mới gần nhất — đây là chỗ nhìn đầu
   tiên khi tin Zalo ngừng gửi.

Nếu chuỗi token đứt (ví dụ hai hệ thống cùng dùng một refresh token), phải vào developers.zalo.me
xin lại authorization code rồi dán refresh token mới — không có cách tự phục hồi.

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

## Đăng nhập nhân sự (Giai đoạn 11)

- Biến môi trường khi chạy thật: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (chỉ đặt ở máy chủ, không bao giờ đưa lên trình duyệt), `NEXT_PUBLIC_APP_URL` (địa chỉ công khai, dùng trong liên kết email), `REQUIRE_MFA_ROLES` (ví dụ `SUPER_ADMIN,HO_ACCOUNTANT`; mặc định `SUPER_ADMIN`). Trong Supabase: tắt tự đăng ký (signup), bật MFA TOTP, thời hạn phiên mặc định.
- Tạo nhân sự: Người dùng → tạo tài khoản → mở trang người dùng → **Gửi lời mời**. Nhân sự bấm liên kết trong email (dùng một lần, hết hạn 1 giờ), đặt mật khẩu và vào thẳng hệ thống. Quên mật khẩu: trang đăng nhập → "Quên mật khẩu?", hoặc quản trị bấm **Gửi đặt lại mật khẩu**.
- Xác thực 2 lớp: menu Tổng quan → **Bảo mật tài khoản**, quét mã QR bằng Google Authenticator / Microsoft Authenticator, nhập mã 6 số. Tài khoản bắt buộc 2 lớp sẽ được đưa tới trang này sau khi đăng nhập cho đến khi xác thực. Mất điện thoại: quản trị gỡ thiết bị trong Supabase (Authentication → Users → MFA) rồi nhân sự đăng ký lại.
- Khoá tài khoản (Người dùng → Khoá) đồng thời cấm đăng nhập Supabase; mở khoá gỡ lệnh cấm. Nếu trang báo "chưa đồng bộ đăng nhập", kiểm tra `SUPABASE_SERVICE_ROLE_KEY`.
- Phiên đăng nhập tự làm mới khi còn dưới 5 phút; đăng xuất thu hồi phiên trên Supabase.

## An ninh đăng nhập (Giai đoạn 12)

- Cấu hình vận hành → Đăng nhập/OTP: "Nhân sự tự đăng xuất khi không thao tác" (mặc định 60 phút, áp dụng từ lần đăng nhập kế tiếp), "Tạm khoá đăng nhập sau số lần sai" (mặc định 5) và "Thời gian tạm khoá" (mặc định 15 phút). Ngoài ra một IP sai quá 30 lần / 15 phút bị chặn tạm.
- Nhân sự báo không đăng nhập được do "tạm khoá": chờ hết thời gian, dùng "Quên mật khẩu?", hoặc quản trị Hội sở vào Tài khoản → người dùng → **Mở khoá đăng nhập tạm**. Mọi lần mở khoá ghi Audit Log.
- Hệ thống & Cấu hình → **Bảo mật hệ thống**: xem hằng tuần. Xử lý mục đỏ ngay; tài khoản "không đăng nhập > 90 ngày" thì khoá nếu người đó đã nghỉ.
- Mỗi nhân sự xem lịch sử đăng nhập của mình ở **Bảo mật tài khoản**; thấy lần đăng nhập lạ thì đổi mật khẩu và báo quản trị.
- Nhật ký đăng nhập giữ 1 năm, tự dọn. IP hiển thị đã che khối cuối.
- Tìm nhanh: bấm ô tìm kiếm trên cùng hoặc **Ctrl + K** (máy Mac: ⌘ + K), gõ tên trang không dấu ("hoc bu"), tên / mã học viên, tên phụ huynh, SĐT, mã lớp, mã đơn.

## Bám nghiệp vụ bản gốc (Giai đoạn 13)

- **Chốt lead phải có tiền**: trang lead có khối "Thanh toán" (đã nộp / tổng / còn thiếu). Chưa ghi nhận khoản thu nào thì nút Chuyển đổi bị khoá. Học bổng toàn phần vẫn chốt được nhưng phải ghi lý do. Nhập liệu ban đầu (chốt hàng loạt) được ghi khoản thu lùi ngày, kế toán xác nhận sau.
- **Trùng số điện thoại**: nhập khách hàng trùng SĐT sẽ gộp vào khách cũ — chỉ điền ô trống, thêm con mới, giá trị khác ghi vào ghi chú kèm ngày; không đổi trạng thái phễu; đếm "nhập lại N lần".
- **Chia lead**: chỉ máy chia luân phiên mới tiêu lượt; giao tay / theo tỷ lệ chốt không tiêu. Bật lại một sale thì lượt về mức thấp nhất. Xem "Sổ chia lead" và "Lịch sử thay đổi pool".
- **Đơn hàng**: chia tối đa 12 đợt, có thể thu cọc; sửa được kế hoạch sau khi tạo (đợt đã thu không bị xoá). Một đơn bán cho nhiều con; giảm giá theo từng dòng phải ghi lý do; hình thức kèm riêng có hệ số nhân (bấm "Áp số này vào Đơn giá").
- **Khoản thu**: sale sửa được khoản đang chờ; kế toán điều chỉnh khoản đã xác nhận (sinh bút toán và ghi nhật ký). Trạng thái đơn hiển thị suy từ tiền đã về.
- **Buổi học**: mỗi buổi có "Điều chỉnh" (đổi ngày / giờ / GV / phòng, bắt buộc lý do) và "Huỷ" (chọn dời các buổi sau để giữ đủ tổng buổi). Không sửa được buổi đã qua.
- **Học viên**: hồ sơ có địa chỉ, phụ huynh thứ hai, CCCD (mã hoá, xem phải ghi lý do), nhóm máu, dị ứng, ngày đăng ký đầu, mã nhập tay. Vòng đời: Bảo lưu → Kết thúc bảo lưu → Nghỉ hẳn (tự đề xuất hoàn tiền) → Kích hoạt lại.
- **Chuyển lớp**: tạo yêu cầu, quản lý duyệt; cùng khoá, không vượt tiến độ, hết chỗ thì vào danh sách chờ. Duyệt xong sinh ghi danh mới ở lớp đích và mang số buổi còn lại sang.
- **Chấm công**: công tính theo ca đã xếp; quét thẻ chỉ sinh cờ để quản lý rà (muộn, thiếu lượt, quét ngoài ca…). Chấm công phải quét mã QR tại quầy, có kiểm tra vị trí. Danh mục 22 mã ca, lưới tháng giữ nguyên ô sửa tay và ô sinh từ đơn.
- **Đơn từ**: 10 loại, duyệt là áp ngay vào lịch / công; áp lỗi thì đơn quay lại Chờ duyệt kèm lý do. Từ chối bắt buộc có lý do, nộp muộn được đánh dấu.
- **Vị trí công việc**: gán vị trí cho nhân sự sẽ tự cấp bộ vai trò kèm thời hạn; hết hạn là mất quyền. "Điều động tác nghiệp" mở phạm vi dữ liệu cơ sở khác trong một khoảng thời gian.

## Kênh Zalo cá nhân (công cụ ngoài — ZCRM)

Hệ thống **không** đăng nhập Zalo. Nick chạy bên công cụ riêng, hệ thống chỉ nhận sự kiện về.

**Đấu nối một nick** (quản trị hệ thống):
1. *Tích hợp* → thẻ **Zalo cá nhân** → **Thêm nick**: đặt tên nick, trần tin/ngày, dán bí mật webhook
   (chuỗi ngẫu nhiên ≥ 24 ký tự, sinh bằng bất kỳ công cụ nào — hệ thống mã hoá trước khi lưu).
2. Chép đường webhook hiện trong bảng (`/api/webhooks/kenh/<slug>`) sang **Cài đặt → Webhook** của ZCRM,
   kèm header `X-Webhook-Secret` bằng đúng bí mật vừa đặt (hoặc ký HMAC-SHA256 vào `X-Signature`).
3. Chọn sự kiện: `message.received`, `message.sent`, `contact.created`, `zalo.connected`, `zalo.disconnected`.

**Đọc bảng nick ở màn Zalo CRM**

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| "im lặng > 30 phút" | Công cụ không gửi sự kiện nào về | Kiểm tra máy chạy ZCRM và nick còn đăng nhập không — khách nhắn vào lúc này hệ thống không thấy |
| Tin hôm nay sát trần | Nick sắp chạm hạn mức tự đặt | Chia bớt việc sang nick khác; đừng nâng trần quá 200 |
| Webhook "bị từ chối" | Sai bí mật hoặc chữ ký | Đặt lại bí mật ở cả hai đầu; sự kiện bị từ chối **không** chạy lại được |

**Nguyên tắc**: nick bị Zalo khoá chỉ mất chỗ chat — lead và lịch sử hội thoại đã nằm trong hệ thống.
Không đồng bộ danh bạ/bạn bè về hệ thống; chỉ người đã nhắn tới trung tâm mới được tạo thành lead,
và vẫn phải tick xác nhận khách đồng ý.

## Nút "Xin thông tin" trên Zalo OA

Dùng khi khách nhắn tới OA nhưng chưa để lại số: mở hội thoại ở *Hộp thư* → **Xin thông tin (tên + SĐT)**.
Zalo hiện một thẻ cho khách bấm; khách bấm xong hệ thống **tự tạo lead** kèm tên, số và dấu đồng ý
(khách chủ động chia sẻ), rồi gắn vào đúng hội thoại.

- Chỉ bấm được khi còn trong khung 48 giờ và hội thoại **chưa** gắn lead/phụ huynh.
- Một hội thoại chỉ xin lại sau 24 giờ — gửi dày làm phiền khách và dễ bị báo xấu.
- Khách **bỏ quan tâm OA** thì hội thoại mang cờ *đã rời OA*: từ lúc đó tin tự do không tới nơi,
  muốn liên lạc phải dùng tin theo mẫu (ZNS) hoặc gọi điện.
- Ảnh minh hoạ trên thẻ đặt bằng biến môi trường `ZALO_XIN_THONG_TIN_ANH` (tuỳ chọn).
