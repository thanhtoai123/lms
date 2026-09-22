# -----------------------------------------------------------------------------
#  Kich ban kiem thu toan dien — Sata Robo Platform
#  Bo A: bao mat · Bo B: cach ly trung tam (tenant) · Bo C: mot cham · Bo D: vai tro
#  Chay tren Windows PowerShell 5.1. Xem docs/KIEM-THU-TOAN-DIEN.md
# -----------------------------------------------------------------------------
param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Out = "",
  [ValidateSet("bao-mat", "tenant", "mot-cham", "vai-tro", "tat-ca")]
  [string]$Only = "tat-ca"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$script:BaseUrl = $BaseUrl.TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($Out)) { $Out = Join-Path $PSScriptRoot "bao-cao-kiem-thu.md" }
$script:Out = $Out
if (-not [System.IO.Path]::IsPathRooted($script:Out)) { $script:Out = Join-Path (Get-Location).Path $script:Out }
$script:Started = Get-Date
$script:Stamp = $script:Started.ToString("yyyyMMddHHmmss")
$script:Tmp = Join-Path $env:TEMP ("kttd-" + $script:Stamp + "-" + (Get-Random -Minimum 1000 -Maximum 9999))
New-Item -ItemType Directory -Path $script:Tmp -Force | Out-Null

$script:results = New-Object System.Collections.ArrayList
$script:perf = New-Object System.Collections.ArrayList
$script:created = New-Object System.Collections.ArrayList
$script:notes = New-Object System.Collections.ArrayList

# Bảy tài khoản mẫu của bộ kiểm thử vai trò (KHÔNG có mật khẩu — đăng nhập bằng cookie x-dev-actor)
$A = "superadmin@example.test"     # quản trị tối cao (Hội sở)
$M = "manager.cs1@example.test"    # quản lý cơ sở 1
$K = "ketoan.cs1@example.test"     # kế toán cơ sở 1
$H = "hr.cs1@example.test"         # nhân sự cơ sở 1
$S = "sale1.cs1@example.test"      # tư vấn cơ sở 1
$G = "giaovu.cs1@example.test"     # giáo vụ cơ sở 1
$TE = "teacher1@satarobo.vn"       # giáo viên
# Bên nhượng quyền FR_HUE: tài khoản ĐANG HOẠT ĐỘNG dùng trước, tài khoản chờ kích hoạt để dự phòng
$FR = "giamdoc@satarobo-hue.test"
$FR2 = "quantri@satarobo-hue.test"

# `ten` chỉ là tên gọi ngắn để đọc log. Vai trò THẬT của từng tài khoản được đọc sống
# từ `auth.me` + `system.roles`, không suy từ tên tài khoản (xem bộ C).
$script:Roles = @(
  @{ email = $A;  ten = "superadmin" },
  @{ email = $M;  ten = "manager.cs1" },
  @{ email = $K;  ten = "ketoan.cs1" },
  @{ email = $H;  ten = "hr.cs1" },
  @{ email = $S;  ten = "sale1.cs1" },
  @{ email = $G;  ten = "giaovu.cs1" },
  @{ email = $TE; ten = "teacher1" }
)

# --------------------------------------------------------------------------- #
#  Tiện ích chung                                                             #
# --------------------------------------------------------------------------- #

# Thay cho toán tử ?? (không có trong PowerShell 5.1)
function Def($value, $fallback) {
  if ($null -eq $value) { return $fallback }
  if ($value -is [string] -and $value -eq "") { return $fallback }
  return $value
}

