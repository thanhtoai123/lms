#!/usr/bin/env bash
# Sao lưu Sata Robo: CSDL (pg_dump định dạng custom) + thư mục tệp tải lên.
# Dùng: BACKUP_DIR=/srv/sata/backups STORAGE_DIR=/srv/sata/uploads DATABASE_URL=... ./backup.sh
# Lên lịch: cron "15 2 * * *" (2:15 sáng hằng ngày). Giữ KEEP_DAYS ngày (mặc định 14).
set -euo pipefail
: "${BACKUP_DIR:?Cần BACKUP_DIR}"
: "${DATABASE_URL:?Cần DATABASE_URL}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STORAGE_DIR="${STORAGE_DIR:-$(pwd)/apps/web/.data/uploads}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/db-$TS.dump"
FILES_FILE="$BACKUP_DIR/files-$TS.tar.gz"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --no-owner --no-privileges -Fc -f "$DB_FILE" "$DATABASE_URL"
else
  docker compose exec -T postgres pg_dump -U postgres --no-owner --no-privileges -Fc satarobo > "$DB_FILE"
fi
[ -s "$DB_FILE" ] || { echo "Bản sao lưu CSDL rỗng" >&2; exit 1; }

if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$FILES_FILE" -C "$STORAGE_DIR" .
else
  tar -czf "$FILES_FILE" --files-from /dev/null
fi

DB_BYTES=$(stat -c%s "$DB_FILE"); FILES_BYTES=$(stat -c%s "$FILES_FILE")
PREV_RESTORE=$(grep -o '"restoreTestedAt":"[^"]*"' "$BACKUP_DIR/LATEST.json" 2>/dev/null || true)
printf '{"at":"%s","db":"%s","files":"%s","dbBytes":%s,"filesBytes":%s%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$DB_FILE")" "$(basename "$FILES_FILE")" "$DB_BYTES" "$FILES_BYTES" "${PREV_RESTORE:+,$PREV_RESTORE}" > "$BACKUP_DIR/LATEST.json"

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
# Bản ngoài máy chủ (khuyến nghị): rclone copy "$BACKUP_DIR" remote:sata-backups --max-age 25h
echo "OK $DB_FILE ($DB_BYTES B) $FILES_FILE ($FILES_BYTES B)"
