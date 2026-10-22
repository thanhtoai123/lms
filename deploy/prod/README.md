# Chạy thật TH STEAM LMS trên VPS (Docker)

Bộ này dựng toàn bộ hệ thống trên **một** máy chủ: web + cơ sở dữ liệu + tiến trình nền + HTTPS.
Toàn bộ dữ liệu cá nhân nằm trong Postgres trên chính máy chủ của bạn (Supabase chỉ lo đăng nhập).

## 1. Mua gì

- **Máy chủ (VPS / Cloud Server)** chạy Ubuntu 22.04/24.04, đặt tại **Việt Nam**.
  Cấu hình tối thiểu nên có: **2 vCPU · 4 GB RAM · 40 GB SSD** (khởi đầu cho một trung tâm).
  KHÔNG mua "hosting" cPanel/WordPress — loại đó không chạy được Node.js.
  Nhà cung cấp VN phổ biến: Viettel IDC, VNG Cloud, Bizfly, FPT Cloud, Vietnix, Tinohost…
- **Tên miền** `thsteam.vn` (có thể bạn đã có). Cần quyền sửa DNS (A record).
- **Supabase** (miễn phí để bắt đầu) tại supabase.com — chỉ để đăng nhập nhân sự. Chọn vùng Singapore.
- Sau này khi chạy ads / nhận tiền tự động: tài khoản **SePay** (đối soát chuyển khoản), **Zalo ZNS** (gửi OTP).

## 2. Cài trên máy chủ (một lần)

```bash
# SSH vào máy chủ, cài Docker
curl -fsSL https://get.docker.com | sh

# Lấy mã nguồn (hoặc copy lên) rồi vào thư mục này
cd satarobo-platform/deploy/prod

# Tạo cấu hình
cp .env.prod.example .env
./gen-secrets.sh            # sinh các khoá bí mật
nano .env                   # điền APP_DOMAIN, 3 khoá Supabase, REQUIRE_MFA_ROLES…

# Dựng lần đầu (tạo bảng, nạp danh mục TH STEAM, tạo quản trị)
./bootstrap.sh admin@thsteam.vn "Phan Thành Toại"
```

Trỏ DNS `A @ → IP máy chủ` (và `A www → IP`). Caddy tự xin HTTPS trong ~1 phút sau khi DNS đã trỏ.

## 3. Trước khi mở cho khách (checklist chạy thật)

- [ ] Supabase: **tắt đăng ký tự do**, **bật xác nhận email**, mời email quản trị.
- [ ] Đăng nhập `https://thsteam.vn/login`, **bật xác thực 2 lớp** cho quản trị.
- [ ] Quản trị → Website: **duyệt và xuất bản** các trang (seed để bản nháp); sửa trang
      **chính sách [DEMO]**; thêm **địa chỉ + số ĐKKD** ở chân trang.
- [ ] Đặt `PII_ENCRYPTION_KEY` riêng (gen-secrets đã sinh) — đừng để trùng khoá ký media.
- [ ] Bật **sao lưu hằng đêm**: `crontab -e` thêm dòng
      `0 2 * * * /full/path/deploy/prod/backup.sh >> /full/path/deploy/prod/backup.log 2>&1`
      rồi thử khôi phục một lần (lệnh ở cuối `backup.sh`).
- [ ] Gửi thử 1 form học thử trên tên miền thật → kiểm tra lead vào Quản trị.
- [ ] (Nếu dùng bài giảng SCORM) bật tên miền phụ `bai.thsteam.vn`: xem `Caddyfile`,
      đặt `SCORM_ORIGIN` trong `.env`, chạy `./deploy.sh`.

## 4. Vận hành hằng ngày

| Việc | Lệnh |
|---|---|
| Xem log | `docker compose logs -f web worker` |
| Cập nhật mã mới | `git pull` rồi `./deploy.sh` |
| Khởi động lại | `docker compose restart web worker` |
| Sao lưu ngay | `./backup.sh` |
| Trạng thái | `docker compose ps` |

Hệ thống cũng có trang **Quản trị → Sẵn sàng vận hành** để tự kiểm tra cấu hình còn thiếu.

## 5. Dữ liệu và tuân thủ

- Toàn bộ dữ liệu học viên / phụ huynh nằm trong Postgres **trên máy chủ VN** của bạn → đáp ứng yêu
  cầu lưu dữ liệu trong nước (Luật 91/2025). Supabase chỉ giữ email đăng nhập của nhân sự.
- Sao lưu nằm trong volume `backups` trên cùng máy chủ. Nên định kỳ tải một bản về nơi khác.
