#!/usr/bin/env bash
# Sao lưu cơ sở dữ liệu ra tệp nén trong volume backups. Giữ 14 ngày gần nhất.
# Cài vào crontab để chạy hằng đêm, ví dụ 2h sáng:
#   0 2 * * * /đường/dẫn/deploy/prod/backup.sh >> /đường/dẫn/deploy/prod/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
TS=$(date +%Y%m%d-%H%M%S)
OUT="/backups/satarobo-${TS}.sql.gz"

docker compose exec -T postgres sh -c "pg_dump -U postgres satarobo | gzip > ${OUT}"
docker compose exec -T postgres sh -c "find /backups -name 'satarobo-*.sql.gz' -mtime +14 -delete"
echo "$(date '+%F %T')  ✔ sao lưu ${OUT}"

# Khôi phục (khi cần) — KIỂM TRA kỹ trước khi chạy trên máy thật:
#   gunzip -c /backups/satarobo-XXXX.sql.gz | docker compose exec -T postgres psql -U postgres satarobo
