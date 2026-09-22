# -----------------------------------------------------------------------------
#  Kiem tra menu quan tri — Sata Robo Platform
#  Voi 7 tai khoan mau (cookie x-dev-actor): mo MOI muc + chip nguoi do thay trong menu,
#  MOI muc bi an theo quyen, va MOI duong cu trong bang chuyen huong.
#  Cay menu doc tu scripts/kiem-thu/menu-manifest.json (sinh tu packages/core/src/nav/menu.ts).
#  Chay tren Windows PowerShell 5.1. Xem docs/KIEM-THU-TOAN-DIEN.md muc "Kiểm tra menu".
# -----------------------------------------------------------------------------
param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Out = "",
  [string]$Manifest = "",
  # Chi chay mot tai khoan (vd "teacher1@satarobo.vn"); de trong = ca 7
  [string]$Only = ""
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$script:BaseUrl = $BaseUrl.TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($Out)) { $Out = Join-Path $PSScriptRoot "bao-cao-kiem-tra-menu.md" }
if (-not [System.IO.Path]::IsPathRooted($Out)) { $Out = Join-Path (Get-Location).Path $Out }
if ([string]::IsNullOrWhiteSpace($Manifest)) { $Manifest = Join-Path $PSScriptRoot "menu-manifest.json" }
$script:Started = Get-Date
$script:Tmp = Join-Path $env:TEMP ("ktmenu-" + $script:Started.ToString("yyyyMMddHHmmss") + "-" + (Get-Random -Minimum 1000 -Maximum 9999))
New-Item -ItemType Directory -Path $script:Tmp -Force | Out-Null

$script:dead = 0
$script:results = New-Object System.Collections.ArrayList
$script:summary = New-Object System.Collections.ArrayList

# Bảy tài khoản mẫu (giống kich-ban-vai-tro.ps1 / kich-ban-toan-dien.ps1) — KHÔNG mật khẩu, cần ALLOW_DEV_ACTOR=1
$Accounts = @(
  @{ email = "superadmin@example.test"; ten = "superadmin" },
  @{ email = "manager.cs1@example.test"; ten = "manager.cs1" },
  @{ email = "ketoan.cs1@example.test"; ten = "ketoan.cs1" },
  @{ email = "hr.cs1@example.test"; ten = "hr.cs1" },
  @{ email = "sale1.cs1@example.test"; ten = "sale1.cs1" },
  @{ email = "giaovu.cs1@example.test"; ten = "giaovu.cs1" },
  @{ email = "teacher1@satarobo.vn"; ten = "teacher1" }
)
if ($Only) { $Accounts = @($Accounts | Where-Object { $_.email -eq $Only -or $_.ten -eq $Only }) }

# Mục CHỈ ẩn khỏi menu (hiển thị), trang vẫn kiểm quyền rộng hơn một cách có chủ ý — không coi là lộ dữ liệu.
# Xem docs/KIEN-TRUC-MENU.md mục 11.
$MenuOnlyHidden = @("/bao-cao/sau-go-live", "/bao-cao/chat-pilot")

# UUID giả để thử chuyển hướng giữ truy vấn
$FakeId = "00000000-0000-0000-0000-000000000000"
$RedirectQuery = @{ "/hoc-ba" = "student"; "/report-cards" = "class" }

# --------------------------------------------------------------------------- #
#  Tiện ích                                                                   #
# --------------------------------------------------------------------------- #
function T([string]$who, [string]$ten, $ok, [string]$chiTiet) {
  $status = "FAIL"
  # So sánh kiểu chuỗi TRƯỚC: `$true -eq "SKIP"` trong PowerShell là $true (chuỗi bị đổi sang bool)
  if (($ok -is [string]) -and ($ok -eq "SKIP")) { $status = "SKIP" } elseif ($ok) { $status = "PASS" }
  [void]$script:results.Add([pscustomobject]@{ who = $who; ten = $ten; status = $status; extra = $chiTiet })
  $line = "[$status] $who · $ten"
  if ($chiTiet) { $line = "$line — $chiTiet" }
  if ($status -eq "PASS") { Write-Host $line -ForegroundColor Green }
  elseif ($status -eq "SKIP") { Write-Host $line -ForegroundColor Yellow }
  else { Write-Host $line -ForegroundColor Red }
}

