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
| Rào thao tác dễ | Tắt chuột phải, kéo–thả, chọn–chép, `Ctrl+P` / `Ctrl+S`, in ra giấy / "Print to PDF" (CSS `@media print`), cắm rào tương tự vào **từng trang HTML trong gói SCORM** | Cách sao chép mà 9/10 người sẽ thử đầu tiên |
| Truy nguồn | Chữ mờ rải 8 vị trí, mang **tên + liên hệ đã che + giờ chạy theo giây** của chính người đang xem; nội dung **mờ đi khi cửa sổ mất tiêu điểm** | Ảnh/clip lọt ra ngoài là biết của ai, lúc nào; công cụ chụp nền chỉ chụp được màn mờ |
| Ghi nhật ký | Mỗi lượt mở và mỗi thao tác nghi vấn (in, PrintScreen, chuột phải, DevTools, Ctrl+S) vào `document_access_logs`; trang `/scorm` có mục **"Nhật ký xem & nghi vấn sao chép (30 ngày)"** kèm mức cảnh báo theo người | Đây là lớp bảo vệ THẬT: người dùng biết mình để lại dấu vết, quản trị có bằng chứng để xử lý theo quy định nội bộ |

Ngưỡng cảnh báo: ≥ 3 lần/30 ngày = "nên để ý", ≥ 10 lần = "bất thường, cần hỏi lại người dùng"
(`captureRisk` trong `packages/core/src/content/protect.ts`).

Điều hệ thống **không** hứa: chặn điện thoại quay màn hình, chặn phần mềm quay (OBS…), chặn máy ảnh
chụp màn chiếu. Ai cần mức cao hơn phải dùng thiết bị quản lý tập trung (MDM) — không giải quyết bằng web.

## 6. Trình chiếu

Nút **Trình chiếu toàn màn hình** (hoặc phím `F`) đưa khung vào fullscreen thật; ở chế độ thường khung
đã cao gần hết cửa sổ. Gói SCORM và slide PDF dùng chung khung này, nên giáo viên chỉ quen một màn hình.

## 7. Phía giáo viên

Trang **Chuẩn bị buổi dạy** (`/teacher/sessions/<id>/chuan-bi`) có nút **Mở giáo án buổi này**, đi thẳng
tới khung chiếu — giáo viên không phải tìm trong kho tài liệu. Mọi lượt mở đều ghi `document_access_logs`.

## 8. Quyền

- Xem: `document:read`.
- Đẩy / gỡ / dọn / dùng lại: `document:update`.
- Trang tự kiểm quyền; menu cũng ẩn mục với vai trò không có `document:read` (xem `docs/KIEN-TRUC-MENU.md`).
