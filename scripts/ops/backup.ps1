# Sao lưu Sata Robo trên Windows (Postgres chạy trong Docker Compose).
# Dùng: powershell -ExecutionPolicy Bypass -File scripts\ops\backup.ps1 -BackupDir D:\sata-backups
# Lên lịch: Task Scheduler, hằng ngày 02:15, "Start in" = thư mục satarobo-platform.
param(
  [string]$BackupDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $PWD "backups" }),
  [string]$StorageDir = $(if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { Join-Path $PWD "apps\web\.data\uploads" }),
  [int]$KeepDays = 14
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $BackupDir | Out-Null
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$dbFile = Join-Path $BackupDir "db-$ts.dump"
$filesFile = Join-Path $BackupDir "files-$ts.zip"
# pg_dump trong container ghi ra file tạm trong container rồi copy ra (tránh hỏng dữ liệu nhị phân qua pipe PowerShell)
docker compose exec -T postgres pg_dump -U postgres --no-owner --no-privileges -Fc -f /tmp/sata-backup.dump satarobo
if ($LASTEXITCODE -ne 0) { throw "pg_dump lỗi" }
$cid = (docker compose ps -q postgres).Trim()
docker cp "${cid}:/tmp/sata-backup.dump" $dbFile | Out-Null
docker compose exec -T postgres rm -f /tmp/sata-backup.dump | Out-Null
if (-not (Test-Path $dbFile) -or (Get-Item $dbFile).Length -lt 1000) { throw "Bản sao lưu CSDL rỗng" }
if (Test-Path $StorageDir) { Compress-Archive -Path (Join-Path $StorageDir "*") -DestinationPath $filesFile -Force } else { Set-Content -Path $filesFile -Value "" }
$prev = $null
$latestPath = Join-Path $BackupDir "LATEST.json"
if (Test-Path $latestPath) { try { $prev = Get-Content $latestPath -Raw | ConvertFrom-Json } catch { $prev = $null } }
$latest = [ordered]@{ at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); db = (Split-Path $dbFile -Leaf); files = (Split-Path $filesFile -Leaf); dbBytes = (Get-Item $dbFile).Length; filesBytes = (Get-Item $filesFile).Length }
if ($prev -and $prev.restoreTestedAt) { $latest.restoreTestedAt = $prev.restoreTestedAt }
[System.IO.File]::WriteAllText($latestPath, ($latest | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
Get-ChildItem $BackupDir -File | Where-Object { $_.Name -match '^(db-.*\.dump|files-.*\.zip)$' -and $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force
Write-Host "BACKUP OK $dbFile $((Get-Item $dbFile).Length) B"
