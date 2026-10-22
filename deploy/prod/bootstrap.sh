#!/usr/bin/env bash
# Dựng hệ thống LẦN ĐẦU: build ảnh, bật Postgres, tạo bảng, nạp dữ liệu chuẩn TH STEAM,
# tạo tài khoản quản trị thật. KHÔNG nạp dữ liệu mẫu (không tài khoản "(mẫu)").
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Chưa có .env — xem hướng dẫn trong README.md"; exit 1; }
set -a; . ./.env; set +a

ADMIN_EMAIL="${1:-}"
ADMIN_TEN="${2:-Quản trị hệ thống}"
if [ -z "$ADMIN_EMAIL" ]; then
  echo "Dùng: ./bootstrap.sh admin@thsteam.edu.vn \"Tên quản trị\""
  echo "  (email này phải trùng email bạn sẽ đăng nhập qua Supabase)"
  exit 1
fi

echo "== 1/5 Build ảnh ứng dụng (lần đầu lâu, ~5–10 phút)"
docker compose build

echo "== 2/5 Bật cơ sở dữ liệu"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U postgres -d satarobo >/dev/null 2>&1; do sleep 2; done

echo "== 3/5 Tạo bảng (drizzle push) + áp các SQL bổ sung (RLS, ràng buộc)"
docker compose run --rm web pnpm db:push
docker compose run --rm web pnpm db:apply-sql

echo "== 4/5 Nạp nhận diện + danh mục chương trình + website TH STEAM (bản nháp)"
docker compose run --rm web pnpm db:seed-thsteam

echo "== 5/5 Tạo tài khoản quản trị thật"
docker compose run --rm -e EMAIL="$ADMIN_EMAIL" -e TEN="$ADMIN_TEN" web pnpm create-admin

echo "== Bật web + worker + Caddy"
docker compose up -d

cat <<DONE

✔ Xong bước dựng. Việc còn lại:
  1. Trỏ A record ${APP_DOMAIN} → IP máy chủ này (và www nếu muốn). Caddy tự xin HTTPS.
  2. Trên Supabase: TẮT đăng ký tự do, BẬT xác nhận email, mời email ${ADMIN_EMAIL}.
  3. Vào https://${APP_DOMAIN}/login đăng nhập bằng ${ADMIN_EMAIL}, bật xác thực 2 lớp.
  4. Vào Quản trị → Website: duyệt và XUẤT BẢN trang (seed để bản nháp), sửa chính sách [DEMO],
     thêm địa chỉ + số ĐKKD ở chân trang.
  5. Bật sao lưu hằng ngày: cài ./backup.sh vào crontab (xem README.md).

Theo dõi log: docker compose logs -f web worker
DONE
