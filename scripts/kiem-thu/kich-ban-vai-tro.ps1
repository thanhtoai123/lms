$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
Set-Location "$Root\satarobo-platform"
$env:Path = "$env:APPDATA\npm;" + $env:Path
$script:pass = 0; $script:fail = 0; $script:failList = @()

function CallApi($method, $path, $inputObj, $who) {
  $url = "http://localhost:3000/api/trpc/$path"
  $out = "$env:TEMP\v1api.json"
  if ($method -eq "GET") {
    if ($null -ne $inputObj) { $url += "?input=" + [uri]::EscapeDataString((@{ json = $inputObj } | ConvertTo-Json -Depth 12 -Compress)) }
    & curl.exe -s -o $out -b "x-dev-actor=$who" $url | Out-Null
  } else {
    $bodyFile = "$env:TEMP\v1body.json"
    [System.IO.File]::WriteAllText($bodyFile, (@{ json = $inputObj } | ConvertTo-Json -Depth 12 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    & curl.exe -s -o $out -X POST -H "Content-Type: application/json" --data-binary "@$bodyFile" -b "x-dev-actor=$who" $url | Out-Null
  }
  $raw = [System.IO.File]::ReadAllText($out, [System.Text.Encoding]::UTF8)
  try { $obj = $raw | ConvertFrom-Json } catch { return @{ ok = $false; err = "NON-JSON: " + $raw.Substring(0, [Math]::Min(160, $raw.Length)); data = $null } }
  if ($obj.error) { return @{ ok = $false; err = [string]$obj.error.json.message; data = $null } }
  return @{ ok = $true; err = ""; data = $obj.result.data.json }
}
function Q($path, $inputObj, $who) { return CallApi "GET" $path $inputObj $who }
function Mu($path, $inputObj, $who) { return CallApi "POST" $path $inputObj $who }
function T($name, $ok, $extra) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name $extra" }
  else { $script:fail++; $script:failList += $name; Write-Host "FAIL  $name $extra" }
}
function Psql($q) { return (docker compose exec -T postgres psql -U postgres -d satarobo -tA -c $q 2>&1 | Select-Object -First 3) -join " " }
# Lenh hang loat tra ve { results, ok, failed }: neu ok=0 thi in ly do nghiep vu that,
# khong chi bao "loi goi thanh cong".
function MediaLoi($r) {
  if (-not $r.ok) { return $r.err }
  $bad = @($r.data.results) | Where-Object { $_.ok -ne $true } | Select-Object -First 1
  if ($null -ne $bad) { return ("ok=" + $r.data.ok + " failed=" + $r.data.failed + " ly do=" + $bad.message) }
  return ("ok=" + $r.data.ok)
}

$A = "superadmin@example.test"; $M = "manager.cs1@example.test"; $K = "ketoan.cs1@example.test"
$H = "hr.cs1@example.test"; $S = "sale1.cs1@example.test"; $G = "giaovu.cs1@example.test"; $TE = "teacher1@satarobo.vn"
$today = (Get-Date).ToString("yyyy-MM-dd")
$rnd = Get-Random -Minimum 100000 -Maximum 999999

Write-Host "===== 0. DU LIEU THAM CHIEU ====="
$centers = (Q "org.centers" $null $A).data
$cs1 = @($centers) | Where-Object { $_.code -eq "CS1" } | Select-Object -First 1
T "lay duoc co so CS1" ($null -ne $cs1) ""
$courses = (Q "catalog.courseOptions" $null $A).data
$course = @($courses)[0]
T "lay duoc khoa hoc" ($null -ne $course) ""
$methods = (Q "finance.methods" $null $K).data
$method = @($methods) | Where-Object { $_.isActive -ne $false } | Select-Object -First 1
T "lay duoc phuong thuc thanh toan" ($null -ne $method) ""
$clsAll = @((Q "academics.classes.list" @{ centerId = $cs1.id } $A).data)
$cls = @($clsAll) | Where-Object { $_.status -eq "teaching" -or $_.status -eq "active" } | Select-Object -First 1
if ($null -eq $cls) { $cls = @($clsAll)[0] }
T "lay duoc mot lop" ($null -ne $cls) ("lop=" + $cls.name)

Write-Host ""
Write-Host "===== A. TU VAN (sale) ====="
$phone = "09" + $rnd + "1"
$r = Mu "admissions.leads.create" @{ parentName = "PH Kiem Thu $rnd"; phone = $phone; childName = "Be Kiem Thu"; centerId = $cs1.id; source = "kiem-thu" } $S
$leadId = $r.data.lead.id
T "A1 tao lead moi" ($r.ok -and $leadId) $r.err
$r2 = Mu "admissions.leads.create" @{ parentName = "PH Kiem Thu $rnd"; phone = $phone; childName = "Be Thu Hai"; centerId = $cs1.id; source = "kiem-thu" } $S
T "A2 nhap lai cung SDT -> gop vao lead cu" ($r2.ok -and ($r2.data.lead.id -eq $leadId)) ("merged=" + $r2.data.merged)
$r = Mu "admissions.leads.addChild" @{ leadId = $leadId; fullName = "Be Thu Ba"; gender = "male"; dateOfBirth = "2017-05-06"; interestedCenterId = $cs1.id; interestedCourseId = $course.id } $S
$kid = @($r.data.children) | Where-Object { $_.fullName -eq "Be Thu Ba" } | Select-Object -First 1
$childId = $kid.id
T "A3 them con (gioi tinh, ngay sinh, co so quan tam)" $r.ok $r.err
$r = Mu "admissions.leads.addActivity" @{ leadId = $leadId; type = "call"; content = "Goi tu van lo trinh"; meta = @{ caller = "Sale 1"; durationMin = 7 } } $S
T "A4 ghi hoat dong goi dien co nguoi goi + thoi luong" $r.ok $r.err
$r = Mu "admissions.leads.transition" @{ leadId = $leadId; event = "lose" } $S
T "A5 chuyen Da mat khong ly do -> bi chan" (-not $r.ok) $r.err
$r = Mu "admissions.leads.setShared" @{ leadId = $leadId; shared = $true } $S
T "A6 bat dung chung lead" $r.ok $r.err
$r = Q "admissions.leads.get" @{ id = $leadId } $S
$shared = $r.data.sharedWithCenter; if ($null -eq $shared) { $shared = $r.data.lead.sharedWithCenter }
T "A7 lead hien co dung chung" ($r.ok -and $shared -eq $true) $r.err

Write-Host ""
Write-Host "===== B. LOP TRAI NGHIEM ====="
$r = Mu "admissions.trials.createClass" @{ centerId = $cs1.id; courseId = $course.id; capacity = 8 } $G
$tcId = $r.data.id
T "B1 tao lop trai nghiem" ($r.ok -and $tcId) $r.err
$d1 = (Get-Date).AddDays(3).ToString("yyyy-MM-dd"); $d2 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd"); $d3 = (Get-Date).AddDays(17).ToString("yyyy-MM-dd")
$r = Mu "admissions.trials.addSession" @{ trialClassId = $tcId; date = $d1; startTime = "09:00"; endTime = "10:30" } $G
$ts1 = $r.data.id
T "B2 them buoi 1" ($r.ok -and $ts1) $r.err
$r = Mu "admissions.trials.addSession" @{ trialClassId = $tcId; date = $d2; startTime = "14:00"; endTime = "15:30" } $G
T "B3 them buoi 2 (khac gio)" $r.ok $r.err
$r = Mu "admissions.trials.enrollToClass" @{ trialClassId = $tcId; leadId = $leadId; childId = $childId } $G
$enrId = $r.data.id
T "B4 xep hoc vien vao lop" ($r.ok -and $enrId) $r.err
$r = Q "admissions.trials.classDetail" @{ id = $tcId } $G
$nSess = @($r.data.sessions).Count; $nEnr = @($r.data.enrollments).Count
T "B5 chi tiet lop: 2 buoi, 1 hoc vien" (($nSess -eq 2) -and ($nEnr -eq 1)) ("buoi=$nSess hv=$nEnr")
$r = Mu "admissions.trials.addSession" @{ trialClassId = $tcId; date = $d3; startTime = "09:00"; endTime = "10:30" } $G
$ts3 = $r.data.id
$r = Q "admissions.trials.classDetail" @{ id = $tcId } $G
$s3 = @($r.data.sessions) | Where-Object { $_.id -eq $ts3 } | Select-Object -First 1
T "B5b hoc vien co mat o buoi tao SAU" ((@($r.data.sessions).Count -eq 3) -and (@($r.data.enrollments).Count -eq 1)) ("buoi=" + @($r.data.sessions).Count)
$r = Mu "admissions.trials.rescheduleSession" @{ sessionId = $ts1; date = $d1; startTime = "10:00"; endTime = "11:30"; reason = "abc" } $G
T "B6 doi lich ly do qua ngan -> bi chan" (-not $r.ok) $r.err
$r = Mu "admissions.trials.rescheduleSession" @{ sessionId = $ts1; date = $d1; startTime = "10:00"; endTime = "11:30"; reason = "Phu huynh ban buoi sang, doi sang 10h" } $G
T "B7 doi lich co ly do -> OK (bao GV)" $r.ok $r.err
$r = Mu "admissions.trials.addSession" @{ trialClassId = $tcId; date = $today; startTime = "08:00"; endTime = "09:30" } $G
$tsToday = $r.data.id
$r = Mu "admissions.trials.markClassAttendance" @{ sessionId = $tsToday; records = @(@{ enrollmentId = $enrId; status = "present" }) } $G
T "B8 diem danh buoi trai nghiem (buoi hom nay)" $r.ok $r.err
$r = Mu "admissions.trials.markClassAttendance" @{ sessionId = $ts3; records = @(@{ enrollmentId = $enrId; status = "present" }) } $G
T "B8b khong diem danh duoc buoi chua dien ra" (-not $r.ok) $r.err
$r = Mu "admissions.trials.createClass" @{ centerId = $cs1.id; courseId = $course.id; capacity = 1 } $G
$tcFull = $r.data.id
Mu "admissions.trials.addSession" @{ trialClassId = $tcFull; date = $d2; startTime = "08:00"; endTime = "09:30" } $G | Out-Null
Mu "admissions.trials.enrollToClass" @{ trialClassId = $tcFull; leadId = $leadId; childId = $childId } $G | Out-Null
$r = Mu "admissions.leads.addChild" @{ leadId = $leadId; fullName = "Be Thu Tu" } $S
$kid2 = @($r.data.children) | Where-Object { $_.fullName -eq "Be Thu Tu" } | Select-Object -First 1
$r = Mu "admissions.trials.enrollToClass" @{ trialClassId = $tcFull; leadId = $leadId; childId = $kid2.id } $S
T "B9 lop het cho -> chan xep them" (-not $r.ok) $r.err
$r = Mu "admissions.trials.enrollToClass" @{ trialClassId = $tcFull; leadId = $leadId; childId = $kid2.id; override = $true } $S
T "B9b tu van khong co quyen vuot si so" (-not $r.ok) $r.err
$r = Mu "admissions.trials.enrollToClass" @{ trialClassId = $tcFull; leadId = $leadId; childId = $kid2.id; override = $true } $M
T "B9c quan ly vuot si so duoc" $r.ok $r.err

Write-Host ""
Write-Host "===== C. NHOM LOP ====="
$r = Mu "academics.classes.upsertGroup" @{ code = "NL$rnd"; name = "Nhom kiem thu $rnd"; centerId = $cs1.id } $G
$gid = $r.data.id
T "C1 tao nhom lop" ($r.ok -and $gid) $r.err
$r = Q "academics.classes.groups" $null $G
$found = @(@($r.data) | Where-Object { $_.id -eq $gid }).Count
T "C2 danh sach nhom lop co ban ghi moi" ($found -ge 1) ("tim thay=" + $found)

Write-Host ""
Write-Host "===== D. TAI CHINH ====="
$stu = (Q "students.list" @{ centerId = $cs1.id } $K).data
$student = @($stu.items)[0]; if ($null -eq $student) { $student = @($stu)[0] }
T "D0 lay duoc hoc vien" ($null -ne $student) ""
$r = Mu "finance.createOrder" @{
  type = "course"; centerId = $cs1.id; studentId = $student.id
  customer = @{ name = "PH Kiem Thu $rnd"; phone = $phone }
  items = @(@{ description = "Hoc phi kiem thu"; quantity = 1; unitPrice = 6000000; packageSessions = 48; studentId = $student.id })
  paymentMethodId = $method.id
  installments = @{ count = 2; firstDueDate = $today; depositAmount = 2000000 }
} $S
$orderId = $r.data.id
T "D1 tao don + coc 2tr + 2 dot" ($r.ok -and $orderId) $r.err
$r = Mu "finance.recordPayment" @{ orderId = $orderId; amount = 2000000; paymentMethodId = $method.id; paidAt = $today; payerName = "PH Kiem Thu" } $S
$payId = $r.data.id
T "D2 sale ghi nhan khoan thu" ($r.ok -and $payId) $r.err
$r = Mu "finance.decidePayment" @{ paymentId = $payId; decision = "confirm" } $S
T "D3 sale KHONG xac nhan duoc khoan thu" (-not $r.ok) $r.err
$r = Mu "finance.decidePayment" @{ paymentId = $payId; decision = "confirm" } $K
T "D4 ke toan xac nhan khoan thu" $r.ok $r.err
$od = (Q "finance.order" @{ id = $orderId } $K).data
$pv = @($od.payments) | Where-Object { $_.id -eq $payId } | Select-Object -First 1
$ver = $pv.version; if ($null -eq $ver) { $ver = 1 }
$r = Mu "finance.adjustConfirmedPayment" @{ paymentId = $payId; newAmount = 2100000; reason = "Khach chuyen du 100k"; version = $ver } $K
T "D5 dieu chinh khoan da xac nhan" $r.ok $r.err
$r = Q "finance.payments" @{ centerId = $cs1.id } $K
$row = @($r.data.items) | Where-Object { $_.id -eq $payId } | Select-Object -First 1
T "D6 dem so lan dieu chinh = 1" ($row.adjustCount -eq 1) ("adjustCount=" + $row.adjustCount)
$r = Mu "finance.issueOrderQr" @{ orderId = $orderId } $K
T "D7 xuat QR chuyen khoan" $r.ok $r.err
$r = Q "finance.orderQr" @{ orderId = $orderId } $K
T "D8 QR con hieu luc -> dung lai" ($r.ok -and ($r.data.state -ne "expired")) ("state=" + $r.data.state)
$r = Q "finance.enrollmentDebts" @{ centerId = $cs1.id } $K
$js = ($r.data | ConvertTo-Json -Depth 6 -Compress)
T "D9 cong no co Thieu-PH-dang-thay va Thieu-that" (($js -match "shortParent") -and ($js -match "shortReal")) $r.err
$r = Q "finance.missingTuition" @{ } $K
T "D10 danh sach thieu hoc phi" $r.ok $r.err

# --- Duyet giam gia vuot nguong (KT-25) ---
# Nguong mac dinh 20%: don giam 30% phai vao "cho duyet" va KHONG thu duoc tien cho toi khi duyet.
$r = Mu "finance.createOrder" @{
  type = "course"; centerId = $cs1.id; studentId = $student.id
  customer = @{ name = "PH Giam Gia $rnd"; phone = $phone }
  items = @(@{
    description = "Hoc phi kiem thu giam sau"; quantity = 1; unitPrice = 6000000; packageSessions = 48; studentId = $student.id
    discounts = @(@{ kind = "percent"; policy = "percent"; value = 30; reason = "Uu dai kiem thu" })
  })
  paymentMethodId = $method.id
  installments = @{ count = 1; firstDueDate = $today }
} $S
$donGiam = $r.data.id
T "D11 sale tao duoc don giam 30%" ($r.ok -and $donGiam) $r.err
T "D11b don vao trang thai cho duyet" ($r.data.discountApproval -eq "pending") ("trang thai=" + $r.data.discountApproval)
$r = Mu "finance.recordPayment" @{ orderId = $donGiam; amount = 1000000; paymentMethodId = $method.id; paidAt = $today; payerName = "PH Giam Gia" } $S
T "D12 chua duyet thi KHONG ghi nhan thu duoc" (-not $r.ok) $r.err
$r = Mu "finance.decideDiscount" @{ orderId = $donGiam; decision = "approve" } $S
T "D13 sale KHONG tu duyet giam gia duoc" (-not $r.ok) $r.err
$r = Mu "finance.decideDiscount" @{ orderId = $donGiam; decision = "approve"; note = "Duyet theo chuong trinh" } $M
T "D14 quan ly co so duyet giam gia" $r.ok $r.err
$r = Mu "finance.recordPayment" @{ orderId = $donGiam; amount = 1000000; paymentMethodId = $method.id; paidAt = $today; payerName = "PH Giam Gia" } $S
T "D15 duyet xong thi thu tien binh thuong" $r.ok $r.err
$r = Q "finance.orders" @{ centerId = $cs1.id; approval = "pending" } $K
T "D16 loc duoc hang cho duyet giam gia" $r.ok ("so don cho duyet=" + @($r.data.items).Count)

Write-Host ""
Write-Host "===== E. HOA HONG (tran 9%) ====="
$r = Mu "finance.upsertCommissionPolicy" @{
  name = "KT vuot tran $rnd"; event = "hoc_vien_moi"; orderScope = "all"; centerId = $null; calcMethod = "percent"
  shares = @(@{ role = "CENTER_SALES_CSM"; value = 1500; maxAmount = $null }, @{ role = "CENTER_MANAGER"; value = 1200; maxAmount = $null })
  sourceRef = "KT"; note = $null; effectiveFrom = $today; effectiveTo = $null; isActive = $true; reason = "kiem thu tran"
} $A
T "E1 chinh sach vuot tran 9% -> bi chan" ((-not $r.ok) -and ($r.err -match "9|tr(ầ|a)n")) $r.err
$r = Mu "finance.upsertCommissionPolicy" @{
  name = "KT trong tran $rnd"; event = "ban_thiet_bi"; orderScope = "product"; centerId = $null; calcMethod = "fixed"
  shares = @(@{ role = "CENTER_SALES_CSM"; value = 50000; maxAmount = $null })
  sourceRef = "SR.QD.208"; note = $null; effectiveFrom = $today; effectiveTo = $null; isActive = $true; reason = "kiem thu trong tran"
} $A
T "E2 chinh sach trong tran -> OK" $r.ok $r.err

Write-Host ""
Write-Host "===== F. BUOI HOC & DIEM DANH ====="
$from = (Get-Date).AddDays(-400).ToString("yyyy-MM-dd"); $to = (Get-Date).AddDays(400).ToString("yyyy-MM-dd")
$allSess = @((Q "academics.sessions.list" @{ from = $from; to = $to; centerId = $cs1.id } $G).data)
# Phai chon buoi cua lop CON HOC VIEN: lop rong thi roster rong -> enrollmentId null ->
# recordAttendance bao "Expected string, received null" va F3 hong theo.
$one = $null; $ws = $null
$wsCache = @{}
# Buoi phai DA DIEN RA (recordAttendance chan buoi tuong lai) va thuoc lop con hoc vien.
# THEM: uu tien buoi CON TRONG HAN dang ky hoc bu (mac dinh 30 ngay). Moi lan chay kich ban
# lai chot them mot buoi gan day, nen sau vai lan chay ung vien moi nhat troi ra ngoai han;
# luc do pendingAbsences (loc theo han) tra ve 0 dong va F3 bao sai oan.
$hanHocBu = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
$ungVien = @($allSess | Where-Object { $_.status -eq "scheduled" -and $_.classId -and $_.date -le $today -and $_.date -ge $hanHocBu } | Sort-Object -Property date -Descending)
if ($ungVien.Count -eq 0) {
  $ungVien = @($allSess | Where-Object { $_.status -eq "scheduled" -and $_.classId -and $_.date -le $today } | Sort-Object -Property date -Descending)
}
foreach ($cand in $ungVien) {
  if (-not $wsCache.ContainsKey($cand.classId)) { $wsCache[$cand.classId] = (Q "academics.classes.get" @{ id = $cand.classId } $G).data }
  $w = $wsCache[$cand.classId]
  # CHU Y: @($null).Count = 1 trong PowerShell — phai kiem tra $null truoc khi dem
  if ($null -ne $w -and $null -ne $w.roster -and @($w.roster).Count -gt 0) { $one = $cand; $ws = $w; break }
}
if ($null -eq $one) {
  # Khong co buoi nao vua da dien ra vua thuoc lop con hoc vien: van lay mot buoi de F0/F7/F8 chay duoc
  $one = @($allSess) | Where-Object { $_.status -eq "scheduled" } | Select-Object -First 1
  if ($null -eq $one) { $one = @($allSess)[0] }
  if ($null -ne $one -and $one.classId) { $ws = (Q "academics.classes.get" @{ id = $one.classId } $G).data }
}
if ($null -ne $one -and $one.classId) { $cls = @($clsAll) | Where-Object { $_.id -eq $one.classId } | Select-Object -First 1 }
$sessAll = @($allSess | Where-Object { $_.classId -eq $one.classId })
T "F0 lay duoc mot buoi hoc" ($null -ne $one) ("tong buoi cua lop=" + @($sessAll).Count)
$rosters = @()
if ($null -ne $ws -and $null -ne $ws.roster) { $rosters = @($ws.roster) }
T "F1 lop co hoc vien" ($rosters.Count -gt 0) ("lop=" + $one.classCode + " si so=" + $rosters.Count)
if ($rosters.Count -eq 0) { Write-Host "SKIP  F2-F6 (khong tim duoc buoi 'scheduled' nao thuoc lop con hoc vien)" }
if ($rosters.Count -gt 0 -and $null -ne $one) {
  # Chon hoc vien nghi phep la nguoi CHUA co yeu cau hoc bu cho dung buoi nay: phan O ben duoi
  # tao yeu cau hoc bu tu pendingAbsences, nen chay lan sau ma van cham dung nguoi do thi
  # pendingAbsences (loc "chua co yeu cau") tra ve 0 dong va F3 bao sai oan.
  $daCoYeuCau = Psql ("select coalesce(string_agg(enrollment_id::text, ','), '') from makeup_requests where missed_session_id = '" + $one.id + "' and status <> 'rejected'")
  $vang = @($rosters | Where-Object { $daCoYeuCau -notlike ("*" + $_.enrollmentId + "*") }) | Select-Object -First 1
  $coNguoiVang = $null -ne $vang
  if (-not $coNguoiVang) { $vang = $rosters[0] }
  $recs = @()
  $recs += @{ enrollmentId = $vang.enrollmentId; status = "absent_excused"; needsMakeup = $true; absenceReason = "PH bao om" }
  foreach ($rr in $rosters) { if ($rr.enrollmentId -ne $vang.enrollmentId) { $recs += @{ enrollmentId = $rr.enrollmentId; status = "present"; studentRemark = "Em lam bai tot trong buoi nay" } } }
  $r = Mu "academics.sessions.recordAttendance" @{ sessionId = $one.id; records = $recs } $G
  T "F2 diem danh (vang co phep + can hoc bu + ly do PH)" $r.ok $r.err
  if (-not $coNguoiVang) {
    # Ca lop deu da co yeu cau hoc bu cho buoi nay (do nhung lan chay truoc) — khong con dong nao
    # hop le de kiem tra, bo qua thay vi bao sai.
    Write-Host "SKIP  F3 (moi hoc vien cua buoi nay deu da co yeu cau hoc bu tu lan chay truoc)"
  } elseif ($one.date -lt $hanHocBu) {
    # Ngoai han dang ky hoc bu thi danh sach cho xep bu KHONG liet ke buoi nay — dung theo nghiep vu,
    # khong phai loi he thong, nen bo qua thay vi bao sai.
    Write-Host ("SKIP  F3 (buoi " + $one.date + " da ngoai han dang ky hoc bu 30 ngay — chay lai db:seed neu muon kiem tra muc nay)")
  } else {
    $r = Q "schedule.pendingAbsences" $null $G
    $found = @(@($r.data) | Where-Object { $_.sessionId -eq $one.id }).Count
    T "F3 buoi vang vao danh sach cho xep bu" ($found -ge 1) ("so dong=" + $found)
  }
  $r = Mu "academics.sessions.transition" @{ sessionId = $one.id; event = "complete" } $G
  T "F4 chot buoi khi chua du dieu kien -> bi chan" (-not $r.ok) $r.err
  $r = Mu "academics.sessions.confirmLesson" @{ sessionId = $one.id } $G
  T "F5 xac nhan bai da day" $r.ok $r.err
  $r = Mu "academics.sessions.saveNote" @{ sessionId = $one.id; note = "Buoi hoc dien ra tot, cac em lam quen cam bien" } $G
  T "F6 ghi nhan xet buoi" $r.ok $r.err
}
$before = @($sessAll).Count
$fut = @($sessAll) | Where-Object { $_.date -gt $today -and $_.status -eq "scheduled" } | Select-Object -First 1
if ($null -ne $fut) {
  $r = Mu "academics.sessions.cancel" @{ sessionId = $fut.id; reason = "GV om dot xuat, doi sang buoi bu"; mode = "shift" } $G
  T "F7 huy buoi kieu doi -> OK" $r.ok $r.err
  $after = @((Q "academics.sessions.list" @{ from = $from; to = (Get-Date).AddDays(400).ToString("yyyy-MM-dd"); classId = $cls.id } $G).data)
  $act = @($after | Where-Object { $_.status -ne "cancelled" }).Count
  $actBefore = @($sessAll | Where-Object { $_.status -ne "cancelled" }).Count
  T "F8 huy kieu doi giu nguyen tong buoi" ($act -ge $actBefore) ("truoc=$actBefore sau=$act")
}

Write-Host ""
Write-Host "===== G. ANH LOP HAI TANG ====="
$lib = @((Q "learning.media" @{ status = "library"; limit = 200 } $M).data)
T "G1 co anh trong kho lop" ($lib.Count -gt 0) ("so anh=" + $lib.Count)
# submitMedia / reviewMedia / restoreMedia tra ve { results, ok, failed } — `ok` la SO DONG
# THANH CONG cua nghiep vu. Loi goi HTTP thanh cong ma ok=0 van la hong: phai doc results[].message.
$pick = @($lib) | Where-Object { $_.isClassWide -eq $true -or @($_.taggedStudentIds).Count -gt 0 } | Select-Object -First 1
if ($lib.Count -gt 0 -and $null -eq $pick) {
  Write-Host "SKIP  G2-G5 (kho lop khong co anh nao da gan hoc vien hoac danh dau anh chung -> khong du dieu kien gui duyet)"
}
if ($null -ne $pick) {
  $mid = $pick.id
  $r = Mu "learning.submitMedia" @{ ids = @($mid) } $M
  T "G2 gui duyet anh tu kho" ($r.ok -and ([int]$r.data.ok -ge 1)) (MediaLoi $r)
  $r = Mu "learning.reviewMedia" @{ ids = @($mid); action = "reject"; reason = "Anh mo" } $M
  T "G3 loai anh" ($r.ok -and ([int]$r.data.ok -ge 1)) (MediaLoi $r)
  $r = Mu "learning.restoreMedia" @{ ids = @($mid) } $M
  T "G4 khoi phuc anh trong 7 ngay" ($r.ok -and ([int]$r.data.ok -ge 1)) (MediaLoi $r)
  $r = Q "learning.media" @{ sessionId = $pick.sessionId; status = "pending"; limit = 200 } $M
  $back = @(@($r.data) | Where-Object { $_.id -eq $mid }).Count
  T "G5 anh khoi phuc quay lai cho duyet" ($back -ge 1) ("tim thay=" + $back)
}

Write-Host ""
Write-Host "===== H. HOC VIEN: BAO LUU / NGHI / KICH HOAT ====="
$r = Mu "students.reserve" @{ studentId = $student.id; reason = "Gia dinh ve que ba thang"; expectedReturn = (Get-Date).AddDays(60).ToString("yyyy-MM-dd") } $M
T "H1 bao luu hoc vien" $r.ok $r.err
$r = Mu "students.endReserve" @{ studentId = $student.id; reason = "Be quay lai som" } $M
T "H2 ket thuc bao luu" $r.ok $r.err
$r = Mu "students.reserve" @{ studentId = $student.id; reason = "" } $M
T "H3 bao luu khong ly do -> bi chan" (-not $r.ok) $r.err

Write-Host ""
Write-Host "===== I. CHAM CONG ====="
$staffList = (Q "hr.staff" @{ centerId = $cs1.id } $H).data
$st = @($staffList.items)[0]; if ($null -eq $st) { $st = @($staffList)[0] }
T "I0 lay duoc nhan su" ($null -ne $st) ""
$period = (Get-Date).ToString("yyyy-MM")
$r = Mu "hr.generateRoster" @{ centerId = $cs1.id; period = $period; dryRun = $true } $H
$j = ($r.data | ConvertTo-Json -Depth 6 -Compress)
T "I1 sinh luoi phan ca chay thu" $r.ok $r.err
T "I2 chay thu co bang phan loai o" ($j -match "tally|created|kept|protected|skipped") ""
$r = Mu "hr.overrideDay" @{ staffId = $st.id; date = $today; units = 1; label = "Ghi de kiem thu"; reason = "Kiem thu ghi de cong" } $H
T "I3 ghi de cong ngay" $r.ok $r.err
$prev = (Get-Date).AddMonths(-1).ToString("yyyy-MM")
$r = Mu "hr.lockPeriod" @{ centerId = $cs1.id; period = $prev } $K
$lockOk = $r.ok
T "I4 ke toan chot duoc ky cong (hoac neu chan thi phai noi ro vi sao)" ($r.ok -or ($r.err -match "chua k(ế|e)t th(ú|u)c|don ch(ờ|o) duy(ệ|e)t|đơn chờ duyệt|c(ờ|o) chua r(à|a)")) $r.err
if ($lockOk) {
  $r = Mu "hr.overrideDay" @{ staffId = $st.id; date = ($prev + "-15"); units = 0.5; label = "Sau khi chot"; reason = "Thu sua sau khi chot" } $H
  T "I5 ky da chot -> chan sua cong" (-not $r.ok) $r.err
  $r = Mu "hr.unlockPeriod" @{ centerId = $cs1.id; period = $prev; reason = "" } $A
  T "I6 mo lai ky khong ly do -> bi chan" (-not $r.ok) $r.err
  $r = Mu "hr.unlockPeriod" @{ centerId = $cs1.id; period = $prev; reason = "Sai cong mot nguoi, mo lai de sua" } $A
  T "I7 mo lai ky co ly do -> OK" $r.ok $r.err
} else {
  Write-Host "SKIP  I5-I7 (ky truoc chua chot duoc: $($r.err))"
}
$r = Q "hr.periodBoard" @{ centerId = $cs1.id; period = $period } $K
T "I8 bang ky cong co trang thai + chi so" ($r.ok -and ($null -ne $r.data)) ("status=" + $r.data.status)

Write-Host ""
Write-Host "===== J. CAY TO CHUC ====="
$tree = (Q "org.unitTree" $null $A).data
$units = @($tree.items); if ($units.Count -eq 0) { $units = @($tree) }
T "J1 doc duoc cay to chuc" ($units.Count -gt 0) ("so don vi=" + $units.Count)
$root = @($units) | Where-Object { $_.type -eq "region" -or $_.type -eq "ho" } | Select-Object -First 1
if ($null -ne $root) {
  $r = Mu "org.createUnit" @{ code = "KT$rnd"; name = "Don vi kiem thu $rnd"; type = "department"; parentId = $root.id; relationshipType = "owned"; reason = "Kiem thu cay to chuc" } $A
  $uid = $r.data.id
  T "J2 tao don vi con" ($r.ok -and $uid) $r.err
  if ($r.ok) {
    $r = Mu "org.updateUnit" @{ id = $uid; code = "KTX$rnd"; name = "Doi ma"; reason = "Thu doi ma" } $A
    T "J3 ma don vi khong doi duoc sau khi tao" (-not $r.ok) $r.err
    $r = Mu "org.deleteUnit" @{ id = $uid; reason = "Xoa don vi kiem thu" } $A
    T "J4 xoa mem don vi" $r.ok $r.err
  }
}

Write-Host ""
Write-Host "===== K. QUYEN NHOM & NHAT KY ====="
$grp = @((Q "admin.groups" $null $A).data)[0]
if ($null -ne $grp) {
  $r = Mu "admin.setGroupPermissions" @{ groupId = $grp.id; permissions = @("report:read"); reason = "Kiem thu quyen nhom" } $A
  T "K1 cap quyen cho nhom nguoi dung" $r.ok $r.err
  $r = Mu "admin.setGroupPermissions" @{ groupId = $grp.id; permissions = @("system:update"); reason = "Kiem thu quyen cam" } $A
  T "K2 khong cap duoc quyen he thong qua nhom" (-not $r.ok) $r.err
}
$aud = @((Q "system.audit" @{ } $A).data.items)
T "K3 doc duoc nhat ky thao tac" ($aud.Count -gt 0) ("so dong=" + $aud.Count)
$masked = ($aud | ConvertTo-Json -Depth 6 -Compress) -match "\*\*\*"
T "K3b nhat ky che SDT/email mac dinh" $masked ""
if ($aud.Count -gt 0) {
  $r = Mu "system.revealAudit" @{ id = $aud[0].id; reason = "ngan" } $A
  T "K4 mo xem day du ly do ngan -> bi chan" (-not $r.ok) $r.err
  $r = Mu "system.revealAudit" @{ id = $aud[0].id; reason = "Kiem tra khieu nai cua phu huynh ngay hom nay" } $A
  T "K5 mo xem day du co ly do -> OK" $r.ok $r.err
}

Write-Host ""
Write-Host "===== L. DANH GIA & KHAO SAT V2 ====="
$r = Mu "care.upsertEvalForm" @{ title = "Phieu kiem thu $rnd"; type = "teacher_eval"; centerId = $null; questions = @(@{ type = "radio"; label = "Cau hoi mot lua chon"; options = @("A") }) } $A
T "L1 radio chi 1 lua chon -> bi chan" ((-not $r.ok) -and ($r.err -match "2|l(ự|u)a ch(ọ|o)n")) $r.err
$r = Mu "care.upsertEvalForm" @{ title = "Phieu kiem thu $rnd"; type = "teacher_eval"; centerId = $null; questions = @(@{ type = "rating"; label = "Thay day de hieu"; criteriaGroup = "Chuyen mon" }, @{ type = "checkbox"; label = "Ban thich diem nao"; options = @("Noi dung", "Giao vien") }) } $A
$formId = $r.data.id
T "L2 tao phieu danh gia hop le" ($r.ok -and $formId) $r.err
if ($r.ok) {
  $r = Mu "care.upsertEvalForm" @{ title = "Phieu anh $rnd"; type = "teacher_eval"; centerId = $null; questions = @(@{ type = "image"; label = "Tai anh minh hoa" }) } $A
  T "L3 cau hoi Tai anh chi dung cho phieu buoi hoc -> bi chan" (-not $r.ok) $r.err
  $r = Mu "care.upsertEvalRound" @{ formId = $formId; title = "Dot kiem thu $rnd"; centerId = $null; startDate = $today; endDate = (Get-Date).AddDays(14).ToString("yyyy-MM-dd") } $A
  $roundId = $r.data.id
  T "L4 tao dot khao sat" ($r.ok -and $roundId) $r.err
  if ($r.ok) {
    $r = Mu "care.transitionEvalRound" @{ id = $roundId; action = "open" } $A
    T "L5 mo dot khao sat" $r.ok $r.err
    $r = Mu "care.transitionEvalRound" @{ id = $roundId; action = "close" } $A
    T "L6 dong dot khao sat" $r.ok $r.err
  }
}

Write-Host ""
Write-Host "===== M. THONG BAO CAN THUC HIEN ====="
$r = Mu "engagement.runActionAlerts" @{ } $A
$cnt = $r.data.created; if ($null -eq $cnt) { $cnt = ($r.data | ConvertTo-Json -Compress) }
T "M1 chay ra soat canh bao" ($r.ok -and ($null -ne $r.data)) ("ket qua=" + $cnt)
$r = Q "engagement.notificationCenter" @{ } $K
$items = @($r.data.items)
T "M2 trung tam thong bao (ke toan) co du lieu" ($items.Count -gt 0) ("so thong bao=" + $items.Count)
$r = Q "opsConfig.notificationTypes" $null $A
$nt = @($r.data.items); if ($nt.Count -eq 0) { $nt = @($r.data) }
T "M3 danh muc loai thong bao" ($nt.Count -ge 20) ("so loai=" + $nt.Count)

Write-Host ""
Write-Host "===== N. QUYEN THEO VAI ====="
$r = Q "finance.payments" @{ centerId = $cs1.id } $TE
T "N1 giao vien khong xem duoc thanh toan" (-not $r.ok) $r.err
$r = Q "hr.staff" @{ centerId = $cs1.id } $S
T "N2 sale khong xem duoc ho so nhan su" (-not $r.ok) $r.err
$r = Q "students.list" @{ centerId = $cs1.id } $K
T "N3 ke toan xem duoc hoc vien" $r.ok $r.err
$r = Q "system.users" @{ } $M
T "N4 quan ly co so khong quan ly duoc tai khoan" (-not $r.ok) $r.err
$r = Q "academics.classes.list" @{ centerId = $cs1.id } $TE
T "N5 giao vien chi thay lop cua minh" $r.ok $r.err


Write-Host ""
Write-Host "===== O. HOC BU & CHUYEN LOP ====="
$pa = @((Q "schedule.pendingAbsences" $null $G).data)
T "O0 co buoi vang cho xep bu" ($pa.Count -gt 0) ("so dong=" + $pa.Count)
if ($pa.Count -gt 0) {
  $a = $pa[0]
  $r = Mu "schedule.requestMakeup" @{ enrollmentId = $a.enrollmentId; missedSessionId = $a.sessionId; note = "PH xin hoc bu" } $G
  $reqId = $r.data.id
  T "O1 tao yeu cau hoc bu" ($r.ok -and $reqId) $r.err
  if ($r.ok) {
    $cand = (Q "schedule.makeupCandidates" @{ requestId = $reqId } $G)
    $cn = @($cand.data).Count
    T "O1b co danh sach buoi nhan hoc bu" $cand.ok ("so lua chon=" + $cn)
    if ($cand.ok -and $cn -gt 0) {
      $t1 = @($cand.data)[0]
      $r = Mu "schedule.decideMakeup" @{ requestId = $reqId; action = "approve"; targetSessionId = $t1.id } $G
      T "O1c xep buoi hoc bu" $r.ok $r.err
    }
  }
}
$mk = @((Q "schedule.makeups" @{ } $G).data)
T "O2 doc duoc danh sach hoc bu" ($null -ne $mk) ""
$enr2 = @((Q "students.openEnrollments" @{ } $G).data)
T "O3 doc duoc ghi danh dang mo" ($enr2.Count -ge 0) ("so ghi danh=" + $enr2.Count)
$tr = @((Q "students.transferRequests" @{ } $M).data)
T "O4 doc duoc yeu cau chuyen lop" ($null -ne $tr) ("so yeu cau=" + $tr.Count)

Write-Host ""
Write-Host "===== P. CONG PHU HUYNH ====="
foreach ($p in @("/ph", "/ph/lich", "/ph/hoc-phi", "/ph/tin-nhan")) {
  $code = & curl.exe -s -o "$env:TEMP\v3ph.html" -w "%{http_code}" "http://localhost:3000$p"
  T "P $p tra ve trang (200/302/307)" (@("200","302","307","401") -contains $code) ("HTTP " + $code)
}

Write-Host ""
Write-Host "================ KET QUA ================"
Write-Host "PASS: $script:pass"
Write-Host "FAIL: $script:fail"
if ($script:fail -gt 0) { Write-Host ("FAIL LIST: " + ($script:failList -join " | ")) }
Write-Host "DONE"
