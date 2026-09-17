# Thử khôi phục bản sao lưu mới nhất vào CSDL tạm "satarobo_restore_test" (không đụng CSDL đang chạy), so số dòng, ghi restoreTestedAt.
param([string]$BackupDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $PWD "backups" }))
$ErrorActionPreference = "Stop"
$latest = Get-Content (Join-Path $BackupDir "LATEST.json") -Raw | ConvertFrom-Json
$dbFile = Join-Path $BackupDir $latest.db
$cid = (docker compose ps -q postgres).Trim()
docker cp $dbFile "${cid}:/tmp/sata-restore.dump" | Out-Null
docker compose exec -T postgres psql -U postgres -c "drop database if exists satarobo_restore_test" | Out-Null
docker compose exec -T postgres psql -U postgres -c "create database satarobo_restore_test" | Out-Null
docker compose exec -T postgres pg_restore -U postgres --no-owner --no-privileges -d satarobo_restore_test /tmp/sata-restore.dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore lỗi" }
$q = "select (select count(*) from students) || '/' || (select count(*) from orders) || '/' || (select count(*) from audit_log) || '/' || (select count(*) from consent_records)"
$src = (docker compose exec -T postgres psql -U postgres -d satarobo -tA -c $q).Trim()
$dst = (docker compose exec -T postgres psql -U postgres -d satarobo_restore_test -tA -c $q).Trim()
docker compose exec -T postgres psql -U postgres -c "drop database satarobo_restore_test" | Out-Null
docker compose exec -T postgres rm -f /tmp/sata-restore.dump | Out-Null
Write-Host "RESTORE COUNTS src=$src restored=$dst"
if ($src -ne $dst) { Write-Host "RESTORE MISMATCH (du lieu co the da thay doi sau khi sao luu)" }
$obj = [ordered]@{}
$latest.PSObject.Properties | ForEach-Object { $obj[$_.Name] = $_.Value }
$obj.restoreTestedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
[System.IO.File]::WriteAllText((Join-Path $BackupDir "LATEST.json"), ($obj | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "RESTORE TEST OK"
