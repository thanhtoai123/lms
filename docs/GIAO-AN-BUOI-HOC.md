# Giáo án của từng buổi học (trang `/scorm`)

Trang này trả lời đúng một câu hỏi của người vận hành: **buổi học này chiếu cái gì?**

## 1. Quy tắc nghiệp vụ

- Mỗi **buổi học** (lesson của khung chương trình) giữ **đúng một giáo án đang dùng**.
- Giáo án là **slide `.pdf`** (tối đa 100MB) hoặc **gói SCORM `.zip`** (tối đa 200MB, có `imsmanifest.xml`,
  SCORM 1.2 / 2004). Cả hai chiếu trong **cùng một khung xem**, nên giáo viên chỉ phải quen một màn hình.
- Đẩy bản mới **thay bản cũ SAU KHI xử lý xong**. Không bao giờ có khoảnh khắc buổi dạy trống giáo án
  vì một gói hỏng.
- Bản liền trước **vẫn được giữ** để "Dùng lại bản cũ" một chạm; các bản cũ hơn bị xoá cho đỡ tốn ổ đĩa.

## 2. Vòng đời một bản tải lên

| Trạng thái | Nghĩa | Màn hình hiện gì |
|---|---|---|
| `processing` | Đang ghi tệp / giải nén gói | "Đang xử lý — mở lại trang sau ít phút" |
| `processing` quá **15 phút** | Tiến trình đã chết (máy chủ khởi động lại, hết bộ nhớ) | "Kẹt xử lý" + nút **Dọn bản lỗi** |
| `failed` | Gói sai chuẩn / chứa tệp cấm / thiếu trang khởi chạy | Câu lỗi cụ thể + nút **Dọn bản lỗi** |
| `ready` | Đang dùng | Thẻ xanh "Đang dùng" + **Xem thử** |

Ngưỡng 15 phút nằm ở `packages/core/src/content/lessonPlan.ts` (`PLAN_STUCK_MINUTES`) và được
`worker` quét định kỳ (`sweepStuckPlanVersions`), nên trạng thái đúng kể cả khi không ai mở trang.

## 3. Luồng dữ liệu

```
/scorm (chọn khoá → buổi)
  → content.planCourses / planLessons / plan        (đọc)
  → POST /api/content/giao-an  (multipart, tệp tới 200MB)  → uploadPlan
  → content.planCleanFailed / planRemove / planRestore     (một chạm)
/scorm/buoi/<lessonId>  → khung xem (SCORM: trình chạy; PDF: iframe) + chữ mờ tên người xem
```

Giáo án lưu như một `documents` có `category = lesson_plan` + `lessonId`, nên dùng chung kho tài liệu,
phiên bản, nhật ký mở/tải và trình chạy SCORM sẵn có (`packages/api/src/services/lessonPlans.ts`).

## 4. Khác gì bản gốc `admin.satarobo.vn/scorm`

Giữ nguyên cách làm việc (chọn khoá → buổi, một giáo án mỗi buổi, đẩy bản mới tự thay, dọn bản kẹt),
thêm bốn điểm:

1. **Độ phủ cả khoá**: "đã có giáo án 12/48 buổi (25%)" + nút **Tới buổi chưa có giáo án** — không phải
   mở từng buổi để biết còn thiếu chỗ nào.
2. **Dùng lại bản trước** một chạm khi bản mới sai nội dung.
3. **Thanh phần trăm khi tải**: gói vài chục MB không còn làm người dùng tưởng máy treo rồi bấm lại
   (mỗi lần bấm lại là một bản kẹt).
4. **Chọn nằm trên URL** (`/scorm?khoa=…&buoi=…`): dán link cho đồng nghiệp là mở đúng buổi đó.

Giữ như bản gốc: chữ mờ (tên người xem + giờ) đè lên khung chiếu để truy nguồn ảnh chụp màn hình.

## 5. Bảo vệ học liệu (nói thẳng làm được gì, không làm được gì)

**Không trình duyệt nào chặn được quay màn hình hay chụp bằng điện thoại.** Mọi hệ thống, kể cả DRM
của các nền tảng phim, chỉ nâng chi phí sao chép. Vì vậy hệ thống làm bốn lớp, lớp cuối mới là lớp thật:

