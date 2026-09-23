<#
  Khoi dong toan bo he thong Sata Robo tren may phat trien — mot lenh duy nhat.

  Cach dung:   pnpm khoi-dong
  Hoac:        powershell -ExecutionPolicy Bypass -File .\scripts\khoi-dong.ps1

  Cac buoc: bat Docker Desktop (neu chua chay) -> dung container Postgres ->
  cho CSDL san sang -> kiem tra da co bang chua -> chay may chu phat trien -> mo trinh duyet.
#>
param(
  [string]$BaseUrl = "http://localhost:3000",
  [switch]$KhongMoTrinhDuyet
)
$ErrorActionPreference = "Continue"
$R = Split-Path -Parent $PSScriptRoot
Set-Location $R

function Noi($m, $mau = "Gray") { Write-Host $m -ForegroundColor $mau }

# Nhat ky cua may chu web / worker ghi ra logs\*.log (van hien trong cua so) — de khi tien trinh
# chet giua chung van doc lai duoc nguyen nhan, khong phu thuoc cua so con mo hay khong.
$LogDir = Join-Path $R "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function DongCuaSoCu([string]$tieuDe) {
  # Cac cua so do chinh script nay mo o lan truoc: nhan dien qua dong lenh co tieu de rieng.
  foreach ($p in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      ($_.Name -eq "cmd.exe" -or $_.Name -eq "powershell.exe") -and $_.CommandLine -like ("*" + $tieuDe + "*") -and $_.ProcessId -ne $PID })) {
    & taskkill.exe /PID $p.ProcessId /T /F 2>&1 | Out-Null
  }
  # Cua so do phien ban moi cua script mo: PID luu trong logs\<ten>.pid
  $pf = Join-Path $LogDir (($tieuDe -replace '[^A-Za-z]', '') + ".pid")
  if (Test-Path $pf) {
    $old = (Get-Content $pf -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($old -match '^\d+$') { & taskkill.exe /PID $old /T /F 2>&1 | Out-Null }
    Remove-Item $pf -Force -ErrorAction SilentlyContinue
  }
}

function MoCuaSoGhiLog([string]$tieuDe, [string]$lenh, [string]$tepLog, [string]$nodeOpts = "") {
  # Ghì bộ nhớ đống của Node lại: máy 16GB chạy cả Docker + trình duyệt, Turbopack (phần Rust) cần
  # bộ nhớ hệ thống để biên dịch ~120 trang — Node ôm hết thì Windows báo "memory allocation failed"
  # và máy chủ phát triển chết giữa chừng.
  $f = Join-Path $LogDir $tepLog
  if (Test-Path $f) { Move-Item $f ($f + ".cu") -Force -ErrorAction SilentlyContinue }
  $ps = @"
`$host.UI.RawUI.WindowTitle = '$tieuDe'
`$env:ALLOW_DEV_ACTOR = '1'
`$env:FORCE_COLOR = '0'
`$env:NODE_OPTIONS = '$nodeOpts'
Set-Location '$R'
Add-Content -Path '$f' -Value ('=== ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' $lenh') -Encoding UTF8
cmd /c '$lenh 2>&1' | ForEach-Object { Write-Host `$_; Add-Content -Path '$f' -Value `$_ -Encoding UTF8 }
Add-Content -Path '$f' -Value ('=== ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' tien trinh da thoat, ma ' + `$LASTEXITCODE) -Encoding UTF8
Write-Host 'Tien trinh da dung. Xem $f' -ForegroundColor Red
"@
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ps))
  $pr = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit","-NoProfile","-ExecutionPolicy","Bypass","-EncodedCommand",$enc -WorkingDirectory $R -WindowStyle Minimized -PassThru
  Set-Content -Path (Join-Path $LogDir (($tieuDe -replace '[^A-Za-z]', '') + ".pid")) -Value $pr.Id -Encoding ASCII
}

Noi "== Khoi dong he thong Sata Robo ==" "Cyan"
Noi ("Thu muc: " + $R)

# --- 1. Docker ---------------------------------------------------------------
& docker info --format "{{.ServerVersion}}" > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Noi "Docker chua chay — dang bat Docker Desktop..." "Yellow"
  $dd = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process -FilePath $dd | Out-Null }
  else { Noi "KHONG tim thay Docker Desktop. Hay bat tay roi chay lai." "Red"; exit 1 }
  $len = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 5
    & docker info --format "{{.ServerVersion}}" > $null 2>&1
    if ($LASTEXITCODE -eq 0) { $len = $true; break }
    Write-Host "." -NoNewline
  }
  Write-Host ""
  if (-not $len) { Noi "Docker khong len sau 200 giay. Hay mo Docker Desktop tay roi chay lai." "Red"; exit 1 }
}
Noi "Docker: san sang" "Green"