# Che dữ liệu cá nhân TRƯỚC khi in ra màn hình / ghi báo cáo
function Mask([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return "" }
  $r = [regex]::Replace($text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email-da-che>')
  $r = [regex]::Replace($r, '(?<![\d])(\+?84|0)[\d]{8,10}(?![\d])', '<sdt-da-che>')
  return $r
}

function Short([string]$text, [int]$max = 300) {
  if ([string]::IsNullOrEmpty($text)) { return "" }
  $t = ($text -replace '\s+', ' ').Trim()
  if ($t.Length -le $max) { return $t }
  return $t.Substring(0, $max - 1) + "…"
}

# Rút gọn + che PII trong một lần
function Say([string]$text, [int]$max = 300) { return (Short (Mask $text) $max) }

function T([string]$bo, [string]$ten, $ok, [string]$kyVong, [string]$thucTe) {
  $status = "FAIL"
  if ($ok) { $status = "PASS" }
  $extra = ""
  if ($status -eq "FAIL") {
    $extra = "ky vong: " + (Say $kyVong 140) + " | thuc te: " + (Say $thucTe 140)
  } elseif ($thucTe) {
    $extra = (Say $thucTe 120)
  }
  [void]$script:results.Add([pscustomobject]@{ bo = $bo; ten = $ten; status = $status; extra = $extra })
  $line = "[$status] $bo · $ten"
  if ($extra) { $line = "$line — $extra" }
  if ($status -eq "PASS") { Write-Host $line -ForegroundColor Green } else { Write-Host $line -ForegroundColor Red }
}

function Skip([string]$bo, [string]$ten, [string]$lyDo) {
  [void]$script:results.Add([pscustomobject]@{ bo = $bo; ten = $ten; status = "SKIP"; extra = (Say $lyDo 200) })
  Write-Host ("[SKIP] $bo · $ten — " + (Say $lyDo 200)) -ForegroundColor Yellow
}

function Note([string]$text) {
  [void]$script:notes.Add((Say $text 300))
}

function Created([string]$text) {
  [void]$script:created.Add((Say $text 200))
}

function Perf([string]$ten, [int]$ms) {
  [void]$script:perf.Add([pscustomobject]@{ ten = $ten; ms = $ms })
}

# --------------------------------------------------------------------------- #
#  Gọi tRPC (giống hệt cách kich-ban-vai-tro.ps1 làm)                         #
#    query   GET  /api/trpc/<path>?input=<uri-encode {"json":…}>              #
#    mutation POST /api/trpc/<path> body {"json":…}                           #
#    danh tính: cookie x-dev-actor=<email> (cần ALLOW_DEV_ACTOR=1)            #
# --------------------------------------------------------------------------- #
function CallApi {
  param(
    [string]$Method,
    [string]$Path,
    $InputObj,
    [string]$Who,
    [hashtable]$ExtraHeaders,
    [switch]$NoCookie
  )
  $url = "$script:BaseUrl/api/trpc/$Path"
  $outFile = Join-Path $script:Tmp "resp.json"
  $cargs = @("-s", "-o", $outFile, "-w", "%{http_code}")
  if ((-not $NoCookie) -and $Who) { $cargs += @("-b", "x-dev-actor=$Who") }
  if ($ExtraHeaders) {
    foreach ($k in $ExtraHeaders.Keys) { $cargs += @("-H", ($k + ": " + $ExtraHeaders[$k])) }
  }
  if ($Method -eq "GET") {
    if ($null -ne $InputObj) {
      $url += "?input=" + [uri]::EscapeDataString((@{ json = $InputObj } | ConvertTo-Json -Depth 12 -Compress))
    }
  } else {
    $bodyFile = Join-Path $script:Tmp "body.json"
    [System.IO.File]::WriteAllText($bodyFile, (@{ json = $InputObj } | ConvertTo-Json -Depth 12 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    $cargs += @("-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@$bodyFile")
  }
  $cargs += $url

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $code = (& curl.exe @cargs) -join ""
  $sw.Stop()
  $ms = [int]$sw.ElapsedMilliseconds

  $raw = ""
  if (Test-Path $outFile) { $raw = [System.IO.File]::ReadAllText($outFile, [System.Text.Encoding]::UTF8) }
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{ ok = $false; err = "Khong co phan hoi (HTTP $code) — may chu da chay chua?"; data = $null; code = $code; ms = $ms; raw = "" }
  }
  $obj = $null
  try { $obj = $raw | ConvertFrom-Json } catch {
    return @{ ok = $false; err = ("Phan hoi khong phai JSON (HTTP " + $code + "): " + $raw.Substring(0, [Math]::Min(160, $raw.Length))); data = $null; code = $code; ms = $ms; raw = $raw }
  }
  if ($obj.error) {
    $msg = [string]$obj.error.json.message
    if (-not $msg) { $msg = [string]$obj.error.message }
    $codeName = ""
    if ($obj.error.json -and $obj.error.json.data) { $codeName = [string]$obj.error.json.data.code }
    return @{ ok = $false; err = $msg; errCode = $codeName; data = $null; code = $code; ms = $ms; raw = $raw }
  }
  return @{ ok = $true; err = ""; errCode = ""; data = $obj.result.data.json; code = $code; ms = $ms; raw = $raw }
}

function Q($path, $inputObj, $who) { return CallApi -Method "GET" -Path $path -InputObj $inputObj -Who $who }
function Mu($path, $inputObj, $who) { return CallApi -Method "POST" -Path $path -InputObj $inputObj -Who $who }
function QAnon($path, $inputObj) { return CallApi -Method "GET" -Path $path -InputObj $inputObj -NoCookie }
function MuAnon($path, $inputObj) { return CallApi -Method "POST" -Path $path -InputObj $inputObj -NoCookie }

# Gọi HTTP thường (không qua tRPC): trả mã trạng thái + phần đầu nội dung + header
function Http {
  param(
    [string]$Method = "GET",
    [string]$Path,
    [string]$Body = "",
    [hashtable]$ExtraHeaders,
    [switch]$WithHeaders
  )
  $url = "$script:BaseUrl$Path"
  $outFile = Join-Path $script:Tmp "http.out"
  $hdrFile = Join-Path $script:Tmp "http.hdr"
  $cargs = @("-s", "-o", $outFile, "-w", "%{http_code}")
  if ($WithHeaders) { $cargs += @("-D", $hdrFile) }
  if ($ExtraHeaders) {
    foreach ($k in $ExtraHeaders.Keys) { $cargs += @("-H", ($k + ": " + $ExtraHeaders[$k])) }
  }
  if ($Method -ne "GET") {
    $cargs += @("-X", $Method)
    if ($Body) {
      $bodyFile = Join-Path $script:Tmp "http.body"
      [System.IO.File]::WriteAllText($bodyFile, $Body, (New-Object System.Text.UTF8Encoding($false)))
      $cargs += @("-H", "Content-Type: application/json", "--data-binary", "@$bodyFile")
    }
  }
  $cargs += $url
  $code = (& curl.exe @cargs) -join ""
  $body = ""
  if (Test-Path $outFile) { $body = [System.IO.File]::ReadAllText($outFile, [System.Text.Encoding]::UTF8) }
  $hdr = ""
  if ($WithHeaders -and (Test-Path $hdrFile)) { $hdr = [System.IO.File]::ReadAllText($hdrFile, [System.Text.Encoding]::UTF8) }
  return @{ code = $code; body = $body; headers = $hdr }
}

# Mảng sạch (bỏ phần tử rỗng) — tránh đếm nhầm khi lời gọi trả về null.
# QUAN TRỌNG: procedure trả về đối tượng (vd { source, canWaive, items }) thì `@($obj).Count`
# luôn bằng 1 — phải lấy đúng trường mảng bên trong rồi mới đếm.
function Rows($x) {
  return @(@($x) | Where-Object { $null -ne $_ })
}

# Khớp quyền theo đúng luật `matches()` ở packages/core/src/policy/policy.ts:
# "*" khớp mọi tài nguyên / hành động, "*_own" khớp mọi hành động có hậu tố _own.
function KhopQuyen([string]$capCho, [string]$muon) {
  $a = $capCho.Split(":")
  $b = $muon.Split(":")
  if ($a.Count -lt 2 -or $b.Count -lt 2) { return $false }
  if (($a[0] -ne "*") -and ($a[0] -ne $b[0])) { return $false }
  if ($a[1] -eq "*") { return $true }
  if ($a[1] -eq $b[1]) { return $true }
  if (($a[1] -eq "*_own") -and $b[1].EndsWith("_own")) { return $true }
  return $false
}

# Khớp khi tài khoản có ÍT NHẤT MỘT quyền trong danh sách "a|b|c"
function KhopMotTrong($danhSachQuyen, [string]$canMot) {
  foreach ($muon in $canMot.Split("|")) {
    foreach ($p in $danhSachQuyen) { if (KhopQuyen ([string]$p) $muon.Trim()) { return $true } }
  }
  return $false
}

# Gói JSON con thành chuỗi để soi bằng biểu thức chính quy
function Js($obj) {
  if ($null -eq $obj) { return "" }
  try { return ($obj | ConvertTo-Json -Depth 8 -Compress) } catch { return [string]$obj }
}

# Có chuỗi 10 chữ số liền nhau trở lên (số điện thoại chưa che) không?
# Bỏ các mã định danh UUID trước khi soi, vì một đoạn UUID toàn chữ số có thể gây báo nhầm.
function CoSdtTho([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $false }
  $t = [regex]::Replace($text, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<ma-dinh-danh>')
  return [regex]::IsMatch($t, '(?<![\d])[\d]{10,}(?![\d])')
}
# Có email chưa che không? (email đã che luôn chứa ***)
function CoEmailTho([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $false }
  foreach ($m in [regex]::Matches($text, '[A-Za-z0-9._%+*-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')) {
    if (-not $m.Value.Contains("***")) { return $true }
  }
  return $false
}

function LoiBiChan($r) {
  # Một lời gọi bị từ chối đúng cách: không ok, và lý do là quyền / cách ly, không phải lỗi hạ tầng
  if ($r.ok) { return $false }
  if ([string]::IsNullOrWhiteSpace($r.err)) { return $false }
  if ($r.err -match "Khong co phan hoi") { return $false }
  return $true
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " KIEM THU TOAN DIEN — $($script:BaseUrl)" -ForegroundColor Cyan
Write-Host " Bo chay: $Only · $($script:Started.ToString('dd/MM/yyyy HH:mm:ss'))" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------------- #
#  0. Dữ liệu tham chiếu (dùng chung cho mọi bộ)                              #
# --------------------------------------------------------------------------- #
$ping = Q "auth.me" $null $A
if (-not $ping.ok -or $null -eq $ping.data) {
  Write-Host "KHONG DANG NHAP DUOC bang tai khoan mau." -ForegroundColor Red
  Write-Host "  · May chu da chay chua?  pnpm dev" -ForegroundColor Yellow
  Write-Host "  · Da bat ALLOW_DEV_ACTOR=1 trong .env chua?" -ForegroundColor Yellow
  Write-Host "  · Da chay db:push / db:apply-sql / db:seed chua?" -ForegroundColor Yellow
  Write-Host ("  Loi: " + (Say $ping.err)) -ForegroundColor Yellow
  exit 1
}

$centers = @((Q "org.centers" $null $A).data)
$cs1 = @($centers) | Where-Object { $_.code -eq "CS1" } | Select-Object -First 1
$cs2 = @($centers) | Where-Object { $_.code -eq "CS2" } | Select-Object -First 1
$csHue = @($centers) | Where-Object { $_.code -eq "HUE1" } | Select-Object -First 1
$today = (Get-Date).ToString("yyyy-MM-dd")
$rnd = Get-Random -Minimum 100000 -Maximum 999999

# =========================================================================== #
#  BỘ A — BẢO MẬT                                                             #
# =========================================================================== #
if ($Only -eq "tat-ca" -or $Only -eq "bao-mat") {
  Write-Host ""
  Write-Host "===== BO A — BAO MAT =====" -ForegroundColor Cyan

  # --- A1–A2. Mạo danh bằng HEADER x-dev-actor (phải bị bỏ qua) -------------
  $r = CallApi -Method "GET" -Path "auth.me" -InputObj $null -NoCookie -ExtraHeaders @{ "x-dev-actor" = $A }
  $laAi = ""
  if ($r.ok -and $r.data -and $r.data.user) { $laAi = [string]$r.data.user.email }
  T "A" "A01 header x-dev-actor KHONG duoc nhan la quan tri toi cao" ($laAi -ne $A) "auth.me tra null" ("dang nhap thanh: " + $laAi)
  T "A" "A02 header x-dev-actor khong tao ra phien nao" ($r.ok -and $null -eq $r.data) "auth.me = null" ("data = " + (Say (Js $r.data) 80))

  $r = CallApi -Method "GET" -Path "students.list" -InputObj @{ } -NoCookie -ExtraHeaders @{ "x-dev-actor" = $A }
  T "A" "A03 mao danh bang header khong doc duoc danh sach hoc vien" (-not $r.ok) "bi tu choi" ("so dong = " + @($r.data.items).Count)

  # --- A4–A10. Chưa đăng nhập gọi procedure cần quyền -----------------------
  $anonPaths = @(
    @{ p = "students.list";      i = @{ } ;                   ten = "danh sach hoc vien" },
    @{ p = "finance.payments";   i = @{ } ;                   ten = "danh sach phieu thu" },
    @{ p = "hr.staff";           i = @{ } ;                   ten = "ho so nhan su" },
    @{ p = "system.users";       i = @{ } ;                   ten = "tai khoan he thong" },
    @{ p = "system.audit";       i = @{ } ;                   ten = "nhat ky thao tac" },
    @{ p = "tenants.list";       i = $null ;                  ten = "danh sach trung tam" },
    @{ p = "inbox.today";        i = $null ;                  ten = "viec hom nay" }
  )
  $anonErrs = ""
  $iA = 4
  foreach ($ap in $anonPaths) {
    $r = QAnon $ap.p $ap.i
    $anonErrs += " " + [string]$r.err + " " + [string]$r.raw
    $ma = [string]$r.errCode
    $ok = (-not $r.ok) -and (($ma -eq "UNAUTHORIZED") -or ($ma -eq "FORBIDDEN") -or ($r.err -match "(?i)dang nhap|đăng nhập|unauthor|forbidden|quyen|quyền"))
    T "A" ("A" + $iA.ToString("00") + " chua dang nhap khong goi duoc " + $ap.ten) $ok "UNAUTHORIZED/FORBIDDEN" ("ma=" + $ma + " loi=" + $r.err)
    $iA++
  }
  T "A" "A11 thong bao loi khi chua dang nhap khong ro du lieu ca nhan" ((-not (CoSdtTho $anonErrs)) -and (-not (CoEmailTho $anonErrs))) "khong co SDT/email that trong loi" "co du lieu ca nhan trong thong bao loi"

  # --- Dữ liệu tham chiếu cho IDOR: bản ghi của CƠ SỞ 2 --------------------
  $idorReady = ($null -ne $cs1) -and ($null -ne $cs2)
  $leadB = $null; $stuB = $null; $clsB = $null; $sesB = $null; $ordB = $null; $enrB = $null; $staffB = $null
  if ($idorReady) {
    $leadB = @((Q "admissions.leads.inbox" @{ centerId = $cs2.id; allStatuses = $true; limit = 5 } $A).data.items) | Select-Object -First 1
    $stuB = @((Q "students.list" @{ centerId = $cs2.id; pageSize = 5 } $A).data.items) | Select-Object -First 1
    $clsB = @((Q "academics.classes.list" @{ centerId = $cs2.id } $A).data) | Select-Object -First 1
    $tu = (Get-Date).AddDays(-400).ToString("yyyy-MM-dd"); $den = (Get-Date).AddDays(400).ToString("yyyy-MM-dd")
    $sesB = @((Q "academics.sessions.list" @{ from = $tu; to = $den; centerId = $cs2.id } $A).data) | Select-Object -First 1
    $ordB = @((Q "finance.orders" @{ centerId = $cs2.id } $A).data.items) | Select-Object -First 1
    if ($null -eq $ordB) { $ordB = @((Q "finance.orders" @{ centerId = $cs2.id } $A).data) | Select-Object -First 1 }
    $enrB = @((Q "students.enrollments" @{ centerId = $cs2.id; pageSize = 5 } $A).data.items) | Select-Object -First 1
    $staffB = @((Q "hr.staff" @{ centerId = $cs2.id } $A).data.items) | Select-Object -First 1
    if ($null -eq $staffB) { $staffB = @((Q "hr.staff" @{ centerId = $cs2.id } $A).data) | Select-Object -First 1 }
  }

  # --- A12–A20. IDOR: người của cơ sở 1 chạm bản ghi của cơ sở 2 ------------
  $idorErrs = ""
  $idorCases = @(
    @{ ten = "doc lead cua co so khac";        path = "admissions.leads.get";   method = "GET";  who = $S; id = { if ($leadB) { @{ id = $leadB.id } } else { $null } };  bimat = { if ($leadB) { [string]$leadB.parentName } else { "" } } },
    @{ ten = "sua lead cua co so khac";        path = "admissions.leads.update"; method = "POST"; who = $S; id = { if ($leadB) { @{ leadId = $leadB.id; parentName = "QA khong duoc doi"; phone = "090011122" } } else { $null } }; bimat = { "" } },
    @{ ten = "doc hoc vien cua co so khac";    path = "students.get";           method = "GET";  who = $S; id = { if ($stuB) { @{ id = $stuB.id } } else { $null } };      bimat = { if ($stuB) { [string]$stuB.fullName } else { "" } } },
    @{ ten = "sua hoc vien cua co so khac";    path = "students.update";        method = "POST"; who = $S; id = { if ($stuB) { @{ id = $stuB.id; fullName = "QA khong duoc doi"; reason = "Kiem thu IDOR" } } else { $null } }; bimat = { "" } },
    @{ ten = "doc lop cua co so khac";         path = "academics.classes.get";  method = "GET";  who = $G; id = { if ($clsB) { @{ id = $clsB.id } } else { $null } };      bimat = { "" } },
    @{ ten = "doc buoi hoc cua co so khac";    path = "academics.sessions.get"; method = "GET";  who = $G; id = { if ($sesB) { @{ id = $sesB.id } } else { $null } };      bimat = { "" } },
    @{ ten = "doc don hang cua co so khac";    path = "finance.order";          method = "GET";  who = $K; id = { if ($ordB) { @{ id = $ordB.id } } else { $null } };      bimat = { "" } },
    @{ ten = "doc ghi danh cua co so khac";    path = "students.enrollment";    method = "GET";  who = $S; id = { if ($enrB) { @{ id = $enrB.id } } else { $null } };      bimat = { "" } },
    @{ ten = "doc ho so nhan su co so khac";   path = "hr.staffDetail";         method = "GET";  who = $H; id = { if ($staffB) { @{ id = $staffB.id } } else { $null } };  bimat = { if ($staffB) { [string]$staffB.fullName } else { "" } } }
  )
  $iA = 12
  foreach ($c in $idorCases) {
    $inp = & $c.id
    $nhan = "A" + $iA.ToString("00") + " IDOR: " + $c.ten
    if ($null -eq $inp) {
      Skip "A" $nhan "thieu ban ghi mau cua co so 2 trong CSDL"
    } else {
      $r = CallApi -Method $c.method -Path $c.path -InputObj $inp -Who $c.who
      $idorErrs += " " + [string]$r.err
      $bimat = & $c.bimat
      $loRa = $false
      if ($bimat -and $r.err) { $loRa = $r.err.Contains($bimat) }
      T "A" $nhan ((LoiBiChan $r) -and (-not $loRa)) "bi tu choi, thong bao khong kem du lieu ban ghi" ("ok=" + $r.ok + " loi=" + $r.err)
    }
    $iA++
  }
  T "A" "A21 thong bao loi IDOR khong ro SDT / email that" ((-not (CoSdtTho $idorErrs)) -and (-not (CoEmailTho $idorErrs))) "khong co SDT/email that" "thong bao loi co du lieu ca nhan"

  # --- A22–A27. Leo thang quyền -------------------------------------------
  $userNao = @((Q "system.users" @{ } $A).data.items) | Where-Object { $_.email -ne $A } | Select-Object -First 1
  if ($null -eq $userNao) { $userNao = @((Q "system.users" @{ } $A).data) | Where-Object { $_.email -ne $A } | Select-Object -First 1 }
  $kyTruoc = (Get-Date).AddMonths(-1).ToString("yyyy-MM")
  $leoThang = @(
    @{ ten = "quan ly co so khoa tai khoan";       path = "system.setLock";        who = $M; inp = { if ($userNao) { @{ userId = $userNao.id; lock = $true; reason = "Kiem thu leo thang quyen" } } else { $null } } },
    @{ ten = "tu van cap vai tro cho nguoi khac";  path = "system.grantRole";      who = $S; inp = { if ($userNao) { @{ userId = $userNao.id; role = "SUPER_ADMIN"; centerId = $null } } else { $null } } },
    @{ ten = "tu van chot ky cong";                path = "hr.lockPeriod";         who = $S; inp = { if ($cs1) { @{ centerId = $cs1.id; period = $kyTruoc } } else { $null } } },
    @{ ten = "giao vu doi cau hinh he thong";      path = "admin.saveSettings";    who = $G; inp = { @{ brandName = "QA doi ten"; legalName = ""; hotline = ""; supportEmail = ""; website = ""; headOfficeAddress = ""; taxCode = ""; receiptFooter = ""; zaloOaId = ""; timezone = "Asia/Ho_Chi_Minh"; parentAppUrl = "" } } },
    @{ ten = "quan ly co so nhan ban trung tam";   path = "tenants.provision";     who = $M; inp = { @{ sourceTenantId = "00000000-0000-0000-0000-000000000001"; code = "QAX"; name = "QA khong duoc tao"; centerCode = "QAX1"; centerName = "QA co so"; adminEmail = "qa.khong.duoc@example.test"; adminFullName = "QA Test"; reason = "Kiem thu leo thang quyen nhan ban" } } },
    @{ ten = "ke toan doi tuy chon quyen rieng tu"; path = "tenants.updateSettings"; who = $K; inp = { @{ tenantId = "00000000-0000-0000-0000-000000000001"; hoSeesPii = $true; reason = "Kiem thu leo thang quyen" } } }
  )
  $iA = 22
  foreach ($c in $leoThang) {
    $inp = & $c.inp
    $nhan = "A" + $iA.ToString("00") + " leo thang: " + $c.ten
    if ($null -eq $inp) {
      Skip "A" $nhan "thieu du lieu mau de dung phep thu"
    } else {
      $r = Mu $c.path $inp $c.who
      T "A" $nhan (LoiBiChan $r) "bi tu choi" ("ok=" + $r.ok + " loi=" + $r.err)
    }
    $iA++
  }

  # --- A28–A31. Tải tệp --------------------------------------------------
  $sesCs1 = $null
  if ($cs1) {
    $tu = (Get-Date).AddDays(-120).ToString("yyyy-MM-dd"); $den = (Get-Date).AddDays(120).ToString("yyyy-MM-dd")
    $sesCs1 = @((Q "academics.sessions.list" @{ from = $tu; to = $den; centerId = $cs1.id } $G).data) | Select-Object -First 1
  }
  if ($null -eq $sesCs1) {
    Skip "A" "A28 tep khai image/png nhung noi dung khong phai PNG" "khong lay duoc buoi hoc mau o co so 1"
    Skip "A" "A29 tep .svg bi tu choi" "khong lay duoc buoi hoc mau o co so 1"
    Skip "A" "A30 ten tep co ../ duoc lam sach" "khong lay duoc buoi hoc mau o co so 1"
  } else {
    # (a) khai image/png nhưng nội dung là văn bản
    $fakePng = Join-Path $script:Tmp "gia-mao.png"
    [System.IO.File]::WriteAllText($fakePng, "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", (New-Object System.Text.UTF8Encoding($false)))
    $o = Join-Path $script:Tmp "up1.json"
    $code = (& curl.exe -s -o $o -w "%{http_code}" -b "x-dev-actor=$G" -F ("sessionId=" + $sesCs1.id) -F ("files=@" + $fakePng + ";type=image/png") "$script:BaseUrl/api/media/upload") -join ""
    $body = ""
    if (Test-Path $o) { $body = [System.IO.File]::ReadAllText($o, [System.Text.Encoding]::UTF8) }
    # Khẳng định `ok` của NGHIỆP VỤ (thân phản hồi), không chỉ mã HTTP
    if ($code -eq "401" -or $code -eq "403") {
      Skip "A" "A28 tep khai image/png nhung noi dung khong phai PNG -> tu choi" ("tai khoan giao vu khong tai len duoc anh o buoi nay: HTTP " + $code)
    } else {
      T "A" "A28 tep khai image/png nhung noi dung khong phai PNG -> tu choi" ($body -match '"ok":false') "than phan hoi co ok:false" ("HTTP " + $code + " " + (Short $body 120))
    }

    # (b) tệp .svg
    $svg = Join-Path $script:Tmp "anh-nguy-hiem.svg"
    [System.IO.File]::WriteAllText($svg, "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", (New-Object System.Text.UTF8Encoding($false)))
    $o2 = Join-Path $script:Tmp "up2.json"
    $code2 = (& curl.exe -s -o $o2 -w "%{http_code}" -b "x-dev-actor=$G" -F ("sessionId=" + $sesCs1.id) -F ("files=@" + $svg + ";type=image/svg+xml") "$script:BaseUrl/api/media/upload") -join ""
    $body2 = ""
    if (Test-Path $o2) { $body2 = [System.IO.File]::ReadAllText($o2, [System.Text.Encoding]::UTF8) }
    if ($code2 -eq "401" -or $code2 -eq "403") {
      Skip "A" "A29 tep .svg -> tu choi" ("tai khoan giao vu khong tai len duoc anh o buoi nay: HTTP " + $code2)
    } else {
      T "A" "A29 tep .svg -> tu choi" ($body2 -match '"ok":false') "than phan hoi co ok:false" ("HTTP " + $code2 + " " + (Short $body2 120))
    }

    # (c) tên tệp có ../ — ảnh PNG thật, kiểm tra khoá lưu trữ đã được làm sạch
    $pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    $pngFile = Join-Path $script:Tmp "qa-anh-that.png"
    [System.IO.File]::WriteAllBytes($pngFile, [Convert]::FromBase64String($pngB64))
    $o3 = Join-Path $script:Tmp "up3.json"
    # `classWide=1`: ảnh QA phải tự đủ điều kiện gửi duyệt, nếu không nó nằm đầu kho ảnh
    # của lớp và làm hỏng luồng kho → gửi duyệt → loại → khôi phục của kich-ban-vai-tro.ps1.
    $code3 = (& curl.exe -s -o $o3 -w "%{http_code}" -b "x-dev-actor=$G" -F ("sessionId=" + $sesCs1.id) -F ("caption=QA-KIEM-THU-" + $script:Stamp) -F "classWide=1" -F ("files=@" + $pngFile + ";filename=../../../etc/qa-traversal.png;type=image/png") "$script:BaseUrl/api/media/upload") -join ""
    $body3 = ""
    if (Test-Path $o3) { $body3 = [System.IO.File]::ReadAllText($o3, [System.Text.Encoding]::UTF8) }
    if ($code3 -eq "200" -and $body3 -match '"ok":true') {
      $ups = $null
      try { $ups = $body3 | ConvertFrom-Json } catch { $ups = $null }
      $newId = @($ups.results | Where-Object { $_.ok }) | Select-Object -First 1
      $media = @((Q "learning.media" @{ sessionId = $sesCs1.id; limit = 200 } $G).data) | Where-Object { $newId -and $_.id -eq $newId.id } | Select-Object -First 1
      if ($null -eq $media) {
        Skip "A" "A30 ten tep co ../ duoc lam sach" "khong doc lai duoc anh vua tai len de kiem tra khoa luu tru"
      } else {
        Created ("Anh lop QA (session_media id=" + $media.id + ", caption QA-KIEM-THU-" + $script:Stamp + ", danh dau anh chung ca lop)")
        $key = [string]$media.objectKey
        T "A" "A30 ten tep co ../ -> khoa luu tru duoc lam sach" ((-not $key.Contains("..")) -and (-not $key.StartsWith("/"))) "khoa khong chua .. va khong bat dau bang /" ("objectKey=" + (Short $key 120))
      }
    } else {
      Skip "A" "A30 ten tep co ../ duoc lam sach" ("khong tai len duoc anh PNG hop le: HTTP " + $code3 + " " + (Short $body3 100))
    }
  }

  # A31: đường dẫn vượt thư mục qua URL phát ảnh
  $rf = Http -Method "GET" -Path "/api/media/file?key=../../../../etc/passwd&exp=99999999999&sig=khonghople"
  T "A" "A31 URL phat anh voi duong dan vuot thu muc -> tu choi" (($rf.code -eq "403") -or ($rf.code -eq "404")) "HTTP 403/404" ("HTTP " + $rf.code)

  # --- A32–A33. Chống dò tần suất -----------------------------------------
  $sdtGia = "0900" + (Get-Random -Minimum 100000 -Maximum 999999)
  $bi429 = $false
  for ($i = 1; $i -le 26; $i++) {
    $rr = Http -Method "POST" -Path "/api/ph/login" -Body ('{"action":"login","phone":"' + $sdtGia + '","method":"code","code":"000000"}')
    if ($rr.code -eq "429") { $bi429 = $true; break }
  }
  T "A" "A32 dang nhap cong phu huynh sai nhieu lan -> bi chan tan suat" $bi429 "HTTP 429 sau <=26 lan thu" "khong lan nao bi chan (429)"
  Created ("Nhat ky dang nhap that bai cua so dien thoai gia " + $sdtGia + " (bang login_events / otp_requests)")
  Note "A32/A33 dung het han muc tan suat cua dia chi IP dang chay trong 15 phut (cong phu huynh) va 1 gio (OTP). Cho het khoang do truoc khi kiem thu tay tren cung may."

  $bi429b = $false
  for ($i = 1; $i -le 36; $i++) {
    $rr = Http -Method "POST" -Path "/api/public/otp" -Body ('{"action":"request","phone":"' + $sdtGia + '","purpose":"parent_login"}')
    if ($rr.code -eq "429") { $bi429b = $true; break }
  }
  T "A" "A33 xin ma OTP lien tuc -> bi chan tan suat" $bi429b "HTTP 429 sau <=36 lan thu" "khong lan nao bi chan (429)"
  Note "A33 co the bi chan boi tran theo so dien thoai trong CSDL (1 ma / 60 giay) truoc khi cham tran theo IP — ca hai deu la chan tan suat hop le."

  # --- A34–A38. Header bảo mật trên trang HTML ----------------------------
  $hp = Http -Method "GET" -Path "/login" -WithHeaders
  $hdr = $hp.headers.ToLower()
  T "A" "A34 co X-Content-Type-Options: nosniff" ($hdr -match "x-content-type-options:\s*nosniff") "co nosniff" ("HTTP " + $hp.code)
  T "A" "A35 co X-Frame-Options hoac frame-ancestors" (($hdr -match "x-frame-options:") -or ($hdr -match "frame-ancestors")) "co chong nhung khung" ("HTTP " + $hp.code)
  T "A" "A36 co Referrer-Policy" ($hdr -match "referrer-policy:") "co Referrer-Policy" ("HTTP " + $hp.code)
  T "A" "A37 co Permissions-Policy" ($hdr -match "permissions-policy:") "co Permissions-Policy" ("HTTP " + $hp.code)
  T "A" "A38 co Content-Security-Policy" ($hdr -match "content-security-policy:") "co CSP" ("HTTP " + $hp.code)

  # --- A39. Endpoint cron không có bí mật ---------------------------------
  $cr = Http -Method "GET" -Path "/api/cron/outbox" -ExtraHeaders @{ "Authorization" = "Bearer bi-mat-sai-cua-kiem-thu" }
  if ($cr.code -eq "401" -or $cr.code -eq "403" -or $cr.code -eq "503") {
    T "A" "A39 cron khong co bi mat dung -> tu choi" $true "HTTP 401/503" ("HTTP " + $cr.code)
  } elseif ($cr.code -eq "200") {
    Skip "A" "A39 cron khong co bi mat dung -> tu choi" "moi truong phat trien chua dat CRON_SECRET nen cho goi tay (HTTP 200) — dat CRON_SECRET roi chay lai de kiem tra that"
  } else {
    T "A" "A39 cron khong co bi mat dung -> tu choi" $false "HTTP 401/503" ("HTTP " + $cr.code)
  }

  # --- A40–A41. Nhật ký sau khi xuất dữ liệu ------------------------------
  $truoc = [int](Def (Q "system.audit" @{ module = "students"; action = "PII_REVEAL" } $A).data.total 0)
  $ex = Q "students.exportRows" @{ } $A
  Start-Sleep -Milliseconds 400
  $sau = [int](Def (Q "system.audit" @{ module = "students"; action = "PII_REVEAL" } $A).data.total 0)
  if (-not $ex.ok) {
    Skip "A" "A40 xuat hoc vien -> co ban ghi nhat ky" ("khong goi duoc students.exportRows: " + (Say $ex.err 120))
  } else {
    Created ("Nhat ky PII_REVEAL do kiem thu tao (module students, " + $script:Started.ToString("dd/MM HH:mm") + ")")
    T "A" "A40 xuat hoc vien -> co ban ghi nhat ky tuong ung" ($sau -gt $truoc) ("so dong PII_REVEAL tang tu " + $truoc) ("truoc=" + $truoc + " sau=" + $sau)
  }
  $truocL = [int](Def (Q "system.audit" @{ module = "admissions"; entity = "leads"; action = "PII_REVEAL" } $A).data.total 0)
  $exL = Q "admissions.leads.exportRows" @{ scope = "all" } $A
  Start-Sleep -Milliseconds 400
  $sauL = [int](Def (Q "system.audit" @{ module = "admissions"; entity = "leads"; action = "PII_REVEAL" } $A).data.total 0)
  if (-not $exL.ok) {
    Skip "A" "A41 xuat lead -> co ban ghi nhat ky" ("khong goi duoc admissions.leads.exportRows: " + (Say $exL.err 120))
  } else {
    Created ("Nhat ky PII_REVEAL do kiem thu tao (module leads, " + $script:Started.ToString("dd/MM HH:mm") + ")")
    T "A" "A41 xuat lead -> co ban ghi nhat ky tuong ung" ($sauL -gt $truocL) ("so dong PII_REVEAL tang tu " + $truocL) ("truoc=" + $truocL + " sau=" + $sauL)
  }

  # --- A42. Nhật ký mặc định che dữ liệu cá nhân --------------------------
  $aud = Rows (Q "system.audit" @{ } $A).data.items
  if ($aud.Count -eq 0) {
    Skip "A" "A42 nhat ky che SDT / email mac dinh" "nhat ky rong"
  } else {
    $jsAud = Js $aud
    T "A" "A42 nhat ky che SDT / email mac dinh" ($jsAud -match "\*\*\*") "co chuoi *** trong nhat ky" ("so dong=" + $aud.Count)
  }
}

# =========================================================================== #
#  BỘ B — CÁCH LY DỮ LIỆU THEO TRUNG TÂM (TENANT)                             #
# =========================================================================== #
if ($Only -eq "tat-ca" -or $Only -eq "tenant") {
  Write-Host ""
  Write-Host "===== BO B — CACH LY TRUNG TAM (TENANT) =====" -ForegroundColor Cyan

  $tl = Q "tenants.list" $null $A
  if (-not $tl.ok) {
    Skip "B" "B01 doc duoc danh sach trung tam" ("tenants.list bi tu choi: " + (Say $tl.err 150) + " — da chay db:apply-sql (0005_nhuong_quyen.sql) chua?")
    Note "Bo B bi bo qua gan het vi khong doc duoc tenants.list."
  } else {
    $tenants = @($tl.data.items)
    $tSata = @($tenants) | Where-Object { $_.code -eq "SATA" } | Select-Object -First 1
    $tFr = @($tenants) | Where-Object { $_.code -eq "FR_HUE" } | Select-Object -First 1
    T "B" "B01 quan tri chuoi thay ca SATA va FR_HUE" (($null -ne $tSata) -and ($null -ne $tFr)) "co du 2 trung tam mau" ("so trung tam=" + $tenants.Count)

    $r = Q "tenants.list" $null $M
    T "B" "B02 quan ly co so khong doc duoc danh sach trung tam" (LoiBiChan $r) "bi tu choi (thieu quyen tenant:read)" ("ok=" + $r.ok)

    if ($null -eq $tFr) {
      Skip "B" "B03..B14 cach ly du lieu cua FR_HUE" "khong co tenant FR_HUE trong CSDL — chay lai pnpm db:seed"
    } else {
      T "B" "B03 FR_HUE mac dinh KHONG cho Hoi so xem du lieu ca nhan" ($tFr.hoSeesPii -eq $false) "hoSeesPii=false" ("hoSeesPii=" + $tFr.hoSeesPii)
      T "B" "B04 FR_HUE mac dinh KHONG cho Hoi so xem chi tiet tai chinh" ($tFr.hoSeesFinanceDetail -eq $false) "hoSeesFinanceDetail=false" ("hoSeesFinanceDetail=" + $tFr.hoSeesFinanceDetail)
      T "B" "B05 FR_HUE mac dinh KHONG cho chuyen HV/lead lien trung tam" ($tFr.allowCrossCenterTransfer -eq $false) "allowCrossCenterTransfer=false" ("allowCrossCenterTransfer=" + $tFr.allowCrossCenterTransfer)
      T "B" "B06 Hoi so van thay so lieu TONG HOP cua FR_HUE" (($null -ne $tFr.leads) -and ($null -ne $tFr.revenue30d) -and ($null -ne $tFr.debt)) "co so lead / doanh thu / cong no" ("lead=" + $tFr.leads + " doanhthu30d=" + $tFr.revenue30d + " congno=" + $tFr.debt)
      T "B" "B07 Hoi so duoc danh dau la KHONG xem duoc PII cua FR_HUE" ($tFr.seesPii -eq $false) "seesPii=false" ("seesPii=" + $tFr.seesPii)

      $g = Q "tenants.get" @{ id = $tFr.id } $A
      T "B" "B08 doc duoc ho so FR_HUE nhung khong sua duoc tuy chon" ($g.ok -and ($g.data.canEditSettings -eq $false)) "canEditSettings=false" ("ok=" + $g.ok + " canEdit=" + $g.data.canEditSettings)

      $r = Mu "tenants.updateSettings" @{ tenantId = $tFr.id; hoSeesPii = $true; reason = "Kiem thu: Hoi so tu mo quyen xem du lieu ca nhan" } $A
      $viet = $false
      if ($r.err) { $viet = ($r.err -match "tr(u|ư)ng t(a|â)m|quan tri|quản trị|ri(e|ê)ng t(u|ư)") }
      T "B" "B09 Hoi so KHONG tu bat duoc cong tac quyen rieng tu cua FR_HUE" ((LoiBiChan $r) -and $viet) "tu choi kem thong bao tieng Viet" ("ok=" + $r.ok + " loi=" + $r.err)

      # --- B10–B12. PII của FR_HUE phải ở dạng đã che khi Hội sở đọc -------
      if ($null -eq $csHue) {
        Skip "B" "B10..B12 che PII cua FR_HUE" "khong tim thay co so HUE1"
      } else {
        $ld = Q "admissions.leads.inbox" @{ scope = "all"; centerId = $csHue.id; allStatuses = $true; limit = 50 } $A
        $items = Rows $ld.data.items
        if ((-not $ld.ok) -or ($items.Count -eq 0)) {
          Skip "B" "B10..B12 che PII cua FR_HUE" "khong co lead nao cua co so HUE1"
        } else {
          $jsLd = Js $items
          T "B" "B10 SDT trong danh sach lead cua FR_HUE da duoc che" (-not (CoSdtTho $jsLd)) "khong con 10 chu so lien nhau" "con SDT day du trong ket qua"
          $hoTen = ($items | ForEach-Object { [string]$_.parentName }) -join " | "
          $tenDaChe = $true
          foreach ($it in $items) {
            $ten = [string]$it.parentName
            if ($ten -and ($ten -notmatch "\*|\.\s|\.$")) { $tenDaChe = $false }
          }
          T "B" "B11 ho ten phu huynh cua FR_HUE da duoc rut gon / che" $tenDaChe "dang Nguyen V. A." ("vi du: " + (Say $hoTen 100))
          $ex = Q "admissions.leads.exportRows" @{ scope = "all"; centerId = $csHue.id; allStatuses = $true } $A
          $jsEx = Js $ex.data
          T "B" "B12 ban xuat lead cua FR_HUE khong lo email that" (-not (CoEmailTho $jsEx)) "email dang a***@nha-cung-cap" "con email day du trong ban xuat"
        }

        # Học viên của FR_HUE (seed có thể chưa có) --------------------------
        $st = Q "students.list" @{ centerId = $csHue.id; pageSize = 50 } $A
        $sItems = Rows $st.data.items
        if ((-not $st.ok) -or ($sItems.Count -eq 0)) {
          Skip "B" "B13 che PII danh sach hoc vien cua FR_HUE" "FR_HUE chua co hoc vien trong CSDL mau"
        } else {
          $jsSt = Js $sItems
          T "B" "B13 danh sach hoc vien cua FR_HUE da che SDT / ho ten" ((-not (CoSdtTho $jsSt)) -and (-not (CoEmailTho $jsSt))) "SDT va email deu da che" "con du lieu ca nhan chua che"
        }

        # Chi tiết tài chính: không dòng nào thuộc cơ sở của FR_HUE ---------
        $pay = Q "finance.payments" @{ } $A
        $pItems = Rows $pay.data.items
        $loTaiChinh = @($pItems | Where-Object { $_.centerId -eq $csHue.id }).Count
        T "B" "B14 danh sach phieu thu KHONG co dong chi tiet cua FR_HUE" ($loTaiChinh -eq 0) "0 dong cua FR_HUE" ("so dong lo ra=" + $loTaiChinh)
      }

      # --- B15. Chuyển lead sang trung tâm khác bị chặn --------------------
      if (($null -eq $csHue) -or ($null -eq $cs1)) {
        Skip "B" "B15 chan chuyen lead sang trung tam khac" "thieu co so CS1 hoac HUE1"
      } else {
        $leadA = @((Q "admissions.leads.inbox" @{ scope = "all"; centerId = $cs1.id; allStatuses = $true; limit = 5 } $A).data.items) | Select-Object -First 1
        if ($null -eq $leadA) {
          Skip "B" "B15 chan chuyen lead sang trung tam khac" "khong co lead nao o co so CS1"
        } else {
          $r = Mu "admissions.leads.transfer" @{ leadId = $leadA.id; toCenterId = $csHue.id; handoverNote = "Kiem thu cach ly trung tam: thu chuyen lead sang ben nhuong quyen de xem he thong co chan khong" } $A
          $viet = $false
          if ($r.err) { $viet = ($r.err -match "tr(u|ư)ng t(a|â)m|kh(o|ô)ng cho ph(e|é)p|c(a|á)ch ly") }
          T "B" "B15 chan chuyen lead sang trung tam khac (allowCrossCenterTransfer=false)" ((LoiBiChan $r) -and $viet) "tu choi kem thong bao tieng Viet" ("ok=" + $r.ok + " loi=" + $r.err)
        }
      }

      # --- B16. Danh sách lớp nhận chuyển lớp không được lẫn lớp của tenant khác
      # `students.enrollments` trả về ĐỐI TƯỢNG phân trang { total, page, pageSize, counts, items }
      # và `students.eligibleClasses` trả về { source, canWaive, items } — phải lấy `.items`,
      # đếm thẳng đối tượng thì lúc nào cũng ra 1.
      $enrMo = (Rows (Q "students.enrollments" @{ centerId = $cs1.id; status = "active"; pageSize = 5 } $A).data.items) | Select-Object -First 1
      # Cơ sở nào thuộc trung tâm nào — dựng sống từ tenants.get của từng trung tâm
      $tenantCuaCoSo = @{ }
      foreach ($tn in $tenants) {
        $tg = Q "tenants.get" @{ id = $tn.id } $A
        if (-not $tg.ok) { continue }
        foreach ($cc in (Rows $tg.data.centers)) { $tenantCuaCoSo[[string]$cc.id] = [string]$tn.id }
      }
      $tenantKhacCoLop = @($tenants | Where-Object { ($null -ne $enrMo) -and ($_.id -ne $enrMo.tenantId) -and ([int](Def $_.classes 0) -gt 0) })
      if ($null -eq $enrMo) {
        Skip "B" "B16 danh sach lop nhan chuyen lop khong lan lop cua trung tam khac" "khong co ghi danh dang hoc nao o co so CS1"
      } elseif ($tenantKhacCoLop.Count -eq 0) {
        Skip "B" "B16 danh sach lop nhan chuyen lop khong lan lop cua trung tam khac" "khong co trung tam thu hai nao dang co lop de doi chieu"
      } else {
        $el = Q "students.eligibleClasses" @{ enrollmentId = $enrMo.id } $A
        $lops = Rows $el.data.items
        $lopKhacTenant = New-Object System.Collections.ArrayList
        foreach ($lp in $lops) {
          $tOfLop = $tenantCuaCoSo[[string]$lp.centerId]
          if ($tOfLop -and ($tOfLop -ne [string]$enrMo.tenantId)) { [void]$lopKhacTenant.Add([string]$lp.centerCode + "/" + [string]$lp.code) }
        }
        T "B" "B16 danh sach lop nhan chuyen lop khong lan lop cua trung tam khac" ($lopKhacTenant.Count -eq 0) "0 lop thuoc trung tam khac" ("so lop tra ve=" + $lops.Count + " | lop khac trung tam: " + ($lopKhacTenant -join ", "))
      }

      # --- B17. assertSameTenant: đọc bản ghi của tenant khác --------------
      $leadFr = @((Q "admissions.leads.inbox" @{ scope = "all"; centerId = $csHue.id; allStatuses = $true; limit = 5 } $A).data.items) | Select-Object -First 1
      if ($null -eq $leadFr) {
        Skip "B" "B17 nguoi cua chuoi (gan co so) khong doc duoc lead cua tenant khac" "khong co lead nao cua FR_HUE"
      } else {
        $r = Q "admissions.leads.get" @{ id = $leadFr.id } $M
        $loTen = $false
        if ($r.err -and $leadFr.parentName) { $loTen = $r.err.Contains([string]$leadFr.parentName) }
        T "B" "B17 quan ly co so khong doc duoc lead cua trung tam khac" ((LoiBiChan $r) -and (-not $loTen)) "tu choi, thong bao khong kem ten phu huynh" ("ok=" + $r.ok + " loi=" + $r.err)
      }
    }

    # --- B18–B20. Chiều ngược lại: người của FR_HUE không thấy dữ liệu SATA
    # Tài khoản của bên nhượng quyền: dùng tài khoản đang hoạt động, dự phòng tài khoản chờ kích hoạt
    $frActor = $FR
    $frMe = Q "auth.me" $null $FR
    if ((-not $frMe.ok) -or ($null -eq $frMe.data)) {
      $frActor = $FR2
      $frMe = Q "auth.me" $null $FR2
    }
    $frSong = ($frMe.ok -and $null -ne $frMe.data)
    if (-not $frSong) {
      Note ("Khong dang nhap duoc bang tai khoan nao cua FR_HUE (" + $FR + " / " + $FR2 + "). Cac kiem tra chieu FR_HUE -> SATA bi bo qua. Chay lai pnpm db:seed de co tai khoan mau dang hoat dong cua ben nhuong quyen.")
      Skip "B" "B18 nguoi cua FR_HUE chi thay co so cua minh" "tai khoan FR_HUE dang cho kich hoat"
      Skip "B" "B19 nguoi cua FR_HUE khong thay lead / hoc vien cua SATA" "tai khoan FR_HUE dang cho kich hoat"
      Skip "B" "B20 nguoi cua FR_HUE chi thay chinh trung tam minh trong tenants.list" "tai khoan FR_HUE dang cho kich hoat"
      Skip "B" "B21 FR_HUE bat hoSeesPii -> Hoi so doc thay day du, tat lai -> che lai" "tai khoan FR_HUE dang cho kich hoat"
    } else {
      $cFr = Rows (Q "org.centers" $null $frActor).data
      $loCs = @($cFr | Where-Object { $_.code -eq "CS1" -or $_.code -eq "CS2" }).Count
      T "B" "B18 nguoi cua FR_HUE chi thay co so cua minh" ($loCs -eq 0) "khong thay CS1 / CS2" ("so co so SATA lo ra=" + $loCs)

      $ldFr = Rows (Q "admissions.leads.inbox" @{ scope = "all"; allStatuses = $true; limit = 200 } $frActor).data.items
      $loLead = 0
      if ($cs1) { $loLead += @($ldFr | Where-Object { $_.centerId -eq $cs1.id }).Count }
      if ($cs2) { $loLead += @($ldFr | Where-Object { $_.centerId -eq $cs2.id }).Count }
      $stFr = Rows (Q "students.list" @{ pageSize = 100 } $frActor).data.items
      $loStu = 0
      if ($cs1) { $loStu += @($stFr | Where-Object { $_.homeCenterId -eq $cs1.id }).Count }
      T "B" "B19 nguoi cua FR_HUE khong thay lead / hoc vien cua SATA" (($loLead -eq 0) -and ($loStu -eq 0)) "0 ban ghi cua SATA" ("lead lo=" + $loLead + " hoc vien lo=" + $loStu)

      $tlFr = Rows (Q "tenants.list" $null $frActor).data.items
      $loTen = @($tlFr | Where-Object { $_.code -ne "FR_HUE" }).Count
      T "B" "B20 nguoi cua FR_HUE chi thay chinh trung tam minh" ($loTen -eq 0) "chi 1 trung tam" ("so trung tam khac lo ra=" + $loTen)

      # B21 — vòng tròn bật / tắt hoSeesPii rồi trả về trạng thái ban đầu
      if ($null -eq $tFr -or $null -eq $csHue) {
        Skip "B" "B21 FR_HUE bat hoSeesPii -> Hoi so doc thay day du, tat lai -> che lai" "thieu tenant FR_HUE hoac co so HUE1"
      } else {
        $banDau = $tFr.hoSeesPii
        $on = Mu "tenants.updateSettings" @{ tenantId = $tFr.id; hoSeesPii = $true; reason = "Kiem thu cach ly: bat tam thoi de doi chieu, se tat lai ngay" } $frActor
        if (-not $on.ok) {
          Skip "B" "B21 FR_HUE bat hoSeesPii -> Hoi so doc thay day du, tat lai -> che lai" ("khong bat duoc cong tac: " + (Say $on.err 140))
        } else {
          Created ("Da doi tam thoi tuy chon hoSeesPii cua FR_HUE (kiem thu se tra ve " + $banDau + ")")
          Start-Sleep -Milliseconds 300
          $mo = Js @((Q "admissions.leads.inbox" @{ scope = "all"; centerId = $csHue.id; allStatuses = $true; limit = 50 } $A).data.items)
          T "B" "B21 bat hoSeesPii -> Hoi so doc thay du lieu day du" ((CoSdtTho $mo) -or (CoEmailTho $mo)) "thay SDT / email day du" "van con bi che sau khi bat cong tac"
          $off = Mu "tenants.updateSettings" @{ tenantId = $tFr.id; hoSeesPii = $banDau; reason = "Kiem thu cach ly: tra ve trang thai ban dau" } $frActor
          Start-Sleep -Milliseconds 300
          $che = Js @((Q "admissions.leads.inbox" @{ scope = "all"; centerId = $csHue.id; allStatuses = $true; limit = 50 } $A).data.items)
          T "B" "B22 tat hoSeesPii -> du lieu bi che lai va tra ve trang thai ban dau" ($off.ok -and (-not (CoSdtTho $che))) "che lai va khoi phuc nguyen trang" ("tra ve ok=" + $off.ok)
        }
      }
    }

    # --- B23–B25. Vòng tròn đổi tuỳ chọn trên CHÍNH tenant của người thao tác
    if ($null -eq $tSata) {
      Skip "B" "B23..B25 doi tuy chon quyen rieng tu cua chinh trung tam minh" "khong tim thay tenant SATA"
    } else {
      $goc = $tSata.allowCrossCenterTransfer
      $r = Mu "tenants.updateSettings" @{ tenantId = $tSata.id; allowCrossCenterTransfer = $false; reason = "Kiem thu vong tron doi tuy chon" } $A
      T "B" "B23 quan tri cua chinh trung tam doi duoc tuy chon (co ly do)" $r.ok "thanh cong" ("loi=" + $r.err)
      if ($r.ok) {
        Created ("Da doi tam thoi tuy chon allowCrossCenterTransfer cua SATA (kiem thu tra ve " + $goc + ")")
        $doc = @((Q "tenants.list" $null $A).data.items) | Where-Object { $_.code -eq "SATA" } | Select-Object -First 1
        T "B" "B24 doc lai thay dung gia tri vua dat" ($doc.allowCrossCenterTransfer -eq $false) "allowCrossCenterTransfer=false" ("doc duoc=" + $doc.allowCrossCenterTransfer)
        $back = Mu "tenants.updateSettings" @{ tenantId = $tSata.id; allowCrossCenterTransfer = $goc; reason = "Kiem thu: tra ve trang thai ban dau" } $A
        $doc2 = @((Q "tenants.list" $null $A).data.items) | Where-Object { $_.code -eq "SATA" } | Select-Object -First 1
        T "B" "B25 tra ve trang thai ban dau sau khi kiem thu" ($back.ok -and ($doc2.allowCrossCenterTransfer -eq $goc)) ("tro lai " + $goc) ("hien tai=" + $doc2.allowCrossCenterTransfer)
      }
      $r = Mu "tenants.updateSettings" @{ tenantId = $tSata.id; hoSeesPii = $true; reason = "abc" } $A
      T "B" "B26 doi tuy chon khong co ly do du dai -> bi chan" (LoiBiChan $r) "tu choi vi ly do < 5 ky tu" ("ok=" + $r.ok + " loi=" + $r.err)
    }

    # --- B27–B29. Bảng kê nhân bản ------------------------------------------
    $mau = Q "tenants.templates" $null $A
    $mauList = @($mau.data)
    T "B" "B27 danh sach mo hinh mau chi gom trung tam cua chuoi (OWNED)" ($mau.ok -and ($mauList.Count -ge 1) -and (@($mauList | Where-Object { $_.code -eq "FR_HUE" }).Count -eq 0)) "co SATA, khong co FR_HUE" ("so mau=" + $mauList.Count)

    $nguon = $null
    if ($null -ne $tSata) { $nguon = $tSata.id } elseif ($mauList.Count -gt 0) { $nguon = $mauList[0].id }
    if ($null -eq $nguon) {
      Skip "B" "B28..B40 nhan ban mot cham" "khong xac dinh duoc trung tam mau (nguon)"
    } else {
      $pv = Q "tenants.previewProvision" @{ sourceTenantId = $nguon; roomCount = 2 } $A
      $lines = @($pv.data.lines)
      T "B" "B28 bang ke nhan ban co du dong" ($pv.ok -and ($lines.Count -gt 0)) "so dong > 0" ("so dong=" + $lines.Count)
      T "B" "B29 bang ke co so ban ghi se sao chep > 0" ($pv.data.totalCopy -gt 0) "totalCopy > 0" ("totalCopy=" + $pv.data.totalCopy)
      $khongChep = @($lines | Where-Object { $_.kind -eq "skip" })
      $khongChepSai = @($khongChep | Where-Object { $_.count -ne 0 }).Count
      T "B" "B30 bang ke ghi ro KHONG sao chep lead / hoc vien / nhan su / giao dich" (($khongChep.Count -ge 4) -and ($khongChepSai -eq 0)) "cac dong 'khong sao chep' deu = 0" ("so dong skip=" + $khongChep.Count + " sai=" + $khongChepSai)

      # --- Nhân bản thật: mã QA + dấu thời gian ---------------------------
      $ma = "QA" + $script:Stamp.Substring(6, 8)     # QA + ddHHmmss (10 ky tu, <= 12)
      $maCs = "QAC" + $script:Stamp.Substring(6, 8)
      $emailQt = "qa.provision." + $script:Stamp + "@example.test"
      $pr = Mu "tenants.provision" @{
        sourceTenantId = $nguon; code = $ma; name = ("QA Trung tam kiem thu " + $script:Stamp)
        centerCode = $maCs; centerName = ("QA Co so kiem thu " + $script:Stamp); roomCount = 2
        adminEmail = $emailQt; adminFullName = "QA Quan tri kiem thu"
        reason = "Kiem thu tu dong: nhan ban mot cham de kiem chung cach ly du lieu"
      } $A
      T "B" "B31 nhan ban tao duoc trung tam moi voi ma ngau nhien" ($pr.ok -and $pr.data.tenantId) ("tao tenant ma " + $ma) ("loi=" + $pr.err)

      if (-not $pr.ok) {
        Skip "B" "B32..B40 kiem chung trung tam vua nhan ban" ("nhan ban that bai: " + (Say $pr.err 150))
      } else {
        $tid = $pr.data.tenantId
        Created ("Trung tam QA moi: ma=" + $ma + " tenantId=" + $tid + " · co so=" + $maCs + " · tai khoan quan tri=" + $emailQt + " (XOA TAY sau khi doi chieu)")
        $tao = $pr.data.created

        T "B" "B32 trung tam moi co khoa hoc duoc sao chep" ((Def $tao.courses 0) -gt 0) "courses > 0" ("courses=" + $tao.courses)
        T "B" "B33 trung tam moi co goi hoc phi duoc sao chep" ((Def $tao.coursePackages 0) -gt 0) "coursePackages > 0" ("coursePackages=" + $tao.coursePackages)
        T "B" "B34 trung tam moi co ma ca lam viec duoc sao chep" ((Def $tao.workShifts 0) -gt 0) "workShifts > 0" ("workShifts=" + $tao.workShifts)
        T "B" "B35 trung tam moi co nhom quyen duoc sao chep" ((Def $tao.userGroups 0) -gt 0) "userGroups > 0" ("userGroups=" + $tao.userGroups)

        $jsTao = Js $tao
        $coCaNhan = ($jsTao -match '"(leads|students|parents|staff|orders|payments|classes|sessions|enrollments)"')
        T "B" "B36 trung tam moi KHONG co lead / hoc vien / nhan su / giao dich" (-not $coCaNhan) "khong co nhom du lieu ca nhan trong bang ke da tao" ("da tao=" + (Short $jsTao 150))

        $gt = Q "tenants.get" @{ id = $tid } $A
        T "B" "B37 trung tam moi o trang thai Dang thiet lap, loai Nhuong quyen" ($gt.ok -and ($gt.data.status -eq "onboarding") -and ($gt.data.type -eq "FRANCHISE")) "status=onboarding, type=FRANCHISE" ("status=" + $gt.data.status + " type=" + $gt.data.type)
        T "B" "B38 tuy chon quyen rieng tu cua trung tam moi mac dinh dong het" (($gt.data.settings.hoSeesPii -eq $false) -and ($gt.data.settings.hoSeesFinanceDetail -eq $false) -and ($gt.data.settings.allowCrossCenterTransfer -eq $false)) "ca 3 cong tac = false" ("pii=" + $gt.data.settings.hoSeesPii + " tc=" + $gt.data.settings.hoSeesFinanceDetail + " ct=" + $gt.data.settings.allowCrossCenterTransfer)
        $pa = $gt.data.pendingAdmin
        T "B" "B39 tai khoan quan tri o trang thai cho kich hoat, khong co mat khau" (($null -ne $pa) -and ($pa.isActive -eq $false) -and ([string]$pa.lockedReason -match "(?i)k(i|í)ch ho(a|ạ)t")) "isActive=false, ly do 'Cho kich hoat'" ("pendingAdmin=" + (Say (Js $pa) 120))

        $au = Q "system.audit" @{ module = "tenant"; entityId = $tid } $A
        $auItems = @($au.data.items)
        $coLyDo = $false
        foreach ($x in $auItems) { if ([string]$x.reason) { $coLyDo = $true } }
        T "B" "B40 co ban ghi nhat ky cho lan nhan ban, kem ly do" (($auItems.Count -ge 1) -and $coLyDo) "it nhat 1 dong audit co ly do" ("so dong=" + $auItems.Count + " coLyDo=" + $coLyDo)

        $pr2 = Mu "tenants.provision" @{
          sourceTenantId = $nguon; code = $ma; name = "QA Trung tam trung ma"
          centerCode = ($maCs + "B"); centerName = "QA Co so trung ma"; roomCount = 0
          adminEmail = ("qa.trung." + $script:Stamp + "@example.test"); adminFullName = "QA Trung Ma"
          reason = "Kiem thu tu dong: nhan ban lai cung ma de kiem tra chan trung"
        } $A
        T "B" "B41 nhan ban lai cung ma trung tam -> bi chan" (LoiBiChan $pr2) "tu choi vi trung ma" ("ok=" + $pr2.ok + " loi=" + $pr2.err)
      }

      $pr3 = Mu "tenants.provision" @{
        sourceTenantId = $nguon; code = "1SAI"; name = "QA ma sai dinh dang"
        centerCode = "QASAI1"; centerName = "QA Co so ma sai"; roomCount = 0
        adminEmail = ("qa.masai." + $script:Stamp + "@example.test"); adminFullName = "QA Ma Sai"
        reason = "Kiem thu tu dong: ma trung tam sai dinh dang phai bi chan"
      } $A
      T "B" "B42 ma trung tam sai dinh dang -> bi chan" (LoiBiChan $pr3) "tu choi vi ma khong hop le" ("ok=" + $pr3.ok + " loi=" + $pr3.err)

      $pr4 = Mu "tenants.provision" @{
        sourceTenantId = $nguon; code = ("QZ" + $script:Stamp.Substring(8, 6)); name = "QA thieu ly do"
        centerCode = ("QZC" + $script:Stamp.Substring(8, 6)); centerName = "QA Co so thieu ly do"; roomCount = 0
        adminEmail = ("qa.lydo." + $script:Stamp + "@example.test"); adminFullName = "QA Thieu Ly Do"
        reason = "ngan"
      } $A
      T "B" "B43 nhan ban khong co ly do du dai -> bi chan" (LoiBiChan $pr4) "tu choi vi ly do < 10 ky tu" ("ok=" + $pr4.ok + " loi=" + $pr4.err)
    }
  }
}

# =========================================================================== #
#  BỘ C — TRẢI NGHIỆM MỘT CHẠM (inbox)                                        #
# =========================================================================== #
if ($Only -eq "tat-ca" -or $Only -eq "mot-cham") {
  Write-Host ""
  Write-Host "===== BO C — MOT CHAM (Viec hom nay) =====" -ForegroundColor Cyan

  # Mỗi nhóm việc cần MỘT quyền — bảng này lấy đúng từ `canAnywhere(...)` trong
  # packages/api/src/services/inbox.ts. Chuỗi rỗng = nhóm ai cũng có (hộp thông báo riêng).
  #
  # KHÔNG dựng bảng kỳ vọng tĩnh theo TÊN tài khoản: vai trò thật của từng tài khoản mẫu
  # được đọc sống bằng `auth.me`, còn ma trận vai trò → quyền đọc sống bằng `system.roles`
  # và quyền cấp thêm theo nhóm người dùng đọc bằng `admin.groups` / `admin.group`.
  # Nhờ vậy đổi ma trận quyền trong mã nguồn thì kịch bản tự theo, không báo sai.
  $nhomQuyen = [ordered]@{ }
  $nhomQuyen["lead_task"] = "lead:read"
  $nhomQuyen["lead_sla"] = "lead:read"
  $nhomQuyen["session_attendance"] = "attendance:read"
  $nhomQuyen["session_note"] = "session:read"
  $nhomQuyen["report_card"] = "report_card:read"
  $nhomQuyen["makeup"] = "makeup:update"
  $nhomQuyen["media"] = "media:update"
  $nhomQuyen["payment"] = "finance:confirm"
  $nhomQuyen["refund"] = "finance:approve"
  $nhomQuyen["staff_request"] = "timesheet:approve"
  $nhomQuyen["parent_request"] = "care:update"
  $nhomQuyen["care_task"] = "care:update"
  $nhomQuyen["completion"] = "completion:approve"
  # Nhóm mở bằng MỘT TRONG NHIỀU quyền: viết "a|b|c" (khớp bất kỳ quyền nào là đủ)
  # GV chỉ có quyền "của mình" (trials:attendance_own) vẫn thấy nhóm này, nhưng chỉ với HV lớp trải nghiệm mình đứng
  $nhomQuyen["trial_report"] = "trials:manage|trials:attendance|lead:update|trials:attendance_own"
  $nhomQuyen["notification"] = ""

  $tatCaNhom = @($nhomQuyen.Keys | ForEach-Object { [string]$_ })
  $kieuHopLe = @("mutate", "open")

  # --- Ma trận vai trò -> quyền, đọc sống từ chính hệ thống ------------------
  $mt = Q "system.roles" $null $A
  $quyenCuaVai = @{ }
  $nhanCuaVai = @{ }
  foreach ($row in (Rows $mt.data.roles)) {
    $quyenCuaVai[[string]$row.role] = @(Rows $row.permissions | ForEach-Object { [string]$_ })
    $nhanCuaVai[[string]$row.role] = [string]$row.label
  }
  $coMaTran = ($mt.ok -and ($quyenCuaVai.Count -gt 0))
  if (-not $coMaTran) { Note ("Khong doc duoc ma tran vai tro qua system.roles: " + (Say $mt.err 120) + " — bo C chi kiem tra hinh dang du lieu, khong doi chieu quyen.") }

  # --- Quyền cấp thêm theo nhóm người dùng (chỉ cộng thêm, không bớt) --------
  $quyenNhomNguoiDung = New-Object System.Collections.ArrayList
  foreach ($grp in (Rows (Q "admin.groups" $null $A).data)) {
    $gd = Q "admin.group" @{ id = $grp.id } $A
    if (-not $gd.ok) { continue }
    $emails = @(Rows $gd.data.members | ForEach-Object { ([string]$_.email).ToLower() })
    foreach ($pm in (Rows $gd.data.permissions)) {
      foreach ($em in $emails) {
        [void]$quyenNhomNguoiDung.Add(@{ email = $em; permission = [string]$pm.permission })
      }
    }
  }

  $inboxA = $null
  $chamNhat = 0
  $iC = 1
  foreach ($vai in $script:Roles) {
    $who = $vai.email
    $nhan = "C" + $iC.ToString("00") + " inbox.today — " + $vai.ten
    $iC++

    $me = Q "auth.me" $null $who
    if ((-not $me.ok) -or ($null -eq $me.data)) {
      Skip "C" ($nhan + ": khong co nhom ngoai quyen") ("khong dang nhap duoc bang tai khoan mau " + $vai.ten + ": " + (Say $me.err 100))
      continue
    }
    # Vai trò THẬT (đã lọc theo hiệu lực) + nhãn tiếng Việt, đều lấy từ hệ thống
    $vaiThat = @(Rows $me.data.assignments | ForEach-Object { [string]$_.role } | Select-Object -Unique)
    $nhanVai = (@($vaiThat | ForEach-Object { Def $nhanCuaVai[$_] $_ }) -join " + ")
    if (-not $nhanVai) { $nhanVai = $vai.ten }
    $moTa = $vai.ten + " (" + $nhanVai + ")"

    # Bộ quyền hiệu lực = quyền của các vai trò + quyền của các nhóm người dùng
    $quyen = New-Object System.Collections.ArrayList
    foreach ($rl in $vaiThat) { foreach ($p in @(Rows $quyenCuaVai[$rl])) { [void]$quyen.Add([string]$p) } }
    foreach ($gp in $quyenNhomNguoiDung) { if ($gp.email -eq $who.ToLower()) { [void]$quyen.Add([string]$gp.permission) } }

    $r = CallApi -Method "GET" -Path "inbox.today" -InputObj $null -Who $who
    Perf ("inbox.today — " + $moTa) $r.ms
    if ($r.ms -gt $chamNhat) { $chamNhat = $r.ms }
    if ($who -eq $A) { $inboxA = $r }

    if (-not $r.ok) {
      T "C" ($nhan + ": khong co nhom ngoai quyen") $false "tra ve danh sach nhom viec" ("vai tro=" + $nhanVai + " loi=" + $r.err)
      continue
    }
    $keys = @(Rows $r.data.groups | ForEach-Object { [string]$_.key })
    if (-not $coMaTran) {
      Skip "C" ($nhan + ": khong co nhom ngoai quyen") ("khong co ma tran vai tro de doi chieu; nhom tra ve: " + ($keys -join ", "))
      continue
    }

    # Mỗi nhóm TRẢ VỀ phải được một quyền của chính tài khoản đó giải thích
    $viPham = New-Object System.Collections.ArrayList
    foreach ($k in $keys) {
      if (-not $nhomQuyen.Contains($k)) { [void]$viPham.Add($k + " (khoa nhom la)"); continue }
      $can = [string]$nhomQuyen[$k]
      if ([string]::IsNullOrEmpty($can)) { continue }
      $co = KhopMotTrong $quyen $can
      if (-not $co) { [void]$viPham.Add($k + " (thieu quyen " + $can + ")") }
    }
    # Nhóm CÓ quyền mà không thấy trả về: chỉ ghi chú, KHÔNG tính là lỗi —
    # `inboxToday` lược bỏ mọi nhóm có total = 0, nên "vắng nhóm" thường chỉ là hết việc.
    $vangMat = New-Object System.Collections.ArrayList
    foreach ($k in $tatCaNhom) {
      if ($keys -contains $k) { continue }
      $can = [string]$nhomQuyen[$k]
      if ([string]::IsNullOrEmpty($can)) { continue }
      if (KhopMotTrong $quyen $can) { [void]$vangMat.Add($k) }
    }
    T "C" ($nhan + ": khong co nhom ngoai quyen") ($viPham.Count -eq 0) "moi nhom tra ve deu duoc mot quyen cua tai khoan giai thich" ("vai tro=" + $nhanVai + " | nhom ngoai quyen: " + ($viPham -join ", ") + " | nhom tra ve: " + ($keys -join ", "))
    if ($vangMat.Count -gt 0) {
      Note ($moTa + ": co quyen nhung khong thay nhom " + ($vangMat -join ", ") + " — nhom rong bi luoc bo, khong phai loi phan quyen.")
    }
  }

  # C08 — mọi khoá nhóm hợp lệ, actionKind hợp lệ, nhãn hành động không rỗng
  if ($null -eq $inboxA -or -not $inboxA.ok) {
    Skip "C" "C08 khoa nhom / kieu hanh dong hop le" "khong doc duoc inbox.today cua quan tri"
    Skip "C" "C09 moi dong co dung mot hanh dong chinh" "khong doc duoc inbox.today cua quan tri"
    Skip "C" "C10 co so lieu tong hop khop voi cac nhom" "khong doc duoc inbox.today cua quan tri"
  } else {
    $groups = Rows $inboxA.data.groups
    $saiKhoa = @($groups | Where-Object { $tatCaNhom -notcontains [string]$_.key }).Count
    $saiKieu = @($groups | Where-Object { $kieuHopLe -notcontains [string]$_.actionKind }).Count
    T "C" "C08 moi nhom co khoa va actionKind hop le" (($saiKhoa -eq 0) -and ($saiKieu -eq 0)) "khoa thuoc danh muc, actionKind la mutate/open" ("sai khoa=" + $saiKhoa + " sai kieu=" + $saiKieu)

    $saiNhan = 0
    $saiDong = 0
    foreach ($g in $groups) {
      if ([string]::IsNullOrWhiteSpace([string]$g.actionLabel)) { $saiNhan++ }
      foreach ($it in (Rows $g.items)) {
        if ([string]::IsNullOrWhiteSpace([string]$it.id) -or [string]::IsNullOrWhiteSpace([string]$it.title) -or [string]::IsNullOrWhiteSpace([string]$it.href)) { $saiDong++ }
      }
    }
    T "C" "C09 moi nhom co dung mot nut hanh dong chinh, moi dong du id/tieu de/lien ket" (($saiNhan -eq 0) -and ($saiDong -eq 0)) "khong co nhom thieu nhan, khong co dong thieu truong" ("nhom thieu nhan=" + $saiNhan + " dong thieu truong=" + $saiDong)

    $tong = 0
    foreach ($g in $groups) { $tong += [int]$g.total }
    T "C" "C10 so lieu tong hop khop tong cac nhom" ([int]$inboxA.data.totalTasks -eq $tong) ("totalTasks = " + $tong) ("totalTasks=" + $inboxA.data.totalTasks + " tong nhom=" + $tong)
  }

  # C11–C13 — chạy hành động thật trên nhóm AN TOÀN (có thể hoàn tác / không đụng tiền)
  $nhomAnToan = @("care_task", "lead_sla", "lead_task")
  $chon = $null
  if ($inboxA -and $inboxA.ok) {
    foreach ($k in $nhomAnToan) {
      $g = (Rows $inboxA.data.groups) | Where-Object { $_.key -eq $k -and (Rows $_.items).Count -ge 1 } | Select-Object -First 1
      if ($null -ne $g) { $chon = $g; break }
    }
  }
  if ($null -eq $chon) {
    Skip "C" "C11 inbox.act tren mot dong hop le -> done=1" "khong co nhom viec an toan (cham soc HV / lead) nao co du lieu"
    Skip "C" "C12 inbox.act tron dong hop le + dong ngoai pham vi" "khong co nhom viec an toan nao co du lieu"
    Skip "C" "C13 inbox.undo tra lai trang thai cu" "khong co nhom viec an toan nao co du lieu"
  } else {
    $dong1 = (Rows $chon.items)[0]
    $r = Mu "inbox.act" @{ group = $chon.key; ids = @($dong1.id); note = "Kiem thu tu dong — xu ly tu man hinh Viec hom nay" } $A
    Created ("Da chay inbox.act nhom '" + $chon.key + "' tren 1 dong (id=" + $dong1.id + ")")
    T "C" "C11 inbox.act tren mot dong hop le -> done=1" ($r.ok -and ([int]$r.data.done -eq 1)) "done=1" ("ok=" + $r.ok + " done=" + $r.data.done + " loi=" + $r.err)

    # Trộn 1 dòng hợp lệ + 1 dòng KHÔNG thuộc phạm vi (lấy của trung tâm khác nếu có, không thì id lạ)
    $idLa = [guid]::NewGuid().ToString()
    if ($csHue) {
      $leadLa = @((Q "admissions.leads.inbox" @{ scope = "all"; centerId = $csHue.id; allStatuses = $true; limit = 5 } $A).data.items) | Select-Object -First 1
      if ($leadLa -and ($chon.key -eq "lead_sla" -or $chon.key -eq "lead_task")) { $idLa = $leadLa.id }
    }
    $dong2 = (Rows $chon.items) | Select-Object -Skip 1 -First 1
    if ($null -eq $dong2) { $dong2 = $dong1 }
    $r2 = Mu "inbox.act" @{ group = $chon.key; ids = @($dong2.id, $idLa); note = "Kiem thu tu dong — tron dong hop le voi dong ngoai pham vi" } $A
    $hong = Rows $r2.data.failed
    $hongDung = @($hong | Where-Object { $_.id -eq $idLa }).Count
    T "C" "C12 tron dong hop le + dong ngoai pham vi: dong sai vao 'failed', dong dung van chay" ($r2.ok -and ([int]$r2.data.done -ge 1) -and ($hongDung -ge 1)) "done >= 1 va failed chua dong sai" ("done=" + $r2.data.done + " failed=" + $hong.Count + " dungDong=" + $hongDung)

    if ($chon.key -eq "care_task") {
      $u = Mu "inbox.undo" @{ group = "care_task"; ids = @($dong1.id, $dong2.id) } $A
      T "C" "C13 inbox.undo tra viec cham soc ve 'dang xu ly'" ($u.ok -and ([int]$u.data.done -ge 1)) "done >= 1" ("ok=" + $u.ok + " done=" + $u.data.done + " loi=" + $u.err)
    } else {
      Skip "C" "C13 inbox.undo tra lai trang thai cu" ("nhom '" + $chon.key + "' khong hoan tac duoc theo thiet ke — chi nhom cham soc hoc vien moi hoan tac")
    }
  }

  # C14 — undo trên nhóm KHÔNG được phép hoàn tác
  $r = Mu "inbox.undo" @{ group = "payment"; ids = @([guid]::NewGuid().ToString()) } $A
  $viet = $false
  if ($r.err) { $viet = ($r.err -match "ho(a|à)n t(a|á)c") }
  T "C" "C14 inbox.undo tren nhom khong duoc hoan tac -> bi chan" ((LoiBiChan $r) -and $viet) "tu choi kem thong bao tieng Viet" ("ok=" + $r.ok + " loi=" + $r.err)

  # C15 — nhóm không hợp lệ
  $r = Mu "inbox.act" @{ group = "nhom_khong_co_that"; ids = @([guid]::NewGuid().ToString()) } $A
  T "C" "C15 inbox.act voi nhom khong co that -> bi chan" (LoiBiChan $r) "tu choi (khong hop le)" ("ok=" + $r.ok + " loi=" + $r.err)

  # C16 — không chọn việc nào
  $r = Mu "inbox.act" @{ group = "care_task"; ids = [string[]]@() } $A
  T "C" "C16 inbox.act khong chon viec nao -> bi chan" (LoiBiChan $r) "tu choi (chua chon viec nao)" ("ok=" + $r.ok + " loi=" + $r.err)

  # C17 — chưa đăng nhập
  $r = MuAnon "inbox.act" @{ group = "care_task"; ids = @([guid]::NewGuid().ToString()) }
  T "C" "C17 chua dang nhap khong chay duoc inbox.act" (LoiBiChan $r) "tu choi" ("ok=" + $r.ok + " loi=" + $r.err)

  # C18 — hiệu năng
  T "C" "C18 inbox.today phan hoi duoi 3 giay cho moi vai tro" ($chamNhat -le 3000) "<= 3000 ms" ("cham nhat = " + $chamNhat + " ms")
  if ($chamNhat -gt 3000) { Note ("Canh bao hieu nang: inbox.today cham nhat " + $chamNhat + " ms (> 3 giay).") }
}

# =========================================================================== #
#  BỘ D — CHẠY LẠI BỘ KIỂM THỬ THEO VAI TRÒ                                   #
# =========================================================================== #
if ($Only -eq "tat-ca" -or $Only -eq "vai-tro") {
  Write-Host ""
  Write-Host "===== BO D — KIEM THU NGHIEP VU THEO VAI TRO =====" -ForegroundColor Cyan
  $vaiTro = Join-Path $PSScriptRoot "kich-ban-vai-tro.ps1"
  if (-not (Test-Path $vaiTro)) {
    Skip "D" "D01 chay lai kich-ban-vai-tro.ps1" ("khong tim thay tep " + $vaiTro)
  } else {
    $swD = [System.Diagnostics.Stopwatch]::StartNew()
    $raw = @()
    try {
      $raw = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $vaiTro 2>&1 | ForEach-Object { [string]$_ })
    } catch {
      $raw = @()
    }
    $swD.Stop()
    Perf "kich-ban-vai-tro.ps1 (toan bo)" ([int]$swD.ElapsedMilliseconds)
    if ($raw.Count -eq 0) {
      Skip "D" "D01 chay lai kich-ban-vai-tro.ps1" "khong nhan duoc ket qua nao tu kich ban vai tro"
    } else {
      $dPass = 0; $dFail = 0
      foreach ($l in $raw) {
        if ($l -match '^PASS\s+(.+)$') {
          $dPass++
          [void]$script:results.Add([pscustomobject]@{ bo = "D"; ten = (Short $Matches[1] 160); status = "PASS"; extra = "" })
        } elseif ($l -match '^FAIL\s+(.+)$') {
          $dFail++
          [void]$script:results.Add([pscustomobject]@{ bo = "D"; ten = (Short $Matches[1] 160); status = "FAIL"; extra = "xem chi tiet o dau ra cua kich-ban-vai-tro.ps1" })
        }
      }
      Write-Host ("  Kich ban vai tro: " + $dPass + " PASS / " + $dFail + " FAIL (" + [int]($swD.ElapsedMilliseconds / 1000) + " giay)") -ForegroundColor Gray
      if (($dPass + $dFail) -eq 0) {
        Skip "D" "D01 chay lai kich-ban-vai-tro.ps1" "chay xong nhung khong doc duoc dong PASS/FAIL nao"
      }
      $logD = Join-Path $script:Tmp "vai-tro.log"
      [System.IO.File]::WriteAllLines($logD, [string[]]$raw, (New-Object System.Text.UTF8Encoding($true)))
      Note ("Dau ra day du cua kich ban vai tro: " + $logD)
      Note "kich-ban-vai-tro.ps1 goi thang http://localhost:3000 nen KHONG theo tham so -BaseUrl."
    }
  }
}

# =========================================================================== #
#  TỔNG HỢP + BÁO CÁO                                                         #
# =========================================================================== #
$boTen = @{ A = "Bao mat"; B = "Cach ly trung tam (tenant)"; C = "Mot cham (Viec hom nay)"; D = "Nghiep vu theo vai tro" }
$boThuTu = @("A", "B", "C", "D")

$tongPass = @($script:results | Where-Object { $_.status -eq "PASS" }).Count
$tongFail = @($script:results | Where-Object { $_.status -eq "FAIL" }).Count
$tongSkip = @($script:results | Where-Object { $_.status -eq "SKIP" }).Count

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " TONG HOP" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ("{0,-32} {1,6} {2,6} {3,6} {4,6}" -f "Bo kiem thu", "PASS", "FAIL", "SKIP", "TONG")
Write-Host ("{0,-32} {1,6} {2,6} {3,6} {4,6}" -f "--------------------------------", "------", "------", "------", "------")
foreach ($b in $boThuTu) {
  $rows = @($script:results | Where-Object { $_.bo -eq $b })
  if ($rows.Count -eq 0) { continue }
  $p = @($rows | Where-Object { $_.status -eq "PASS" }).Count
  $f = @($rows | Where-Object { $_.status -eq "FAIL" }).Count
  $s = @($rows | Where-Object { $_.status -eq "SKIP" }).Count
  Write-Host ("{0,-32} {1,6} {2,6} {3,6} {4,6}" -f ($b + " — " + $boTen[$b]), $p, $f, $s, $rows.Count)
}
Write-Host ("{0,-32} {1,6} {2,6} {3,6} {4,6}" -f "--------------------------------", "------", "------", "------", "------")
Write-Host ("{0,-32} {1,6} {2,6} {3,6} {4,6}" -f "TAT CA", $tongPass, $tongFail, $tongSkip, $script:results.Count)
Write-Host ""
if ($tongFail -gt 0) {
  Write-Host "CAC KIEM TRA KHONG DAT:" -ForegroundColor Red
  foreach ($r in @($script:results | Where-Object { $_.status -eq "FAIL" })) {
    Write-Host ("  · [" + $r.bo + "] " + $r.ten) -ForegroundColor Red
  }
  Write-Host ""
}

# Gợi ý nguyên nhân cho từng mục không đạt
function GoiY([string]$ten) {
  $t = $ten.ToLower()
  if ($t -match "header x-dev-actor|mao danh") { return 'Route handler /api/trpc phai xoa header x-dev-actor do may khach gui (h.delete) truoc khi doc cookie. Kiem tra apps/web/src/app/api/trpc/[trpc]/route.ts.' }
  if ($t -match "chua dang nhap") { return "Procedure phai la protectedProcedure (packages/api/src/trpc.ts). Kiem tra router tuong ung." }
  if ($t -match "idor") { return "Service phai nap ban ghi roi doi chieu centerId / tenantId truoc khi tra ve (assertTenant + scope). Xem docs/KIEM-DINH-BAO-MAT.md muc 6." }
  if ($t -match "leo thang") { return "Thieu requirePermission hoac ma tran quyen trong packages/core/src/policy/policy.ts cho phep qua rong." }
  if ($t -match "image/png|\.svg|ten tep") { return "Kiem tra checkImageUpload / safeStoredFileName o packages/core/src/security/upload.ts va duong tai len tuong ung." }
  if ($t -match "tan suat") { return "Tran tan suat nam trong bo nho mot tien trinh (apps/web/src/lib/route-ctx.ts). Khoi dong lai may chu roi chay lai, hoac mo Redis/WAF theo khuyen nghi van hanh." }
  if ($t -match "x-content-type|x-frame|referrer|permissions-policy|content-security") { return "Bo header o apps/web/next.config.ts (async headers). Kiem tra proxy / CDN co cat header khong." }
  if ($t -match "cron") { return "Dat CRON_SECRET roi goi lai. Xem apps/web/src/app/api/cron/outbox/route.ts." }
  if ($t -match "nhat ky") { return "Mutation / ban xuat phai goi writeAudit (action PII_REVEAL) trong cung transaction. Xem packages/api/src/services/audit.ts." }
  if ($t -match "che pii|da duoc che|che sdt|che lai|email that|ho ten") { return "Service tra du lieu ra ngoai tenant phai boc redact(ctx, row) — xem packages/api/src/services/tenantScope.ts va packages/core/src/system/pii.ts." }
  if ($t -match "tenant|trung tam|nhan ban|tuy chon quyen rieng tu") { return "Xem packages/core/src/org/tenant.ts, packages/api/src/services/tenantScope.ts va provisionTenant.ts; kiem tra da chay packages/db/sql/0005_nhuong_quyen.sql chua." }
  if ($t -match "inbox|nhom ngoai quyen|viec hom nay|hoan tac") { return "Xem canAnywhere / INBOX_GROUP_KEYS trong packages/api/src/services/inbox.ts va ma tran quyen trong policy.ts." }
  if ($t -match "duoi 3 giay|hieu nang") { return "Kiem tra chi so CSDL cho cac bang lead / session / payment; inbox.today chay 14 truy van song song." }
  return "Xem thong bao loi that o cot 'thuc te' va nhat ky may chu."
}

# ---- Ghi báo cáo Markdown ------------------------------------------------
$sb = New-Object System.Text.StringBuilder
function W([string]$line) { [void]$sb.AppendLine($line) }

$ketThuc = Get-Date
$thoiLuong = [int]($ketThuc - $script:Started).TotalSeconds

W "# Báo cáo kiểm thử toàn diện — Sata Robo Platform"
W ""
W "## 1. Môi trường và thời điểm"
W ""
W "| Mục | Giá trị |"
W "|---|---|"
W ("| Địa chỉ hệ thống | ``" + $script:BaseUrl + "`` |")
W ("| Bộ đã chạy | ``" + $Only + "`` |")
W ("| Bắt đầu | " + $script:Started.ToString("dd/MM/yyyy HH:mm:ss") + " |")
W ("| Kết thúc | " + $ketThuc.ToString("dd/MM/yyyy HH:mm:ss") + " |")
W ("| Thời lượng | " + $thoiLuong + " giây |")
W ("| Máy chạy | " + $env:COMPUTERNAME + " |")
W ("| PowerShell | " + $PSVersionTable.PSVersion.ToString() + " |")
W ("| Kịch bản | ``scripts/kiem-thu/kich-ban-toan-dien.ps1`` |")
W ""
W '> Kịch bản đăng nhập bằng **tài khoản mẫu** (cookie `x-dev-actor`, cần `ALLOW_DEV_ACTOR=1`).'
W "> Không có mật khẩu nào trong kịch bản, không dùng dữ liệu cá nhân thật."
W ""
W "## 2. Bảng tổng hợp"
W ""
W "| Bộ | Nội dung | Đạt | Không đạt | Bỏ qua | Tổng |"
W "|---|---|---:|---:|---:|---:|"
$boViet = @{ A = "Bảo mật"; B = "Cách ly dữ liệu theo trung tâm (tenant)"; C = "Trải nghiệm một chạm (Việc hôm nay)"; D = "Nghiệp vụ theo 7 vai trò" }
foreach ($b in $boThuTu) {
  $rows = @($script:results | Where-Object { $_.bo -eq $b })
  if ($rows.Count -eq 0) { continue }
  $p = @($rows | Where-Object { $_.status -eq "PASS" }).Count
  $f = @($rows | Where-Object { $_.status -eq "FAIL" }).Count
  $s = @($rows | Where-Object { $_.status -eq "SKIP" }).Count
  W ("| " + $b + " | " + $boViet[$b] + " | " + $p + " | " + $f + " | " + $s + " | " + $rows.Count + " |")
}
W ("| **Tổng** | | **" + $tongPass + "** | **" + $tongFail + "** | **" + $tongSkip + "** | **" + $script:results.Count + "** |")
W ""

W "## 3. Các kiểm tra không đạt"
W ""
if ($tongFail -eq 0) {
  W "Không có kiểm tra nào không đạt."
} else {
  W "| Bộ | Kiểm tra | Kỳ vọng vs thực tế | Gợi ý nguyên nhân |"
  W "|---|---|---|---|"
  foreach ($r in @($script:results | Where-Object { $_.status -eq "FAIL" })) {
    $e = ($r.extra -replace '\|', '/')
    $ten = ($r.ten -replace '\|', '/')
    W ("| " + $r.bo + " | " + $ten + " | " + $e + " | " + (GoiY $r.ten) + " |")
  }
}
W ""

W "## 4. Các kiểm tra bị bỏ qua (môi trường thiếu dữ liệu)"
W ""
if ($tongSkip -eq 0) {
  W "Không có kiểm tra nào bị bỏ qua."
} else {
  W "| Bộ | Kiểm tra | Lý do bỏ qua |"
  W "|---|---|---|"
  foreach ($r in @($script:results | Where-Object { $_.status -eq "SKIP" })) {
    W ("| " + $r.bo + " | " + ($r.ten -replace '\|', '/') + " | " + ($r.extra -replace '\|', '/') + " |")
  }
}
W ""

W "## 5. Hiệu năng"
W ""
if ($script:perf.Count -eq 0) {
  W "Không đo được mốc hiệu năng nào trong lần chạy này."
} else {
  W "| Phép đo | Thời gian (ms) | Ghi chú |"
  W "|---|---:|---|"
  foreach ($p in $script:perf) {
    $gc = "đạt"
    if ($p.ms -gt 3000) { $gc = "**chậm — vượt ngưỡng 3 giây**" }
    elseif ($p.ms -gt 1500) { $gc = "cần theo dõi" }
    W ("| " + $p.ten + " | " + $p.ms + " | " + $gc + " |")
  }
  $maxMs = ($script:perf | Measure-Object -Property ms -Maximum).Maximum
  W ""
  W ("Chậm nhất: **" + $maxMs + " ms**. Ngưỡng cảnh báo của ``inbox.today`` là 3.000 ms.")
}
W ""

W "## 6. Bản ghi do kịch bản tạo ra — cần người vận hành xoá tay"
W ""
W "Kịch bản **không tự xoá** bất kỳ dữ liệu nào. Danh sách dưới đây là những gì lần chạy này ghi thêm vào cơ sở dữ liệu."
W ""
if ($script:created.Count -eq 0) {
  W "Lần chạy này không tạo thêm bản ghi nào."
} else {
  W "| # | Bản ghi |"
  W "|---:|---|"
  $i = 1
  foreach ($c in $script:created) {
    W ("| " + $i + " | " + ($c -replace '\|', '/') + " |")
    $i++
  }
  W ""
  W ("Mọi bản ghi do kịch bản tạo đều mang dấu **QA** hoặc dấu thời gian ``" + $script:Stamp + "`` để dễ tìm và xoá.")
}
W ""

W "## 7. Ghi chú của lần chạy"
W ""
if ($script:notes.Count -eq 0) {
  W "Không có ghi chú."
} else {
  foreach ($n in $script:notes) { W ("- " + $n) }
}
W ""

W "## 8. Toàn bộ kết quả"
W ""
W "| Bộ | Kiểm tra | Kết quả | Chi tiết |"
W "|---|---|---|---|"
foreach ($r in $script:results) {
  $bieu = "Đạt"
  if ($r.status -eq "FAIL") { $bieu = "**Không đạt**" }
  if ($r.status -eq "SKIP") { $bieu = "Bỏ qua" }
  W ("| " + $r.bo + " | " + ($r.ten -replace '\|', '/') + " | " + $bieu + " | " + ($r.extra -replace '\|', '/') + " |")
}
W ""
W "---"
W ""
W ("Sinh tự động bởi ``scripts/kiem-thu/kich-ban-toan-dien.ps1`` lúc " + $ketThuc.ToString("dd/MM/yyyy HH:mm:ss") + ".")

try {
  [System.IO.File]::WriteAllText($script:Out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
  Write-Host ("Da ghi bao cao: " + $script:Out) -ForegroundColor Cyan
} catch {
  Write-Host ("KHONG ghi duoc bao cao vao " + $script:Out + ": " + $_.Exception.Message) -ForegroundColor Red
}

if ($script:created.Count -gt 0) {
  Write-Host ""
  Write-Host "BAN GHI DO KICH BAN TAO (xoa tay khi khong con can):" -ForegroundColor Yellow
  foreach ($c in $script:created) { Write-Host ("  · " + $c) -ForegroundColor Yellow }
}

Write-Host ""
if ($tongFail -gt 0) {
  Write-Host ("KET LUAN: CO " + $tongFail + " KIEM TRA KHONG DAT.") -ForegroundColor Red
  exit 1
}
Write-Host "KET LUAN: TAT CA KIEM TRA DEU DAT." -ForegroundColor Green
exit 0
