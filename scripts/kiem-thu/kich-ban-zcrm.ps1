# -----------------------------------------------------------------------------
#  Kich ban kiem thu tich hop Zalo CRM (ZCRM v3.4) — dau-cuoi, dung ZCRM GIA
#  (scripts/kiem-thu/zcrm-gia.mjs). Yeu cau: may chu dev chay, ALLOW_DEV_ACTOR=1.
# -----------------------------------------------------------------------------
param([string]$BaseUrl = "http://localhost:3000")
$ErrorActionPreference = "Continue"
$R = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$A = "superadmin@example.test"
$rnd = [string](Get-Random -Minimum 100000 -Maximum 999999)
$tmp = Join-Path $env:TEMP ("zcrm-" + $rnd); New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$script:pass = 0; $script:fail = 0
function T($ten, $ok, $chiTiet) {
  if ($ok) { $script:pass++; Write-Host ("[PASS] " + $ten + " - " + $chiTiet) -ForegroundColor Green }
  else { $script:fail++; Write-Host ("[FAIL] " + $ten + " - " + $chiTiet) -ForegroundColor Red }
}
function Api($method, $path, $inp) {
  $out = Join-Path $tmp "r.json"
  $a = @("-s", "-o", $out, "-w", "%{http_code}", "-b", "x-dev-actor=$A")
  $url = "$BaseUrl/api/trpc/$path"
  if ($method -eq "GET") { if ($null -ne $inp) { $url += "?input=" + [uri]::EscapeDataString((@{ json = $inp } | ConvertTo-Json -Depth 8 -Compress)) } }
  else { $bf = Join-Path $tmp "b.json"; [IO.File]::WriteAllText($bf, (@{ json = $inp } | ConvertTo-Json -Depth 8 -Compress), (New-Object Text.UTF8Encoding($false))); $a += @("-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@$bf") }
  $code = (& curl.exe @a $url) -join ""
  $o = $null; try { $o = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch {}
  if ($o -and $o.error) { return @{ ok = $false; code = $code; err = [string]$o.error.json.message } }
  return @{ ok = ($code -eq "200"); code = $code; data = $o.result.data.json }
}
function Hook($slug, $secret, $obj, [switch]$SaiKy) {
  $raw = ($obj | ConvertTo-Json -Depth 8 -Compress)
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($raw)
  $bf = Join-Path $tmp "hook.json"; [IO.File]::WriteAllBytes($bf, $bytes)
  $h = New-Object Security.Cryptography.HMACSHA256 (,([Text.Encoding]::UTF8.GetBytes($secret)))
  $sig = -join ($h.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
  if ($SaiKy) { $sig = "00" + $sig.Substring(2) }
  $code = (& curl.exe -s -o NUL -w "%{http_code}" -X POST -H "Content-Type: application/json" -H ("X-Webhook-Signature: " + $sig) -H ("X-Webhook-Event: " + $obj.event) --data-binary "@$bf" "$BaseUrl/api/webhooks/kenh/$slug") -join ""
  return $code
}

Write-Host "=== ZCRM GIA ===" -ForegroundColor Cyan
$env:ZCRM_RND = $rnd
$gia = Start-Process node -ArgumentList @((Join-Path $R "scripts\kiem-thu\zcrm-gia.mjs")) -PassThru -WindowStyle Hidden
Start-Sleep 2
try {
  $secret = "bi-mat-kiem-thu-zcrm-" + $rnd + "-abcdefgh"
  $nick = "nick-thu-" + $rnd
  $sv = Api "POST" "messaging.saveChannelAccount" @{ channel = "zalo_ca_nhan"; label = ("Kiem thu ZCRM " + $rnd); baseUrl = "http://localhost:3099"; apiKey = "khoa-thu-zcrm"; webhookSecret = $secret; externalId = $nick; dailyCap = 50 }
  T "Z00 khai bao tai khoan kenh ZCRM" $sv.ok ("slug=" + $sv.data.slug + " " + $sv.err)
  if (-not $sv.ok) { throw "khong khai bao duoc" }
  $slug = [string]$sv.data.slug; $accId = [string]$sv.data.id
  $conv = "conv-" + $rnd; $uid = "77" + $rnd + "0001"
  $tin = @{ event = "message.received"; timestamp = (Get-Date).ToUniversalTime().ToString("o"); data = @{ messageId = ("m1-" + $rnd); conversationId = $conv; senderUid = $uid; content = ("Xin chao ZCRM " + $rnd); contentType = "text"; sentAt = (Get-Date).ToUniversalTime().ToString("o") } }

  T "Z01 chu ky sai -> 401" ((Hook $slug $secret $tin -SaiKy) -eq "401") "X-Webhook-Signature sai"
  T "Z02 tin khach ky dung (X-Webhook-Signature) -> 200" ((Hook $slug $secret $tin) -eq "200") "dinh dang that ZCRM v3.4"
  $ib = Api "GET" "messaging.inbox" @{ channel = "zalo_ca_nhan"; q = ("Khach ZCRM " + $rnd) }
  $hang = @($ib.data.items)
  T "Z03 hoi thoai co ten khach lay tu API ZCRM" ($hang.Count -eq 1) ("so hoi thoai=" + $hang.Count)
  $cid = if ($hang.Count) { [string]$hang[0].id } else { "" }

  $gui = Api "POST" "messaging.send" @{ id = $cid; body = ("Tra loi thu " + $rnd) }
  T "Z04 nhan vien tra loi tu LMS -> gui duoc" ($gui.ok -and $gui.data.status -eq "sent") ("status=" + $gui.data.status + " loi=" + $gui.data.error + $gui.err)
  $da = (curl.exe -s "http://localhost:3099/__sent" | ConvertFrom-Json).sent | Select-Object -Last 1
  T "Z05 ZCRM nhan dung than v3.4 (nick + ma luong + noi dung)" (($da.zaloAccountId -eq $nick) -and ($da.threadId -eq $uid) -and ($da.content -eq ("Tra loi thu " + $rnd)) -and ($da.threadType -eq "user")) ("than=" + ($da | ConvertTo-Json -Compress))

  $doi = @{ event = "message.sent"; data = @{ messageId = ("m2-" + $rnd); conversationId = $conv; senderUid = "uid-cua-nick"; content = ("Tra loi thu " + $rnd); contentType = "text"; sentAt = (Get-Date).ToUniversalTime().ToString("o") } }
  [void](Hook $slug $secret $doi)
  $ngoai = @{ event = "message.sent"; data = @{ messageId = ("m3-" + $rnd); conversationId = $conv; senderUid = "uid-cua-nick"; content = "Tin nhan vien go ben ZCRM"; contentType = "text"; sentAt = (Get-Date).ToUniversalTime().ToString("o") } }
  [void](Hook $slug $secret $ngoai)
  $ct = Api "GET" "messaging.conversation" @{ id = $cid }
  $ra = @($ct.data.messages | Where-Object { $_.direction -eq "out" })
  T "Z06 tin LMS gui doi ve (message.sent) KHONG ghi doi" (@($ra | Where-Object { $_.body -eq ("Tra loi thu " + $rnd) }).Count -eq 1) ("so ban = " + @($ra | Where-Object { $_.body -eq ("Tra loi thu " + $rnd) }).Count)
  T "Z07 tin nhan vien go ben ZCRM vao DUNG hoi thoai" (@($ra | Where-Object { $_.body -eq "Tin nhan vien go ben ZCRM" }).Count -eq 1) ("so tin ra = " + $ra.Count)

  $nhom = @{ event = "message.received"; data = @{ messageId = ("g1-" + $rnd); conversationId = ("nhom-" + $rnd); senderUid = "thanh-vien-1"; content = ("Tin nhom lop " + $rnd); contentType = "text"; sentAt = (Get-Date).ToUniversalTime().ToString("o") } }
  [void](Hook $slug $secret $nhom)
  $ibn = Api "GET" "messaging.inbox" @{ channel = "zalo_ca_nhan"; q = ("Tin nhom lop " + $rnd) }
  T "Z08 tin nhom Zalo KHONG dua vao he thong" (@($ibn.data.items).Count -eq 0) ("so hoi thoai = " + @($ibn.data.items).Count)

  $anh = @{ event = "message.received"; data = @{ messageId = ("m4-" + $rnd); conversationId = $conv; senderUid = $uid; content = "https://minio.example/zalo-image.jpg"; contentType = "image"; sentAt = (Get-Date).ToUniversalTime().ToString("o") } }
  [void](Hook $slug $secret $anh)
  $ct2 = Api "GET" "messaging.conversation" @{ id = $cid }
  $cuoi = @($ct2.data.messages | Where-Object { $_.direction -eq "in" }) | Select-Object -Last 1
  T "Z09 tin anh: hien nhan + tep dinh kem, khong hien duong dan tran" (($cuoi.body -eq "[Hình ảnh]") -and (@($cuoi.attachments).Count -eq 1)) ("body=" + $cuoi.body)

  $dh = Api "POST" "messaging.syncZcrmAppointments" @{ }
  T "Z10 lich hen cua khach CHUA co ho so: bo qua, khong tu tao lead" ($dh.ok -and $dh.data.boQua -ge 1) ("nhan=" + $dh.data.nhan + " boQua=" + $dh.data.boQua + " " + $dh.err)

  $ct3 = Api "GET" "messaging.conversation" @{ id = $cid }
  $keo = @($ct3.data.messages | Where-Object { $_.body -eq ("Tin keo ve " + $rnd) }).Count
  T "Z14 keo tin qua API (khi webhook khong toi duoc): tin moi vao dung hoi thoai, khong trung" (($dh.data.tin -ge 1) -and ($keo -eq 1)) ("keo=" + $dh.data.tin + " trong hoi thoai=" + $keo)
  $dh2 = Api "POST" "messaging.syncZcrmAppointments" @{ }
  $ct4 = Api "GET" "messaging.conversation" @{ id = $cid }
  T "Z15 keo lan hai khong nhan doi tin" (@($ct4.data.messages | Where-Object { $_.body -eq ("Tin keo ve " + $rnd) }).Count -eq 1) ("lan 2 keo=" + $dh2.data.tin)

  $emb = Api "GET" "messaging.zcrmEmbed" $null
  $z = @($emb.data.ds) | Where-Object { $_.id -eq $accId } | Select-Object -First 1
  T "Z12 man Zalo CRM phat hien ZCRM dang cam nhung (DENY) va noi ro ly do" (($null -ne $z) -and (-not $z.nhungDuoc) -and ((($z.lyDo) -join " ") -match "DENY")) ("nhungDuoc=" + $z.nhungDuoc)
  $trang = Join-Path $tmp "trang.html"
  $ma = (& curl.exe -s -o $trang -w "%{http_code}" -m 120 -b "x-dev-actor=$A" "$BaseUrl/crm/zalo?xem=zcrm&nick=$accId") -join ""
  $html = [IO.File]::ReadAllText($trang, [Text.Encoding]::UTF8)
  T "Z13 tab Giao dien ZCRM mo duoc, co huong dan + nut mo tab moi" (($ma -eq "200") -and ($html -match "localhost:3099")) ("HTTP " + $ma)

  $tat = Api "POST" "messaging.removeChannelAccount" @{ id = $accId }
  T "Z11 ngat tai khoan kenh sau kiem thu" $tat.ok $tat.err
} finally {
  if ($gia -and -not $gia.HasExited) { Stop-Process -Id $gia.Id -Force -ErrorAction SilentlyContinue }
}
Write-Host ("TONG: PASS " + $script:pass + " / FAIL " + $script:fail)
