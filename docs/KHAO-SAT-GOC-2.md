# Khảo sát bản gốc admin.satarobo.vn — vòng 2 (18/09/2026)

Cách khảo sát: đọc payload RSC và mã nguồn client của từng trang (chỉ GET, không bấm nút ghi dữ liệu).
Tài liệu này **chỉ ghi cấu trúc**: tên trường, enum, nhãn, câu chữ hướng dẫn, quy tắc. Không chép dữ liệu cá nhân.

## 0. Bộ quyền của bản gốc (đầy đủ)

Trích từ props `granted` của AdminShell. Nhóm theo tiền tố:

```
assignments: view create edit delete grade assign-own author-own
attendance: view mark edit
audit-logs: view view-pii
blog: view create edit delete
centers: view edit
chat: read send moderate announce admin
class_group: view-all create edit delete
classes: view-all view-own create edit delete
completions: manage propose-own
course-packages: view edit
courses: view create edit delete
curriculum: view create edit delete
discounts: approve
documents: view upload delete
elearning: portal:access lesson:learn program:manage content:author content:publish
          assignment:create assignment:extend requirement:manage progress:view-own
          progress:view-team progress:view-all video-analytics:view exam:grade
          exam:unlock certificate:issue certificate:revoke report:export
emails: view manage
employees: view-all view-public view-personal view-salary create edit delete
enrollments: view-all view-own create edit delete cancel transfer
evaluations: manage view-aggregate view-detail
exams: view create edit delete grade
holidays: view edit
honors: view create edit delete settings
hr_attendance: view checkin adjust assign approve close-period export config
installments: approve
inventory: view edit movement audit
jobs: view create edit delete
kits: view edit
lead_pool: manage
leads: view-all view-own view-pii create edit edit-own-intake change-status
       assign assign-config overwrite import export delete
lesson-change: approve
media: view upload upload-draft approve
news: view create edit delete publish
notifications: manage
orders: view view-pii create manage
parent-feedback: view
parent-requests: manage
payments: view view-pii record confirm adjust manage
payroll: view edit
products: view manage
questions: view author edit delete
report-cards: manage review
reports: training
roles: manage assign
rooms: view edit
satacoin: manage
session-feedback: view-all
sessions: view create edit
settings: view edit
site-content: view edit
students: view-all view-own-class create edit delete import change-code
teaching-materials: view-own-class
training: manage
trials: view manage config attendance feedback assign-teacher assign-teacher-center
        override-capacity
user-groups: manage
users: manage
```

Cờ tính năng (feature flag) truyền xuống giao diện: `evalV2Enabled`, `scormEnabled`, `classGroupEnabled`.
→ Bản gốc có **Nhóm lớp (class_group)** ẩn sau cờ, và **học bạ năng lực v2** ẩn sau cờ.

## 1. CRM & Lead

### /leads — Danh sách Lead
- Dữ liệu một dòng lead: `id, parentName, phone, email, childName, childAge, status, source, note,
  utmSource, utmMedium, utmCampaign, eventId, landingPage, referrer, ipAddress, userAgent,
  consentMarketing, createdAt, lastInboundAt`.
- Props danh sách: `canDelete, canExport, page, pageSize (20), total, sapXep: "moi_nhat"`.
- Enum trạng thái: `MOI, DA_LIEN_HE, DANG_TU_VAN, DA_HEN_HOC_THU, DANG_HOC_THU, DA_HOC_THU,
  CHO_QUYET_DINH, DA_DANG_KY, DANG_NUOI_DUONG, DA_MAT`.
- Thanh công cụ: Bảng | Kanban, Tải file mẫu (mau-lead.xlsx), Import Excel, Chốt hàng loạt, + Thêm lead.
- Bộ lọc: Tìm (tên / SĐT / tên con), Cơ sở, Sale, Nguồn (vd: sata1, sale-form, quatang), Từ ngày, Đến ngày,
  Tất cả trạng thái; nút Lọc / Xoá lọc; **Cột hiển thị** (chọn cột), Xuất Excel, Làm mới.
- Cột: Phụ huynh/Học sinh · SĐT · Khoá quan tâm · Trạng thái · Cơ sở · Sale phụ trách · Ngày nhận lead · Hành động.
- Hành vi: đổi trạng thái ngay trên dòng ("Đổi trạng thái", "Chuyển sang …"); chuyển sang **Đã mất bắt buộc ghi Lý do**
  ("Lead rời phễu ở bước này. Ghi lý do để báo cáo biết vì sao mất, không chỉ biết mất ở bậc nào.").
- Có nhãn "· nhập lại" / "· nhập lại N lần" cạnh ngày nhận lead.
- Có khái niệm **lead dùng chung**: "Bạn đang chia sẻ lead này", nhãn "Dùng chung".
- Phân công: "Chưa phân công", "Đã phân công lead (round-robin)".
- Sắp xếp theo cột (nút "Sắp theo …").

