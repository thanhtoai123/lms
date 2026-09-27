<#
  CAI ZALO CRM (ZCRM Community v3.4) CANH HE THONG SATA ROBO — tren may Windows co Docker Desktop.

  Lam gi:
    1. Tai ma nguon ZCRM (github.com/locphamnguyen/ZaloCRM) vao %USERPROFILE%\zcrm — CHAY RIENG,
       khong nam trong ma nguon LMS (giay phep AGPL-3.0).
    2. Chay bo cai chinh thuc cua ZCRM (scripts/zalocrm-deploy.sh): sinh .env + bi mat ngau nhien,
       build, migrate, tu ne cong trung. Chi bat dich vu loi (app db redis minio).
    3. Dung proxy "khung nhung" (Caddy) o cong 3081 de trang quan tri nhung duoc giao dien ZCRM.
    4. Ghi ZCRM_ORIGINS vao .env cua LMS.

  Chay lai nhieu lan van an toan: lan sau la NANG CAP (giu du lieu, tu backup DB truoc).
  Viec con lai CAN NGUOI: mo http://localhost:3081/setup tao to chuc + tai khoan chu (tu dat mat khau),
  quet QR dang nhap nick Zalo, roi Cai dat -> API & Webhook -> Tao API key, dan vao LMS (Tich hop).
#>
param(
  [string]$ThuMuc = (Join-Path $env:USERPROFILE "zcrm"),
  [int]$CongKhung = 3081,
  [string]$NguonLms = "http://localhost:3000"
)
$ErrorActionPreference = "Continue"
$Lms = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
function Log($t) { Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $t) }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker chua chay — mo Docker Desktop roi chay lai." -ForegroundColor Red; exit 1 }
$bash = "$env:ProgramFiles\Git\bin\bash.exe"
if (-not (Test-Path $bash)) { Write-Host "Can Git for Windows (Git Bash)." -ForegroundColor Red; exit 1 }

Log "1. Ma nguon ZCRM -> $ThuMuc"
if (Test-Path (Join-Path $ThuMuc ".git")) { git -C $ThuMuc pull --ff-only 2>&1 | Select-Object -Last 1 | ForEach-Object { Log $_ } }
else { git clone --depth 1 https://github.com/locphamnguyen/ZaloCRM.git $ThuMuc 2>&1 | Select-Object -Last 1 | ForEach-Object { Log $_ } }
if (-not (Test-Path (Join-Path $ThuMuc "docker-compose.yml"))) { Write-Host "Khong tai duoc ma nguon ZCRM." -ForegroundColor Red; exit 1 }

Log "2. Bo cai chinh thuc cua ZCRM (build lan dau mat 10-20 phut)"
# APP_URL = dia chi qua khung nhung: duong dan, Socket.IO, link dang nhap deu di qua cong nay
$env:APP_URL = "http://localhost:$CongKhung"
$env:NO_OPEN = "1"
$unix = "/" + $ThuMuc.Substring(0, 1).ToLower() + ($ThuMuc.Substring(2) -replace '\\', '/')
& $bash -lc "cd '$unix' && ./scripts/zalocrm-deploy.sh auto" 2>&1 | ForEach-Object { Log ([string]$_) }
$congZcrm = "3080"
$m = Select-String -Path (Join-Path $ThuMuc ".env") -Pattern '^APP_PORT=(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($m) { $congZcrm = $m.Matches[0].Groups[1].Value }
Log ("   ZCRM chay o cong " + $congZcrm)

Log "3. Proxy khung nhung o cong $CongKhung"
docker rm -f zcrm-khung *> $null
$caddy = Join-Path $Lms "deploy\zcrm\Caddyfile"
docker run -d --name zcrm-khung --restart unless-stopped -p "${CongKhung}:80" `
  -e "ZCRM_UPSTREAM=host.docker.internal:$congZcrm" -e "LMS_ORIGIN=$NguonLms" `
  -v "${caddy}:/etc/caddy/Caddyfile:ro" caddy:2-alpine 2>&1 | Select-Object -Last 1 | ForEach-Object { Log ("   " + $_) }
Start-Sleep 4
$h = (curl.exe -s -D - -o NUL -m 20 "http://localhost:$CongKhung/") -join "`n"
Log ("   HTTP: " + (($h -split "`n")[0]))
Log ("   X-Frame-Options con khong: " + [bool]($h -match "(?im)^x-frame-options"))
Log ("   frame-ancestors: " + (([regex]::Match($h, "(?im)^content-security-policy:.*$")).Value))

Log "4. ZCRM_ORIGINS trong .env cua LMS"
$envLms = Join-Path $Lms ".env"
$dong = "ZCRM_ORIGINS=http://localhost:$CongKhung"
if (Test-Path $envLms) {
  $nd = Get-Content $envLms -Raw
  if ($nd -match "(?m)^ZCRM_ORIGINS=") { $nd = [regex]::Replace($nd, "(?m)^ZCRM_ORIGINS=.*$", $dong); [IO.File]::WriteAllText($envLms, $nd, (New-Object Text.UTF8Encoding($false))) }
  else { Add-Content -Path $envLms -Value $dong -Encoding UTF8 }
  Log "   da ghi $dong (khoi dong lai may chu LMS de co hieu luc)"
}

Write-Host ""
Write-Host "XONG phan tu dong. Viec con lai can nguoi:" -ForegroundColor Green
Write-Host "  a. Mo http://localhost:$CongKhung/setup -> tao to chuc + tai khoan chu (tu dat mat khau)."
Write-Host "  b. ZCRM: them nick Zalo, quet QR bang dien thoai."
Write-Host "  c. ZCRM: Cai dat -> API & Webhook -> Tao API key; dan vao LMS: Tich hop -> Zalo ca nhan"
Write-Host "     (dia chi API: http://localhost:$CongKhung ; ma nick: tu dien khi nick ket noi)."
Write-Host "  d. LMS: Zalo CRM -> the 'Giao dien Zalo CRM (ZCRM)'."