| Lớp | Làm gì | Chặn được gì |
|---|---|---|
| Không giao tệp gốc | Slide phát qua `/api/content/giao-an/<buổi>/tep`, gắn **phiên đăng nhập**, `no-store`, không có nút tải | Gửi link cho người ngoài → mở không được; không còn bản sao nằm trong máy sau khi đóng phiên |
| Slide vẽ ra `<canvas>` | Không dùng trình xem PDF của trình duyệt: **không còn thanh công cụ đen** kèm nút tải / in / mở tab mới, **không có lớp text để bôi–chép**, và chữ mờ vẽ thẳng vào ảnh trang (xoá phần tử không bóc ra được) | Mọi cách sao chép "một cú nhấp" |
| Rào thao tác dễ | Tắt chuột phải, kéo–thả, chọn–chép, `Ctrl+P` / `Ctrl+S`, in ra giấy / "Print to PDF" (CSS `@media print`), cắm rào tương tự vào **từng trang HTML trong gói SCORM** | Cách sao chép mà 9/10 người sẽ thử đầu tiên |
| Truy nguồn | Chữ mờ **3 dòng** vẽ thẳng vào ảnh trang (SCORM thì phủ ngoài vì nội dung nằm trong tài liệu con), mang **tên + liên hệ đã che + giờ chạy theo giây** của chính người đang xem; **che màn ~1,5 giây** đúng lúc có dấu hiệu chụp (PrintScreen, Win+Shift+S, Ctrl+P/S, DevTools) | Ảnh/clip lọt ra ngoài là biết của ai, lúc nào; ảnh chụp bằng phím tắt dễ dính màn che |
| Ghi nhật ký | Mỗi lượt mở và mỗi thao tác nghi vấn (in, PrintScreen, chuột phải, DevTools, Ctrl+S) vào `document_access_logs`; trang `/scorm` có mục **"Nhật ký xem & nghi vấn sao chép (30 ngày)"** kèm mức cảnh báo theo người | Đây là lớp bảo vệ THẬT: người dùng biết mình để lại dấu vết, quản trị có bằng chứng để xử lý theo quy định nội bộ |

Ngưỡng cảnh báo: ≥ 3 lần/30 ngày = "nên để ý", ≥ 10 lần = "bất thường, cần hỏi lại người dùng"
(`captureRisk` trong `packages/core/src/content/protect.ts`).

Điều hệ thống **không** hứa: chặn điện thoại quay màn hình, chặn phần mềm quay (OBS, Bandicam…), chặn
máy ảnh chụp màn chiếu, và **không có cách nào biết máy đang bị quay** — trình duyệt không có API đó.

### Lớp chặn thật: ứng dụng "Trình chiếu an toàn" (`tools/trinh-chieu/`)

Vì sao trình duyệt không đủ, nói bằng cơ chế chứ không bằng cảm tính:

- Phần mềm quay (OBS, Bandicam, Teams, Zoom, Meet) lấy hình từ **bộ đệm màn hình của hệ điều hành**,
  không đi qua trang web — trang không có API nào để biết mình đang bị quay.
- `PrintScreen` và `Win+Shift+S` bị **Windows nuốt trước**, trình duyệt thường không nhận được phím,
  nên mã "chặn PrintScreen" của trang có khi không chạy lần nào. Đó đúng là điều người dùng gặp:
  vẫn chụp và quay được bình thường.