# GET một trang, KHÔNG tự đi theo chuyển hướng. Trả về code, loc (Location tuyệt đối), html, ms.
function Fetch([string]$path, [string]$who) {
  $f = Join-Path $script:Tmp ("p" + (Get-Random -Minimum 100000 -Maximum 999999) + ".html")
  $cargs = @("-s", "-o", $f, "-w", "%{http_code}|%{redirect_url}", "--max-time", "180")
  if ($who) { $cargs += @("-b", "x-dev-actor=$who") }
  $cargs += ($script:BaseUrl + $path)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $raw = (& curl.exe @cargs) -join ""
  $sw.Stop()
  $parts = $raw.Split("|", 2)
  $code = $parts[0]
  $loc = ""
  if ($parts.Length -gt 1) { $loc = $parts[1] }
  # Máy chủ web chết giữa chừng: curl trả 000 liên tục -> dừng ngay, khỏi chạy hàng trăm yêu cầu vô ích
  if ($code -eq "000") { $script:dead++ } else { $script:dead = 0 }
  if ($script:dead -ge 5) {
    Write-Host ""
    Write-Host ("MAY CHU WEB KHONG TRA LOI (5 yeu cau lien tiep that bai, lan cuoi: " + $path + "). Xem logs\web.log. Dung kiem tra.") -ForegroundColor Red
    Write-Host "KET LUAN: KHONG DAT — may chu web ngung giua chung"
    exit 3
  }
  $html = ""
  if (Test-Path $f) { $html = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8); Remove-Item $f -Force -ErrorAction SilentlyContinue }
  return @{ code = $code; loc = $loc; html = $html; ms = [int]$sw.ElapsedMilliseconds }
}

# Dấu hiệu trang lỗi: lỗi gốc của Next, lỗi phía máy chủ khi stream (data-dgst không phải redirect / 404), error.tsx chung
function HasError([string]$html) {
  if ($html -match "__next_error__") { return $true }
  if ($html -match "Application error") { return $true }
  if ($html -match 'data-dgst="(?!NEXT_REDIRECT|NEXT_HTTP_ERROR|NEXT_NOT_FOUND)') { return $true }
  if ($html -match "Có lỗi khi tải trang") { return $true }
  return $false
}

# Dấu hiệu "không có quyền": NoAccess, error.tsx nhánh quyền, trang "đang xây dựng", hoặc lỗi FORBIDDEN từ service
function IsDenied([string]$html) {
  if ($html -match "chưa có quyền xem mục này") { return $true }
  if ($html -match "Không có quyền truy cập") { return $true }
  if ($html -match "Bạn không có quyền xem") { return $true }
  if (($html -match 'data-dgst="') -and ($html -match "FORBIDDEN|không có quyền|Không có quyền|chưa có quyền")) { return $true }
  return $false
}

function Decode([string]$s) { return $s.Replace("&amp;", "&") }

function Short([string]$text, [int]$max = 160) {
  if ([string]::IsNullOrEmpty($text)) { return "" }
  $t = ($text -replace '\s+', ' ').Trim()
  if ($t.Length -le $max) { return $t }
  return $t.Substring(0, $max - 1) + "…"
}