### /nhap-khach-hang — Nhập khách hàng (phiếu nhanh)
- Trường: SĐT phụ huynh, tên phụ huynh, "Con của phụ huynh" (nhiều bé: "Tên bé thứ N", nút "Bỏ bé thứ N"),
  cơ sở (2), khoá quan tâm (9 khoá).
- Nút "Lưu và nhập phiếu tiếp".
- Thông báo trùng: "Số này đã có trong hệ thống — đã thêm bé vào khách cũ." /
  "Số này đã có trong hệ thống — không tạo khách mới."; bảng phiên hiển thị "trùng số — đã thêm bé vào khách cũ",
  "trùng số — không tạo mới", "đã tạo".

### /leads/import — Nhập lead từ Excel
- Đọc trực tiếp .xlsx (có lỗi "File Excel không có sheet nào", "File Excel rỗng hoặc sai format").
- Cột: Cơ sở (mã CS, để trống được), Sale phụ trách (email hoặc mã NV), Tên phụ huynh, SĐT, Tên con, Tuổi con,
  Khoá quan tâm, Nguồn, Ghi chú.
- Kiểm tra: "Thiếu tên phụ huynh", "Thiếu SĐT", mã cơ sở `^[A-Z0-9_]{2,16}$`, email đúng định dạng.
- Ba nhóm: Hợp lệ / Trùng / Lỗi + bộ lọc dòng theo tình trạng; sửa ngay tại chỗ ("Bấm Sửa để chữa ngay tại đây —
  không cần mở lại file Excel"); cột "Đè" ghi đè thông tin cũ; dòng chữ dưới mỗi dòng nói rõ sẽ ghi đè lên ai.
- Quy tắc: lead đang ở bậc cao "giữ nguyên, lead đang ở L3 không bị kéo về".

### /leads/bulk-convert — Chốt hàng loạt
- Đọc token trong ghi chú: `ĐãĐóng=`, `HạnĐợt2=YYYY-MM-DD`.
- "Điền đã đóng = học phí niêm yết (lead đã tick)", "Đồng ý ảnh: tick tất cả".
- Chốt idempotent: "Mất kết nối hoặc lỗi hệ thống — bấm chốt lại (an toàn, không tạo trùng)".
- Rút gọn tiền: k / tr / tỷ.

### /quan-ly-chia-lead — Quản lý chia lead
- Tab: Cấu hình pool | Sổ chia; lọc theo **Khu vực** (khuVucId/khuVucTen) và cơ sở; có "Chưa gắn khu vực".
- Chế độ chia: `ROUND_ROBIN` (+ các chế độ khác); cảnh báo "⚠️ Chế độ này KHÔNG tiêu lượt của sổ —
  cột … bên dưới sẽ đứng yên trong khi lead vẫn được chia."
- Trạng thái sale trong pool: Đang nhận / Tạm nghỉ / Chưa từng được chia; nút "Thêm sale vào pool".
- Quy tắc nghỉ: tắt thì "lead đang giữ vẫn nguyên, bộ đếm lượt đóng băng, không bị xoá";
  bật lại thì "lượt được đặt về mức thấp nhất của những người đang nhận, để họ không bị dồn lead bù cho ngày nghỉ".

### /ban-giao-lead — Bàn giao lead
- Chọn sale nguồn → sale nhận; lọc theo trạng thái (9 trạng thái), **Chiến dịch (utmCampaign)**;
  tuỳ chọn "Chỉ lead chưa đóng"; nút "Xem trước số lead" trước khi bàn giao.

### /lead-nguoi — Lead lâu ngày chưa chăm
- Cột: Phụ huynh · SĐT · Trạng thái · Đang giữ (chủ hiện tại) · Im bao lâu.
- Lọc theo cơ sở và số ngày; chọn hết dòng của trang; "Chọn tư vấn viên nhận" + **Lý do phân bổ lại** (bắt buộc).

### /leads/bao-cao-chuyen — Báo cáo chuyển lead liên cơ sở
- Thẻ số: Tổng chuyển, CS2 → CS1 (và chiều ngược lại), Đã chốt; bảng: Chuyển · Người chuyển · Lý do/bàn giao · Kết quả · Ngày.

### /affiliates — Nguồn giới thiệu
- Form: Mã giới thiệu*, Tên người/đối tác*, Điện thoại, Cơ sở theo dõi; link `?ref=MÃ` (có nút copy).

### /crm/messenger — Inbox Messenger
- Hộp thư theo phạm vi người dùng; có câu trả lời mẫu (quick reply) soạn sẵn.

### /lop-trial — Lớp Trial (lớp trải nghiệm nhiều buổi)
- Luồng: tạo lớp → thêm buổi → xếp học viên → điểm danh.
- Tên lớp hệ thống tự đặt từ cơ sở + khoá trải nghiệm; ngày/giờ/phòng/giáo viên chọn **theo từng buổi**.
- Thêm một học viên = học **toàn bộ buổi** của lớp, kể cả buổi tạo sau.
- Đổi lịch/huỷ một buổi **bắt buộc ghi lý do**, lý do gửi thẳng cho giáo viên phụ trách buổi.
- Lọc lớp: Đang mở / Tất cả; huỷ lớp cần bấm 2 lần xác nhận.

## 2. Học viên, ghi danh, lớp, buổi

### /students — Học viên
- Bộ lọc trạng thái: Đang học, Chờ xếp lớp, Bảo lưu, **Vắng nhiều (frequent-absent)**, Tái tục, Nghỉ học.
- Lọc theo cơ sở, lớp; tìm theo tên/mã/phụ huynh/SĐT phụ huynh; phân trang 20/trang.
- Nút: Thêm học viên, Import Excel, Tài khoản PH.

### /students/tai-khoan — Tài khoản phụ huynh
- Dữ liệu: `id, name, phone, email, center, status, createdAt, students, zns`; enum `PENDING_ACTIVATION`.
- Luồng kích hoạt: `satarobo.vn/kich-hoat` → nhập SĐT → nhận OTP Zalo → đặt mật khẩu.
- Nút: Gửi lại OTP, Gửi ZNS báo cấp tài khoản, Xuất CSV.
- Ghi rõ chế độ mô phỏng: "ZNS ghi nhận ở chế độ MÔ PHỎNG (ZALO_LIVE chưa bật) — tin KHÔNG thực sự rời hệ thống".
- Hiển thị mã lỗi ZNS thật (vd template thiếu tham số) ngay trên dòng.

### /enrollments — Đăng ký học
- Trạng thái: Chờ xếp, Đã xếp, Đang học, Bảo lưu, Hoàn thành, Đã rút, Đã chuyển (mặc định lọc "Đang hoạt động").
- Tìm theo HS / SĐT PH / tên lớp / mã lớp; lọc lớp, cơ sở. Có nút **Nhắn riêng** (mở hội thoại với PH).

### /chuyen-lop — Chuyển lớp / chuyển cơ sở
- Ba bước: Cơ sở nguồn → học viên → lớp đích (hiển thị "còn N chỗ", số bài).
- Nếu hết chỗ: "Đã đưa vào danh sách chờ (chưa có lớp)".
- Tạo yêu cầu → "Chờ quản lý duyệt" → Duyệt / Từ chối (có lý do).

### /students/sap-het-khoa — Sắp hết khoá
- Điều kiện: học viên còn **≤ 5 buổi**, sắp xếp theo số buổi còn lại, để liên hệ tái tục.

### /hoan-thanh-khoa — Hoàn thành khoá & chứng chỉ
- Chọn học viên → khoá → lớp; nhập **Xếp loại cuối khoá** (Giỏi/Khá/Xuất sắc…) và **Đánh giá cuối khoá của GV*** (bắt buộc).
- Nút "Đánh dấu hoàn thành & sinh chứng chỉ"; hỗ trợ **hoàn thành nhiều học viên một lần**.
- Có luồng **đề xuất chờ duyệt** (GV đề xuất → quản lý duyệt/từ chối kèm lý do).

### /hoc-ba — Học bạ (chọn học viên → xem quá trình học tổng hợp + xuất PDF)
### /report-cards — Học bạ năng lực
- Luồng: chọn lớp → nhập học bạ từng học viên → nộp duyệt → phát hành; có **Cấu hình tiêu chí**.

### /satacoin — SataCoin
- Sổ cái điểm thưởng theo học viên; bật/tắt (Đang bật / Đã tắt); ghi giao dịch.

### /classes — Lớp học
- Trạng thái lớp: Đang lên KH, Tuyển sinh, Chờ duyệt (`PENDING_APPROVAL`), Đang dạy, Hoàn thành, Huỷ.
- Lọc: trạng thái, cơ sở, khoá học, giáo viên, tìm tự do.
- Mỗi lớp hiển thị `enrollmentCount`, `sessionCount`; mã lớp `CS1.SATA3.26.004`, tên lớp `sata3.08h-T7.CS1-201`.
- Nút: Thêm lớp, Import Excel, **Kiểm tra lịch buổi**.

### /classes/kiem-tra-lich — Kiểm tra lịch buổi
- Dò lớp có buổi 1 lệch so với (ngày khai giảng + lịch học); cột: Lớp · Vấn đề · Khai giảng · Buổi 1 hiện tại ·
  Buổi 1 đúng lịch · Buổi lệch · Xử lý; nút **Xếp lại** (bấm 2 lần).

### /sessions — Buổi học
- Phạm vi mặc định "Sắp tới"; hiển thị tối đa 200 buổi mới nhất; dữ liệu buổi:
  `id, date, topic, className, classId, attendanceCount`.

### /lich — Lịch tổng (lịch tháng, điều hướng ?y=&m=)

### /attendance — Điểm danh
- Danh sách lớp kèm `roster, totalSessions, heldSessions, doneSessions, pendingSessions`.
- Tình trạng buổi: Chưa hoàn tất · Sắp tới hôm nay · Chưa tới giờ · Đã hoàn tất · Lớp không còn học viên · Đã huỷ.
- Điểm danh: Có mặt / **Vắng** / **Muộn** / **Phép**; ghi "Lý do phụ huynh xin vắng"; đánh dấu **Không bù / Cần học bù**.
- **Chốt buổi** yêu cầu: điểm danh đủ lớp + nhận xét (báo "Còn thiếu: …").
- Nhận xét từng học viên; tìm buổi theo tiêu đề/ngày/số buổi.

### /media — Ảnh lớp học (2 tầng)
- GV tải ảnh vào **kho của lớp** (phụ huynh chưa thấy) → chọn ảnh, **gắn thẻ học viên** → Gửi duyệt.
- Ảnh có thể đánh dấu **ảnh chung cả lớp** (mọi phụ huynh trong lớp xem được).
- Tối đa 40 ảnh mỗi lô; có Ngày chụp, Chú thích; trạng thái: Trong kho (GV chưa gửi) / Chờ duyệt / Đã duyệt / Từ chối.
- Xoá ảnh khỏi kho: cảnh báo "phụ huynh cũng không còn thấy. Hành động không thể hoàn tác."

### /duyet-media — Duyệt ảnh
- Gom theo ngày, đánh dấu **Quá hạn duyệt**; xem ảnh theo buổi (Ảnh trước / Ảnh sau);
  Duyệt toàn bộ / Loại ảnh; ảnh đã loại **còn khôi phục trong 7 ngày**;
  có thể ghi nhận "Buổi này đã ghi nhận: không có ảnh".

### /hoc-bu — Học bù
- Trạng thái: Chờ xếp bù → Đã xếp bù → Đã bù xong; hiển thị "còn N chỗ" của lớp nhận bù;
  dữ liệu: `studentName, className, missedDate, missedLesson, status, makeupDate`.

## 3. Nhân sự, chấm công, đơn từ

### /nhan-su — Hồ sơ nhân sự
- Trường: `employeeCode, fullName, jobTitle, department, departmentId, avatarUrl, email, joinedAt, bio,
  isActive, isPublic, displayOrder, phone, dateOfBirth, gender, contractType, salaryRank, salaryLevel,
  endDate, bhxhBase, address, emergencyContact, notes`.
- Phòng ban: `BAN_GIAM_DOC, DAO_TAO, KINH_DOANH, HANH_CHANH_NHAN_SU, KE_TOAN, TUYEN_SINH, GIAO_VU, GIANG_DAY`.
- Thao tác: Đang làm / Đã nghỉ / Cho nghỉ, bật-tắt **hiển thị public** (trang giới thiệu web), Import Excel,
  "Đổi vai trò: bấm Sửa → nút Đổi vai trò", cảnh báo "Chưa có TK".

### /nhan-su/vi-tri — Vị trí công việc
- Triết lý: **"Quyền gắn theo vị trí, không gắn theo người"**.
- Vị trí: Tên vị trí*, Đơn vị trực thuộc*.
- Phân công: Kiểu **Chính / Kiêm nhiệm / Uỷ quyền**, Hiệu lực từ*, Đến ngày (trống = vô thời hạn),
  Ghi chú (số quyết định, lý do…); xem "Đang hiệu lực" hoặc "cả lịch sử".
- **Điều động** (tác nghiệp) tách riêng khỏi phân công.
- Vai trò hệ thống: `ASSISTANT_TEACHER, CENTER_ACCOUNTANT, CENTER_CLASS_MANAGER, CENTER_HR, CENTER_MANAGER,
  CENTER_SALES_CSM, HO_ACCOUNTANT, HO_HR, HO_MARKETING, HO_SALE, SALES_CSM, SUPER_ADMIN` + "Kiểm toán đào tạo (chỉ đọc)".

### Chấm công — điều hướng 8 mục
`Bảng công ngày (/cham-cong)` · `Lưới phân ca (/cham-cong/phan-ca)` · `Kỳ công & chốt (/cham-cong/ky-cong)` ·
`Nội quy & thống kê` · `Công dạy` · `Đơn từ (/don-tu)` · `Đối soát` · `Cấu hình` ·
thêm `Màn hình QR`, `Import lịch`, `Lịch ca của tôi (/cham-cong/lich-ca)`, `Điểm chấm công (/cham-cong/diem-cham)`,
`Danh mục mã ca (/cham-cong/danh-muc-ca)`.

**Nguyên tắc: "Công đếm theo lịch đã xếp; lượt quét chỉ sinh cờ để quản lý rà."**

- **Bộ cờ đầy đủ**: Không có lượt · Thiếu lượt ra · Ra không có vào · Thiếu buổi sáng · Thiếu buổi chiều ·
  Về sớm · Thiếu giờ · Đến sát giờ · Ngoài vùng · Thiếu GPS · Chưa toạ độ · Sai nơi làm · Chấm ngoài lịch ·
  Bấm trùng · Vượt trần lượt · Làm ngày lễ · GPS kém · Chỉnh tay (đơn duyệt) · Nghỉ tuần.
  Enum thấy được: `THIEU_GIO`, `THIEU_LUOT_RA`.
- **Kết luận của quản lý** cho từng ngày có cờ: "Đã ghi nhận nghỉ không phép" / "Đã ghi nhận có lý do" /
  "Vắng có lý do" / "Đã gỡ kết luận" / **ghi đè công** ("Đã ghi đè công" / "Đã bỏ ghi đè").
- Ghi thêm mốc giờ: "lượt quét gốc giữ nguyên, công ngày sẽ được tính lại". Nguồn mốc: máy quét / qua đơn / sửa tay.

#### Mã ca (/cham-cong/danh-muc-ca)
- Model: `code, name, kind, segments[], defaultPlace, attendanceMode, dayCredit, isLeave, nominalMinutes,
  payMode, note, isActive, centerId`.
- Loại ca: Ca gãy · Ca suốt · Ca cuối tuần · Ca gãy dài · Giờ hành chính · Công tác ngoài ·
  Ca sáng / chiều / tối và các tổ hợp.
- `attendanceMode`: `TIMED` (quét giờ) · `LOCATION_ONLY` · `ADMIN_HOURS` · `ANY_CENTER`.
- `payMode`: `PAID_BREAK` (nghỉ giữa giờ vẫn tính công, vd 16:30–17:00).
- Nơi làm: "Nơi làm theo phân công (HO)", "Sáng CS1 · Chiều CS2", "Cả 2 cơ sở", "Tại <cơ sở>".
- **Quy tắc vàng**: "Đổi giờ/số công chỉ áp cho ô xếp SAU khi lưu — lịch đã xếp giữ nguyên."
- Mã dùng chung cần quyền cấu hình tại Hội sở mới sửa; cơ sở chỉ tạo được mã riêng của mình.

#### Lưới phân ca (/cham-cong/phan-ca)
- Sinh lưới tháng từ **khung ca tuần**; có **chạy thử (dry-run) → ghi thật**.
- Kết quả đối chiếu 8 nhóm ô: Ô mới · Ô đổi mã · Ô giữ nguyên · Ô bị xoá · **Ô được bảo vệ** (sửa tay / đơn đã duyệt /
  file import) · **Ô chừa lại** (ngày đã qua và hôm nay — lưới chỉ áp từ NGÀY MAI) · Ô ngoài quyền · **Mã lạ**.
- Import Sheet; ngày lễ/ngày nghỉ hiển thị trên lưới (`off`, `holiday`, `today`).

#### Điểm chấm công (/cham-cong/diem-cham)
- Model: `code, name, latitude, longitude, radiusMeters, qrKeyVersion, geofenceEnabled, isActive`.
- Mỗi cơ sở một quầy treo màn hình QR; in mã QR (có "đời khoá v…").
- **Từ 07/09: bật geofence + đã khai toạ độ ⇒ quét ngoài phạm vi bị TỪ CHỐI** (không chỉ gắn cờ);
  người bị chặn nhầm nộp **đơn chỉnh công**. Hội sở không có điểm chấm công → quét ở quầy bất kỳ cơ sở nào.

#### Kỳ công & chốt (/cham-cong/ky-cong)
- Trạng thái kỳ: Chưa mở kỳ · Đang mở (`OPEN`) · Đang chốt · Đã chốt · Đã mở lại.
- Chỉ số: tổng công cả kỳ (`units`), số người, `flaggedDays`, `notComputedDays`, `standardUnits` (mặc định 24),
  `periodEnded`.
- Chốt kỳ: "Chốt xong, số công của kỳ này không đổi được từ màn nào nữa"; có ô "Vì sao chưa chốt được"
  (kỳ chưa kết thúc…). **Mở lại kỳ bắt buộc ghi lý do**, số đã chốt vẫn nằm trong nhật ký, chốt lại ghi bản mới.
- Nút: Tính lại · Xuất Excel (bản tạm) · Ghi chú công chuẩn · xem "ngày bị ghi đè" / "ngày có cờ" của từng người.
- Người chốt: "Kế toán cơ sở hoặc Kế toán Hội sở".

#### Đơn từ (/don-tu)
- Model dòng: `status, statusLabel, kindLabel, requesterName, centerCode, applyLabel, applyTitle, timeLabel,
  dueLabel, dueTone, effectText, effectTone, effectCode, effectBlocked, effectHint, ageLabel, stale,
  submittedLate, applyError, applied, subject, reason`.
- "Đơn của nhân sự gửi tới **cơ sở chịu công**. Duyệt là áp ngay lên lịch và công."
- Nếu áp không được (lớp đã điểm danh, kỳ công đã khoá…) → **đơn tự quay lại chờ duyệt**.
- Duyệt: ghi chú tuỳ chọn (người nộp đọc được). Từ chối: **lý do bắt buộc**, người nộp đọc nguyên văn.
- Nhãn: "Nộp muộn", "Đã áp lên lịch". Trang cá nhân: "Đơn của tôi", "Lịch ca của tôi" (+ Tổng công tạm tính).

## 4. Tài chính

### /orders + chi tiết đơn
- Loại đơn: Khoá học · Gói combo · Kỳ thi · Sản phẩm. Mã đơn `ORD-YYMMDD-NNNNNN`.
- Kế hoạch thanh toán: **cọc + N đợt**, mỗi đợt có `dueDate`; "Thiết lập kế hoạch" / "Sửa kế hoạch";
  đánh dấu đã đóng từng đợt.
- Trạng thái tiền của đơn: Chưa đóng · Đang đóng · Chờ kế toán đối soát · Kế toán đã đối soát ·
  **Đơn 0đ — chưa có học phí** · **Khách chuyển nhiều hơn tổng đơn** · "Sale đã thu, kế toán chưa đối soát".
- Cảnh báo dữ liệu: "đơn ghi tên con của gia đình khác", "tiền đã về nhưng chưa gắn học viên"
  (không chặn thao tác, sửa ở màn Thanh toán).
- **QR chuyển khoản** cho số tiền đang phải đóng, có hạn dùng ("QR đã hết hạn", "Đang dùng lại mã QR còn hiệu lực").
- **Người mua trên hoá đơn**: Họ tên, Địa chỉ, MST (ghi tên đơn vị thì bắt buộc có MST).
- Chống ghi đè: "Người khác vừa sửa đơn này — tải lại trang rồi thử lại".

### /payments — Thanh toán
- Model dòng: `amount, method, paidDate, updatedAt, saleStatus, accountantStatus, paymentType, hienTai,
  soLanDieuChinh, orderId, orderCode, customerName, studentName, className, enrollmentId, collectedByName,
  leadSource, parentName, parentNationalId, address, piiMasked, receiptCode, hasActiveReceipt`.
- Quyền tách: `canRecord` (sale ghi nhận) · `canConfirm` (kế toán xác nhận) · `canAdjust` (điều chỉnh) ·
  `canViewPii` ("Mở xem đầy đủ cần lý do và sẽ được ghi log").
- Xử lý khoản bị bỏ: gắn lớp cho khoản ("Em chưa có ghi danh nào — chọn lớp"), rồi xác nhận cả lượt.
- Trạng thái: Đang chờ kế toán · Sẽ xác nhận · Vào doanh thu · Bỏ qua · **Chờ convert** (học phí nhập từ Excel).
- Chống ghi đè: "Người khác vừa sửa khoản này. Đang tải lại…".

### /cong-no — Công nợ
- Dòng theo **ghi danh**: `enrollmentId, hocVien, khoa, hocPhi, daGhiNhan, daXacNhan, chuaChotGia`.
- Nhãn: Chưa chốt học phí · Chưa đóng đồng nào · Còn thiếu · **Đủ tiền — chờ kế toán xác nhận** · Đã đóng đủ · Thu vượt.
- Hai cột thiếu: **"Thiếu — PH đang thấy"** (theo khoản đã xác nhận, đúng số cổng phụ huynh hiển thị) và **"Thiếu thật"**.
- Tuổi nợ: Chưa quá hạn · Quá hạn 1–7 ngày · 8–30 ngày · >30 ngày (tính theo **đợt thanh toán có hạn**).
- Sửa học phí hợp đồng ngay trên dòng.

### /thieu-hoc-phi — Thiếu học phí
- Lead đã chốt nhưng **chưa có đơn** (`CHUA_CO_DON`) hoặc **chưa thu đủ** (`THU_MOT_PHAN`); giải thích rõ nguồn gốc:
  "đến từ các lượt chốt hàng loạt không nhập số tiền — hệ thống cố ý không bịa khoản thu".
- Form "Ghi học phí" tạo **đơn đã xác nhận + khoản thu mang dấu nhập liệu ban đầu**:
  - Nội dung dòng đơn: Khoá học (ghi danh lớp) · Gói khoá học · Lệ phí thi · Học cụ / sản phẩm.
  - Chính sách giảm giá: Không giảm · Giảm theo % · Giảm số tiền · Ưu đãi chương trình (số tiền) · Học bổng (%).
  - Giá niêm yết (trước giảm), Mức giảm, **Lý do giảm giá**, Ngày đóng, Tiền ĐÃ THU, Ghi chú, Tổng phải đóng.

### /bien-dong-so-du — Đối soát ngân hàng
- Giao dịch: `at, provider, providerTxnId, amount, content, referenceCode, accountNumber, status,
  unmatchedNote, allocations`.
- Nhật ký webhook: `action (MATCH_TXN / MANUAL_REVIEW), status, error, gateway, orderCode, txnStatus`.
- Thao tác: **Rót vào đơn** → chia cho từng con → Khớp đủ / Đang thừa → **+ Tạo đợt** cho phần dư → Ghi phân bổ;
  gỡ phân bổ có xác nhận; "Xác nhận bỏ qua" cho giao dịch không liên quan.
- Tab: Cần xử lý (N) · Đã khớp · Tất cả.

### /hoan-tien — Hoàn tiền
- Công thức hiển thị ngay trên trang: **Đề xuất = Σ đã thu − số buổi đã học × đơn giá**.
- Trạng thái: Chờ duyệt · Đã duyệt · Từ chối · Đã chi. Từ chối cần lý do ≥5 ký tự.
- Có "Sổ buổi" / "Chốt sổ buổi"; đánh dấu ca "đã học hết khoá, không phải hoàn"; "N ca chưa tính được".

### /nhap-giao-dich-cu — Nhập giao dịch cũ
- Đọc .xlsx nhiều sheet (mỗi sheet = tháng × cơ sở); cột: mã hv, họ và tên học viên, tình trạng, ngày,
  khoá học đăng ký, cơ sở, ghi chú, giao dịch, tiền.
- **Khớp theo SĐT phụ huynh + họ tên** (mã học viên trong file khác hệ mã hệ thống).
- Chống cộng đôi: "Đã có tiền — bỏ qua", "Bỏ — trùng sheet khác"; "Sẽ ghi chồng — bấm để huỷ".
- Em không tìm thấy hồ sơ cùng SĐT thì **không ghi tự động**, phải bấm từng dòng; "Chưa gán sale" phải gán.
- Mỗi em một đơn + một khoản cho mỗi đợt, **giữ đúng ngày đóng**.

### /crm/commission + cấu hình hoa hồng
- Bảng hoa hồng theo kỳ, trạng thái `DRAFT` → … ; "Mở lại".
- **Máy chính sách hoa hồng** (trong Cấu hình vận hành), khai theo 4 trục:
  1. *Chi khi nào* — sự kiện: `HOC_VIEN_MOI` (HV mới đóng học phí và kế toán xác nhận) · `TAI_TUC` ·
     `CHUYEN_TRUNG_TAM` (chi MỘT LẦN cho nhân sự trung tâm cũ) · `BAN_THIET_BI` (theo số bộ) ·
     `MOI_NHAN_SU` · `THUONG_DANH_HIEU_TVV` · `THUONG_DANH_HIEU_QUAN_LY`.
  2. *Cho loại đơn nào* — `TAT_CA` / đơn khoá học / đơn sản phẩm.
  3. *Tính thế nào* — `PHAN_TRAM` (% trên số tiền thực thu) · `SO_TIEN_CO_DINH` · `THUONG_THEO_BAC` (bảng bậc).
  4. *Ai nhận bao nhiêu* — theo 16 vai; mỗi vai một tỉ lệ/mức; **trần tổng tỉ lệ 9%**.
- Mỗi chính sách có `ma, ten, suKien, loaiDon, kieuTinh, khoan, nguon (văn bản: "SR.QD.208 · PL04 Điều 1…"),
  ghiChu, bat, bac[]`; sửa **bắt buộc ghi lý do**; "Nạp lại bộ theo công văn"; dòng hoa hồng đã sinh trước đó không đổi.

### Phương thức thanh toán (trong Cấu hình vận hành)
- Model: `code, name, type (Tiền mặt / Chuyển khoản / Ví điện tử / COD), image, description,
  canBuyCourse, canBuyPackage, canBuyExam, canBuyProduct, canDeposit, bankBin, bankName, bankBranch,
  bankAccountNumber, bankAccountName, gatewayConfig, displayOrder, isActive, centerId, orgUnitId`.
- Cơ sở áp dụng bắt buộc; "Dùng chung (mọi cơ sở)"; vô hiệu hoá / kích hoạt có xác nhận.

## 5. Hệ thống & cấu hình

### /cau-hinh-van-hanh — 13 tab, **mọi lần lưu bắt buộc ghi lý do**
- Tab thấy được: Thông báo đẩy · Tin Zalo · (phương thức thanh toán) · (hoa hồng) · …
- **Danh mục thông báo 38 loại**: `{prefix, label, groupKey, groupLabel, priority, recipients}`;
  mức ưu tiên: Khẩn · Thường · Tham khảo; chọn loại nào được đẩy ("Không loại nào được đẩy" là hợp lệ).
  Ví dụ prefix: `trial.cho-phan-cong-gap`, `trial-session.assigned`, `class.session_changed`,
  `trial-enroll.assigned`, `session.substitute`, `trial.reminder-gv`, `request.submitted`, `class.cancelled`,
  `trial.evaluated`, `request.decided`, `trial.assigned`, `shift.brief`, `lead.moi`.
- Danh sách **giáo viên luôn hiện** (miễn lọc) — đổi phải ghi lý do.
- Tin Zalo: bật/tắt từng loại (sinh nhật, cấp tài khoản…), "Gửi tin Zalo thật" (ZALO_LIVE).
- Chống spam nhập liệu: "Nhập sai tối đa … trong khoảng thời gian …" (áp cho màn Nhập khách hàng),
  "Phân công rồi mà chưa liên hệ khách quá …".
- Cờ chuyển đổi: "Chuyển cách phân chia dữ liệu sang sơ đồ tổ chức mới".

### /to-chuc — Cây tổ chức
- Loại đơn vị: Gốc hệ thống · Hội sở · Khối vùng · Phòng ban · **Điểm dạy** · Đối tác · Nhượng quyền (loại cũ).
- `relationshipType`: Sở hữu · Nhượng quyền · Liên kết. Chỉ đơn vị **Đang hoạt động** được tính khi xét quyền.
- Model: `code, name, type, parentId, path, address, relationshipType, status, legalEntityId`;
  pháp nhân: `legalName, taxCode`.
- Quy tắc: mã và loại đơn vị **không đổi được sau khi tạo**; đổi đơn vị cha **tính lại path cả nhánh con**
  và path quyết định ai thấy dữ liệu cơ sở nào; đơn vị còn con đang hoạt động thì không xoá.

### /roles, /user-groups, /users
- RBAC động: role có Mã · Tên · Loại (Hệ thống / …) · Số quyền · Người dùng; **mọi thay đổi yêu cầu lý do và ghi nhật ký**.
- **Nhóm người dùng**: "Cấp quyền cho một nhóm người mà không sửa vai trò".
- Tài khoản: chỉ SUPER_ADMIN quản lý; disable / kích hoạt / xoá vĩnh viễn (bấm 2 lần); cột "Đăng nhập cuối".

### /audit-log
- PII che mặc định (`09***67`, `a***@x.com`); "Xem đầy đủ" = **break-glass có ghi log**;
  lọc theo actor (127 người), module, ngày; có "Xem lịch sử cũ (đọc-only)"; `canCleanup`.

### /compliance — Tuân thủ NĐ13
- Học viên đã nghỉ & quá hạn lưu trữ (N năm) → rà soát **xoá ẩn danh**; DSAR & xoá ẩn danh chỉ SUPER_ADMIN.

### /tich-hop — Tích hợp ngoài
- Adapter: Rate limit (Upstash Redis) · Zalo OA/ZNS (ZALO_APP_ID + ZALO_OA_ACCESS_TOKEN, ZALO_LIVE) ·
  MISA AMIS (kế toán, MISA_CLIENT_ID/SECRET/API_URL) — thiếu credential thì **fallback an toàn**, có nút "Gửi thử",
  bảng log gửi gần nhất kèm mã lỗi nhà cung cấp.

### /thong-bao — Trung tâm thông báo
- Thông báo dạng **việc cần làm** (`action_required`), ví dụ:
  "N giao dịch (X đ) chưa rót được vào phiếu thu nào — cần đối soát tay",
  "Thiếu báo cáo marketing tháng YYYY-MM — đã quá ngày 05",
  "Chi phí marketing kỳ YYYY-MM chưa CONFIRMED".

### /email-templates, /email-logs, /otp-logs
- Mẫu email có mã: `ORDER_CONFIRMATION, PAYMENT_RECEIPT(_VI)`, xác nhận thôi học, báo cáo tiến độ học tập,
  nhắc gia hạn (14 ngày trước), nhắc lịch học (24h trước), thông báo bảo lưu, thông báo lead mới (nội bộ);
  gửi tự động + **Gửi thủ công**.
- Email logs: Chờ gửi · Đã gửi · Thất bại · **Bị bounce**.
- OTP logs: mục đích Kích hoạt / Quên mật khẩu / `CHANGE_CONTACT`; thẻ số:
  **Tin đã gửi hôm nay · Ngưỡng tự ngắt · Chi phí ZNS hôm nay (ước) · ZNS lỗi người nhận hôm nay**.

## 6. Những màn hình bản gốc có mà hệ mới CHƯA có

| Đường dẫn gốc | Nội dung | Ghi chú |
|---|---|---|
| `/class-groups` | **Nhóm lớp (lớp cố định)** — nhóm học sinh đi cùng nhau qua nhiều khoá/năm (Sata3 → 4 → 5) | ẩn sau cờ `classGroupEnabled`; lớp có `classGroupId` |
| `/evaluations` | **Đánh giá & Khảo sát v2** — trình dựng phiếu (chấm sao, radio, checkbox, văn bản, tải ảnh), 3 loại phiếu (Đánh giá GV / Khảo sát cơ sở / Đánh giá buổi học), nhóm tiêu chí, đợt mở–đóng–lưu trữ | ẩn sau cờ `evalV2Enabled`; thay dần NPS cũ |
| `/thong-bao` | Trung tâm thông báo toàn hệ thống, có loại `action_required` | hệ mới có chuông nhưng chưa có trang tổng |
| `/cham-cong/ky-cong` | Kỳ công & chốt (đóng/mở lại kỳ, xuất Excel bản tạm) | hệ mới có chốt kỳ nhưng chưa có trang riêng đủ chỉ số |
| `/cham-cong/lich-ca` | Lịch ca của tôi + tổng công tạm tính | |
| `/cham-cong/diem-cham` | Điểm chấm công (toạ độ, bán kính, đời khoá QR, geofence chặn) | |
| `/sale/trial`, `/sale/nhap-khach-hang` | Màn rút gọn cho sale | |
| `/search` | Trang kết quả tìm kiếm | hệ mới có Ctrl+K nhưng chưa có trang |
| `/students/<id>/edit` | Bản gốc **không có** trang chi tiết học viên, chỉ có trang sửa | hệ mới làm hơn |