Chặn thật chỉ có ở mức hệ điều hành — `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (Windows 10
2004+) và `NSWindow.sharingType = none` (macOS). Cả hai gói trong một lệnh Electron:
`win.setContentProtection(true)`. Ứng dụng nhỏ ở `tools/trinh-chieu/` bật đúng cờ đó, nạp thẳng
`/scorm/buoi/<buổi>`, giữ phiên đăng nhập, khoá tải tệp, khoá DevTools và mọi quyền camera/mic/ghi màn hình.

| | Mở bằng trình duyệt | Mở bằng Trình chiếu an toàn |
|---|---|---|
| Phần mềm quay màn hình, chia sẻ màn hình Teams/Zoom | Thu được nội dung | **Chỉ thu được màn đen** |
| Công cụ chụp của Windows (`Win+Shift+S`, PrintScreen) | Chụp được | **Chỉ ra màn đen** |
| Máy chiếu nối dây HDMI | Chiếu bình thường | Chiếu bình thường |
| Điện thoại chụp màn chiếu, thiết bị bắt HDMI | Không chặn được | Không chặn được |
| Chữ mờ + nhật ký truy nguồn | Có | Có |

Cài trên máy dạy: `cd tools\trinh-chieu` → `npm install` → `npm start` (xem `tools/trinh-chieu/README.md`;
thư mục này nằm NGOÀI workspace pnpm nên `pnpm install` của dự án không tải Electron). Sửa `baseUrl`
trong `cau-hinh.json` khi chạy trên máy chủ thật; đóng gói `.exe` portable bằng `npm run dong-goi`.

Đã đo trên máy dạy: bật `setContentProtection` **một lần** lúc tạo cửa sổ thì
`GetWindowDisplayAffinity` vẫn trả `0x0` (không bảo vệ gì cả); phải bật lại ở mọi mốc đổi trạng thái
cửa sổ mới ra `0x11` = `WDA_EXCLUDEFROMCAPTURE`, và lúc đó ảnh chụp bằng `Graphics.CopyFromScreen`
(đúng API phần mềm chụp dùng) **không còn thấy cửa sổ**. Chi tiết trong `tools/trinh-chieu/README.md`.

Ứng dụng còn **canh gác tiến trình**: thấy phần mềm quay/chụp đang chạy (OBS, Bandicam, Camtasia,
ShareX…) hoặc máy đang ở phiên điều khiển từ xa thì **ẩn hẳn bài giảng**, hiện lời nhắc và ghi nhật ký;
tắt phần mềm đó thì bài tự hiện lại. Danh sách chặn sửa trong `tools/trinh-chieu/cau-hinh.json`.

Khung xem **không còn dòng chữ cảnh báo nào** (giáo viên đọc một lần là đủ, để mãi trên màn chiếu chỉ
tổ vướng). Thay bằng một **chấm tròn nhỏ ở góc dưới phải**: xanh = đang trong ứng dụng bảo vệ, vàng =
đang ở trình duyệt (rê chuột vào để đọc giải thích). Phân tích đầy đủ các mức bảo vệ:
`docs/CHONG-CHUP-MAN-HINH.md`.

**KHÔNG làm mờ liên tục.** Bản đầu làm mờ mỗi khi cửa sổ mất tiêu điểm nên không chiếu bài được —
đã bỏ. Nay chỉ che đúng khoảnh khắc có dấu hiệu chụp rồi trả lại màn hình ngay, và chữ mờ rút còn
3 dòng để nhìn bài không bị nhiễu.

## 6. Trình chiếu

Khung chiếm gần hết cửa sổ, **không có thanh công cụ ngang nào ở trên**. Nút **Trình chiếu toàn màn hình**
nổi ở góc phải (phím tắt `F`, thoát bằng `Esc`): máy tính hiện khi rê chuột, máy tính bảng / điện thoại luôn hiện mờ.
Slide PDF cuộn liên tục từng trang; gói SCORM chạy trong trình chạy SCORM — cùng một khung.

## 7. Phía giáo viên

Giáo viên mở giáo án ngay từ buổi dạy: thẻ nổi bật đầu trang **Hôm nay**, nút **Giáo án** trên mọi thẻ buổi
(Hôm nay, Lịch dạy), nút **Mở giáo án** ở màn buổi dạy và màn Chuẩn bị, và **Lớp của tôi → Giáo án của tôi**
(khoá mình dạy → từng buổi, trạng thái mở / khoá). Khung chiếu của giáo viên: `/teacher/giao-an/<bài>?buoi=<buổi>`
(có buổi trước / sau, nút Điểm danh buổi này). `/scorm` và `/scorm/buoi/<bài>` tự chuyển giáo viên sang đó.
Mọi lượt mở đều ghi `document_access_logs`.

## 8. Xem giáo án theo ca dạy — xin xem ngoài ca

**Luật** (thuần, có kiểm thử: `packages/core/src/content/planAccess.ts`). Giáo viên — người chỉ có
`document:read_own` — xem giáo án của một bài khi và chỉ khi:

| Điều kiện | Chi tiết |
|---|---|
| Đang trong ca dạy bài đó | Có buổi **hôm nay** gắn đúng bài (`sessions.lesson_id`), của lớp mình: mình dạy buổi đó (kể cả dạy thay), là trợ giảng của lớp, hoặc buổi chưa gán người và mình là GV chính. GV chính **không** mở được khi buổi đã giao người khác dạy thay. Khung mở: **30 phút trước giờ vào lớp → 15 phút sau giờ tan** (giờ Việt Nam). Buổi huỷ / dời không mở. |
| Có yêu cầu đã duyệt còn hạn | Giáo viên gửi yêu cầu kèm lý do (10–300 ký tự) → **Quản lý cơ sở** (quyền `plan_access:approve`) duyệt → xem **đúng bài đó trong 2 giờ kể từ lúc duyệt**. Hạn do máy chủ tính, không nhận từ máy khách. |

Người đọc toàn kho (`document:read` đầy đủ: Đào tạo, quản lý, giáo vụ, kiểm soát) không bị giới hạn.

**Quy tắc yêu cầu:** mỗi (người, bài) chỉ một yêu cầu chờ (chỉ mục duy nhất); tối đa 3 yêu cầu chờ / người;
chờ quá 24 giờ tự hết hiệu lực; không ai tự duyệt yêu cầu của mình (quản lý kiêm dạy phải nhờ người khác);
từ chối bắt buộc ghi lý do; quản lý **thu hồi sớm** được quyền còn hạn. Người duyệt nhận thông báo
(`plan_access.requested`) và thấy nhóm **Xin xem giáo án ngoài ca dạy** ở *Việc hôm nay*; giáo viên nhận
kết quả (`plan_access.decided`). Mọi thao tác ghi `audit_log` (bảng `lesson_plan_access_requests`).

**Chặn ở máy chủ, trên MỌI đường phát nội dung** (`packages/api/src/services/planAccess.ts → assertPlanAccess`):

| Đường | Chặn thế nào |
|---|---|
| `content.plan` (khung chiếu) | Khi khoá: **không trả mã tài liệu / đường phát**, chỉ loại giáo án + trạng thái quyền |
| `content.planOpen`, `/api/content/giao-an/<bài>/tep` (slide PDF) | 403 khi khoá |
| Kho tài liệu / SCORM: `content.document`, `openDocument`, `scormLaunch`, `scormCommit` | `loadDocForRead` chặn tài liệu nhóm `lesson_plan` |
| URL ký của gói SCORM | Hạn vé cắt đúng bằng thời gian còn được xem (không còn 4 giờ cố định) |
| Trình duyệt | Đếm ngược trên khung; hết giờ tự tải lại → máy chủ khoá, khung chiếu biến mất |

Đã kiểm trên máy thật (tài khoản mẫu): giáo viên ngoài ca → 403 ở cả 4 đường API, `content.plan` không lộ mã
tài liệu; gửi yêu cầu → quản lý duyệt → mở được, vé SCORM hạn đúng 120 phút; thu hồi → 403 ngay; giáo viên
mở `/duyet-xem-giao-an` → "Chưa có quyền".

Triển khai: `pnpm db:push` (tạo bảng) → `pnpm db:apply-sql` (`sql/0019_xin_xem_giao_an.sql`: trigger điền
tenant, chính sách RLS — chỉ bật RLS nếu hệ thống đã bật).

## 9. Quyền

- Xem: `document:read` (đầy đủ) — không giới hạn; `document:read_own` (giáo viên) — theo mục 8.
- Duyệt xem ngoài ca: `plan_access:approve` (Quản lý cơ sở; cấp thêm cho người khác bằng nhóm người dùng).
- Đẩy / gỡ / dọn / dùng lại: `document:update`.
- Trang tự kiểm quyền; menu cũng ẩn mục với vai trò không có quyền (xem `docs/KIEN-TRUC-MENU.md`).