# --------------------------------------------------------------------------- #
#  Nạp cây menu                                                               #
# --------------------------------------------------------------------------- #
if (-not (Test-Path $Manifest)) { Write-Host "Khong thay $Manifest" -ForegroundColor Red; exit 2 }
$m = [System.IO.File]::ReadAllText($Manifest, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$AllHrefs = New-Object System.Collections.ArrayList
$Label = @{}
foreach ($g in @($m.groups)) {
  foreach ($i in @($g.items)) {
    if (-not $AllHrefs.Contains([string]$i.href)) { [void]$AllHrefs.Add([string]$i.href); $Label[[string]$i.href] = ($g.label + " › " + $i.label) }
    foreach ($t in @($i.tabs)) {
      if ($null -eq $t) { continue }
      if (-not $AllHrefs.Contains([string]$t.href)) { [void]$AllHrefs.Add([string]$t.href); $Label[[string]$t.href] = ($g.label + " › " + $i.label + " › " + $t.label) }
    }
  }
}
Write-Host ("Cay menu: " + @($m.groups).Count + " nhom, " + $AllHrefs.Count + " duong dan (muc + chip), " + @($m.redirects).Count + " duong cu chuyen huong")

# --------------------------------------------------------------------------- #
#  Chạy cho từng tài khoản                                                    #
# --------------------------------------------------------------------------- #
foreach ($acc in $Accounts) {
  $who = $acc.email
  $ten = $acc.ten
  Write-Host ""
  Write-Host ("===== " + $ten + " =====") -ForegroundColor Cyan
  $pass0 = @($script:results | Where-Object { $_.status -eq "PASS" }).Count
  $fail0 = @($script:results | Where-Object { $_.status -eq "FAIL" }).Count

  # 1) Menu người này thấy = các data-nav-href trong sidebar (layout đã lọc quyền; nhóm thu gọn vẫn có trong HTML)
  $trangChu = Fetch "/viec-hom-nay" $who
  T $ten "mo /viec-hom-nay" (($trangChu.code -eq "200") -and -not (HasError $trangChu.html)) ("HTTP " + $trangChu.code + " " + $trangChu.loc)
  $items = New-Object System.Collections.ArrayList
  foreach ($mm in [regex]::Matches($trangChu.html, 'data-nav-href="([^"]+)"')) {
    $h = Decode $mm.Groups[1].Value
    if (-not $items.Contains($h)) { [void]$items.Add($h) }
  }
  T $ten "sidebar co muc menu" ($items.Count -gt 0) ("so muc = " + $items.Count)
  foreach ($h in $items) {
    if (-not $AllHrefs.Contains($h)) { T $ten ("muc la trong sidebar " + $h) $false "khong co trong menu-manifest.json (chay lai test core voi CAP_NHAT_MENU=1?)" }
  }

  # 2) Mở từng mục; thu chip (data-nav-tab) của trang trung tâm
  $seen = New-Object System.Collections.ArrayList
  $queue = New-Object System.Collections.ArrayList
  foreach ($h in $items) { [void]$queue.Add($h) }
  $tabCount = 0
  $idx = 0
  while ($idx -lt $queue.Count) {
    $h = [string]$queue[$idx]; $idx++
    if ($seen.Contains($h)) { continue }
    [void]$seen.Add($h)
    $r = Fetch $h $who
    $ok = ($r.code -eq "200") -and -not (HasError $r.html) -and -not (IsDenied $r.html)
    $why = "HTTP " + $r.code + " · " + $r.ms + " ms"
    if ($r.loc) { $why += " → " + $r.loc }
    if (HasError $r.html) { $why += " · CO DAU HIEU LOI" }
    if (IsDenied $r.html) { $why += " · menu hien nhung trang bao KHONG CO QUYEN" }
    T $ten ("thay: " + $h) $ok $why
    foreach ($mm in [regex]::Matches($r.html, 'data-nav-tab="([^"]+)"')) {
      $t = Decode $mm.Groups[1].Value
      if (-not $seen.Contains($t) -and -not $queue.Contains($t)) { [void]$queue.Add($t); $tabCount++ }
      if (-not $AllHrefs.Contains($t)) { T $ten ("chip la " + $t) $false "khong co trong menu-manifest.json" }
    }
  }

  # 3) Mục bị ẩn theo quyền: phải từ chối, không lộ dữ liệu
  $hidden = @($AllHrefs | Where-Object { -not $seen.Contains($_) })
  foreach ($h in $hidden) {
    $r = Fetch $h $who
    $toLogin = ($r.code -match "^30[1278]$") -and ($r.loc -match "/login")
    $denied = (@("401", "403", "404") -contains $r.code) -or $toLogin -or (IsDenied $r.html)
    $why = "HTTP " + $r.code
    if ($r.loc) { $why += " → " + $r.loc }
    if ($denied) { T $ten ("an: " + $h) $true ($why + " (tu choi)") }
    elseif ($MenuOnlyHidden -contains $h) { T $ten ("an: " + $h) "SKIP" ($why + " — chi an khoi menu (co chu dich), trang van kiem quyen rieng") }
    else { T $ten ("an: " + $h) $false ($why + " — trang AN khoi menu nhung van mo duoc, co the lo du lieu: " + $Label[$h]) }
  }

  # 4) Đường cũ: 308 đúng đích, giữ truy vấn; đích mở được (hoặc từ chối đúng nếu không có quyền)
  foreach ($rd in @($m.redirects)) {
    $from = [string]$rd.from; $to = [string]$rd.to
    $r = Fetch $from $who
    $okLoc = ($r.loc -like ("*" + $to))
    T $ten ("chuyen huong " + $from) (($r.code -match "^30[78]$") -and $okLoc) ("HTTP " + $r.code + " → " + $r.loc + " (ky vong ..." + $to + ")")
    $key = $RedirectQuery[$from]
    if ($key) {
      $r2 = Fetch ($from + "?" + $key + "=" + $FakeId) $who
      $okQ = ($r2.code -match "^30[78]$") -and ($r2.loc -match [regex]::Escape($to.Split("?")[0])) -and ($r2.loc -match ("xem=")) -and ($r2.loc -match ($key + "=" + $FakeId))
      T $ten ("chuyen huong giu truy van " + $from + "?" + $key + "=…") $okQ ("HTTP " + $r2.code + " → " + $r2.loc)
    }
    $path = $to
    $r3 = Fetch $path $who
    $ok3 = (($r3.code -eq "200") -and -not (HasError $r3.html)) -or (IsDenied $r3.html) -or ($r3.code -eq "403")
    T $ten ("dich chuyen huong mo duoc " + $path) $ok3 ("HTTP " + $r3.code)
  }

  # 5) Trang rời sidebar nhưng vẫn phải dùng được (menu tài khoản)
  foreach ($x in @($m.extraPages)) {
    $r = Fetch ([string]$x) $who
    T $ten ("trang ngoai sidebar " + $x) (($r.code -eq "200") -and -not (HasError $r.html)) ("HTTP " + $r.code)
  }

  $pass1 = @($script:results | Where-Object { $_.status -eq "PASS" }).Count
  $fail1 = @($script:results | Where-Object { $_.status -eq "FAIL" }).Count
  [void]$script:summary.Add([pscustomobject]@{ ten = $ten; email = $who; items = $items.Count; tabs = $tabCount; visible = $seen.Count; hidden = $hidden.Count; pass = ($pass1 - $pass0); fail = ($fail1 - $fail0) })
}

# --------------------------------------------------------------------------- #
#  Báo cáo Markdown                                                           #
# --------------------------------------------------------------------------- #
$pass = @($script:results | Where-Object { $_.status -eq "PASS" }).Count
$fail = @($script:results | Where-Object { $_.status -eq "FAIL" }).Count
$skip = @($script:results | Where-Object { $_.status -eq "SKIP" }).Count
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Báo cáo kiểm tra menu quản trị")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- Máy chủ: ``" + $script:BaseUrl + "`` · bắt đầu " + $script:Started.ToString("yyyy-MM-dd HH:mm:ss") + " · " + [int]((Get-Date) - $script:Started).TotalSeconds + " giây")
[void]$sb.AppendLine("- Cây menu: " + @($m.groups).Count + " nhóm, " + $AllHrefs.Count + " đường dẫn (mục + chip), " + @($m.redirects).Count + " đường cũ chuyển hướng")
[void]$sb.AppendLine("- Kết quả: **PASS " + $pass + " · FAIL " + $fail + " · SKIP " + $skip + "**")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Theo tài khoản")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Tài khoản | Mục menu thấy | Chip thêm | Trang thấy (mục + chip) | Trang ẩn đã thử | PASS | FAIL |")
[void]$sb.AppendLine("|---|---:|---:|---:|---:|---:|---:|")
foreach ($s in $script:summary) { [void]$sb.AppendLine("| " + $s.ten + " | " + $s.items + " | " + $s.tabs + " | " + $s.visible + " | " + $s.hidden + " | " + $s.pass + " | " + $s.fail + " |") }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Lỗi (FAIL)")
[void]$sb.AppendLine("")
$fails = @($script:results | Where-Object { $_.status -eq "FAIL" })
if ($fails.Count -eq 0) { [void]$sb.AppendLine("Không có.") } else {
  [void]$sb.AppendLine("| Tài khoản | Kiểm tra | Chi tiết |")
  [void]$sb.AppendLine("|---|---|---|")
  foreach ($f in $fails) { [void]$sb.AppendLine("| " + $f.who + " | " + $f.ten.Replace("|", "\|") + " | " + (Short $f.extra 220).Replace("|", "\|") + " |") }
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Bỏ qua (SKIP)")
[void]$sb.AppendLine("")
$skips = @($script:results | Where-Object { $_.status -eq "SKIP" })
if ($skips.Count -eq 0) { [void]$sb.AppendLine("Không có.") } else { foreach ($f in $skips) { [void]$sb.AppendLine("- " + $f.who + " · " + $f.ten + " — " + (Short $f.extra 200)) } }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Toàn bộ kết quả")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Tài khoản | Trạng thái | Kiểm tra | Chi tiết |")
[void]$sb.AppendLine("|---|---|---|---|")
foreach ($x in $script:results) { [void]$sb.AppendLine("| " + $x.who + " | " + $x.status + " | " + $x.ten.Replace("|", "\|") + " | " + (Short $x.extra 160).Replace("|", "\|") + " |") }
[System.IO.File]::WriteAllText($Out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
Remove-Item $script:Tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "================ KET QUA ================"
Write-Host "PASS: $pass"
Write-Host "FAIL: $fail"
Write-Host "SKIP: $skip"
Write-Host "Bao cao: $Out"
if ($fail -gt 0) { exit 1 }
exit 0
