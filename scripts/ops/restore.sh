#!/usr/bin/env bash
# Khôi phục bản sao lưu vào một CSDL ĐÍCH (mặc định CSDL thử nghiệm, KHÔNG phải CSDL đang chạy).
# Dùng: TARGET_URL=postgres://.../satarobo_restore_test ./restore.sh /srv/sata/backups/db-20260917-021500.dump [files.tar.gz] [thư_mục_giải_nén]
# Sau khi thử thành công: ghi restoreTestedAt vào LATEST.json.
set -euo pipefail
DB_FILE="${1:?Đường dẫn tệp .dump}"
FILES_FILE="${2:-}"
FILES_DEST="${3:-}"
: "${TARGET_URL:?Cần TARGET_URL (CSDL đích)}"
if [ "${I_UNDERSTAND_THIS_OVERWRITES:-}" != "yes" ]; then
  echo "Khôi phục sẽ GHI ĐÈ dữ liệu trong: ${TARGET_URL%%\?*}"; read -r -p "Gõ 'yes' để tiếp tục: " ok; [ "$ok" = "yes" ] || exit 1
fi
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_URL" "$DB_FILE"
if [ -n "$FILES_FILE" ] && [ -n "$FILES_DEST" ]; then mkdir -p "$FILES_DEST" && tar -xzf "$FILES_FILE" -C "$FILES_DEST"; fi
psql "$TARGET_URL" -tAc "select 'students=' || count(*) from students union all select 'orders=' || count(*) from orders union all select 'audit=' || count(*) from audit_log"
if [ -n "${BACKUP_DIR:-}" ] && [ -f "$BACKUP_DIR/LATEST.json" ]; then
  sed -i "s/,\"restoreTestedAt\":\"[^\"]*\"//; s/}\$/,\"restoreTestedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}/" "$BACKUP_DIR/LATEST.json"
fi
echo "Khôi phục xong"