# --- 2. Postgres -------------------------------------------------------------
& docker compose up -d 2>&1 | Out-Null
$db = $false
for ($i = 0; $i -lt 24; $i++) {
  Start-Sleep -Seconds 3
  & docker compose exec -T postgres pg_isready -U postgres > $null 2>&1
  if ($LASTEXITCODE -eq 0) { $db = $true; break }
}
if (-not $db) { Noi "Postgres khong san sang. Xem: docker compose logs postgres" "Red"; exit 1 }
Noi "Postgres: san sang (cong 5433)" "Green"

# --- 3. Da co du lieu chua ---------------------------------------------------
$soBang = (& docker compose exec -T postgres psql -U postgres -d satarobo -tA -c "select count(*) from information_schema.tables where table_schema='public'" 2>$null | Select-Object -First 1)
if (-not $soBang) { $soBang = "0" }
if ([int]$soBang -lt 5) {
  Noi "CSDL con trong — dang tao bang va gieo du lieu mau..." "Yellow"
  & pnpm db:push; & pnpm db:apply-sql; & pnpm db:seed
} else {
  $soHv = (& docker compose exec -T postgres psql -U postgres -d satarobo -tA -c "select count(*) from students" 2>$null | Select-Object -First 1)
  Noi ("CSDL: " + $soBang + " bang, " + $soHv + " hoc vien") "Green"
}

# --- 4. May chu phat trien ---------------------------------------------------
$dangChay = $false
try { $x = Invoke-WebRequest ($BaseUrl + "/login") -UseBasicParsing -TimeoutSec 5; if ($x.StatusCode -eq 200) { $dangChay = $true } } catch { }
if ($dangChay) {
  Noi "May chu web: da chay san" "Green"
} else {
  Noi "Dang khoi dong may chu web..." "Yellow"
  # Cua so cu cua lan truoc (tien trinh node da chet nhung cua so cmd con mo) -> dong di cho gon
  DongCuaSoCu "Sata Robo dev server"
  MoCuaSoGhiLog "Sata Robo dev server" "pnpm --filter @satarobo/web dev" "web.log" "--max-old-space-size=3072"
  for ($i = 0; $i -lt 48; $i++) {
    Start-Sleep -Seconds 5
    try { $x = Invoke-WebRequest ($BaseUrl + "/login") -UseBasicParsing -TimeoutSec 8; if ($x.StatusCode -eq 200) { $dangChay = $true; break } } catch { }
    Write-Host "." -NoNewline
  }
  Write-Host ""
  if (-not $dangChay) { Noi "May chu web khong len. Xem logs\web.log" "Red"; exit 1 }
  Noi "May chu web: san sang" "Green"
}

# --- 5. Tien trinh viec nen (worker) -----------------------------------------
# `pnpm dev` chi chay web. Thieu worker thi thong bao / email / ZNS cho phu huynh nam cho mai
# trong hang doi va /api/ready se bao 503 — nen khoi dong luon o day.
$coWorker = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*src/worker.ts*" -or $_.CommandLine -like "*src\worker.ts*" }).Count -gt 0
if ($coWorker) {
  Noi "Worker viec nen: da chay san" "Green"
} else {
  DongCuaSoCu "Sata Robo worker"
  MoCuaSoGhiLog "Sata Robo worker" "pnpm worker" "worker.log" "--max-old-space-size=768"
  # Worker chet ngay khi vua len (thieu bien moi truong, loi ket noi...) thi bao luon, dung de im lang
  Start-Sleep -Seconds 12
  $conSong = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*worker.ts*" }).Count -gt 0
  if ($conSong) { Noi "Worker viec nen: da khoi dong (cua so 'Sata Robo worker', nhat ky logs\worker.log)" "Green" }
  else { Noi "Worker viec nen KHONG chay duoc — xem logs\worker.log" "Red" }
}

Noi ""
Noi ("He thong da san sang: " + $BaseUrl + "/login") "Cyan"
Noi "Tai khoan mau (khong can mat khau, chi o che do phat trien):" "Gray"
Noi "  superadmin@example.test      Quan tri toi cao" "Gray"
Noi "  manager.cs1@example.test     Quan ly co so 1" "Gray"
Noi "  giamdoc@satarobo-hue.test    Giam doc trung tam nhuong quyen" "Gray"
Noi "Tat he thong: dong 2 cua so 'Sata Robo dev server' va 'Sata Robo worker'; 'docker compose stop' neu muon tat CSDL." "Gray"

if (-not $KhongMoTrinhDuyet) { Start-Process ($BaseUrl + "/login") }
