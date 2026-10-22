#!/usr/bin/env bash
# Cập nhật mã mới: build lại ảnh, áp SQL mới (nếu có), khởi động lại web + worker.
# Dữ liệu không bị động tới. Chạy sau khi đã git pull bản mới.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Chưa có .env"; exit 1; }

echo "== Build ảnh mới"
docker compose build

echo "== Áp cấu trúc / SQL mới (an toàn khi không có gì mới)"
docker compose run --rm web pnpm db:push
docker compose run --rm web pnpm db:apply-sql

echo "== Khởi động lại web + worker"
docker compose up -d
docker image prune -f >/dev/null 2>&1 || true
echo "✔ Đã cập nhật. Log: docker compose logs -f web worker"
