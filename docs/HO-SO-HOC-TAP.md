# Hồ sơ học tập — phiếu nhận xét từng buổi, học bạ mốc tự tổng hợp, PDF lưu trữ

Mục tiêu của chủ dự án: **sau mỗi buổi giáo viên đánh giá sẽ đổ ra được một phiếu đánh giá**, và các phiếu đó
**lưu trữ lại dạng PDF để in hay chia sẻ toàn bộ lộ trình học của học viên**.

Tính năng xây lại học bạ thành một **Hồ sơ học tập (portfolio)** xuyên suốt các khoá:

1. **Phiếu nhận xét buổi học** — mỗi học viên có mặt, mỗi buổi, chấm nhanh theo rubric 4 mức ngay trên màn điểm danh;
   phát hành cùng lúc khi giáo viên hoàn tất buổi; đã phát hành thì bất biến.
2. **Học bạ mốc tự tổng hợp** — mở học bạ buổi 5 / 12 … là thấy sẵn điểm trung bình các phiếu buổi của giai đoạn,
   xu hướng, chuyên cần, tỷ lệ đạt mục tiêu bài, thẻ nổi bật, gợi ý nhận xét. Giáo viên chỉ xác nhận / chỉnh và viết nhận xét tổng.
3. **Hồ sơ học tập** — gom lộ trình các khoá, phiếu buổi, học bạ, chứng nhận, sản phẩm, biểu đồ tiến bộ; xem trên trang quản trị,
   cổng phụ huynh, hoặc link chia sẻ riêng `/hs/<token>`; **in / lưu PDF nhiều trang khổ A4**.

---

## 1. Cơ sở nghiên cứu

| Nguyên tắc | Nguồn | Áp dụng trong Sata Robo |
|---|---|---|
| **Portfolio số** — mỗi mục là *bằng chứng* (sản phẩm / ảnh) + nhận xét của giáo viên + gắn năng lực; mục cộng dồn thành báo cáo tiến bộ; theo học sinh xuyên năm; gia đình xem được; xuất được | Mô hình Seesaw / Toddle | Mỗi phiếu buổi có tiêu chí năng lực, ô "Sản phẩm", ảnh đã duyệt có gắn bé, nhận xét cho phụ huynh; hồ sơ gom mọi khoá của bé; phụ huynh xem trên cổng `/ph`, link chia sẻ, in PDF |
| **Rubric phân tích (analytic rubric)** — chấm riêng từng tiêu chí, mỗi tiêu chí có các mức *có mô tả*; nhóm Thiết kế và Lập trình, 4 mức; dùng cho **đánh giá hình thành** theo vòng lặp cải tiến | Nghiên cứu rubric kỹ năng robotics (Frontiers in Education, 2024) | 4 mức có thứ tự, ngôn từ tích cực: **1 Đang làm quen · 2 Cần hỗ trợ · 3 Đạt · 4 Vượt mong đợi**; mô tả mức riêng cho nhóm Lập trình, Lắp ráp – thiết kế, Giải quyết vấn đề, Hợp tác, Trình bày (`rubricLevelsFor`), hiển thị như gợi ý khi chấm và in trên phiếu |
| **Đánh giá hình thành mỗi buổi → tổng kết theo mốc** | Thực hành đánh giá phổ biến (formative → summative) | Phiếu buổi là dữ liệu gốc; học bạ mốc **tự tổng hợp** từ phiếu buổi trong giai đoạn (trung bình + xu hướng), giáo viên chỉ xác nhận |

Thiết kế cho trẻ tiểu học – THCS và giáo viên chấm nhanh sau buổi: không có nhãn nặng nề ("kém", "chưa tốt"); mức thấp tô màu cam nhấn,
mức cao tô tím thương hiệu; bản in trang trọng, chữ đủ lớn cho ông bà đọc; mỗi tiêu chí là **thanh 4 nấc** kèm mô tả mức đạt được.

---

## 2. Mô hình dữ liệu

Schema: `packages/db/src/schema/portfolio.ts`; ràng buộc, trigger, RLS: `packages/db/sql/0011_ho_so_hoc_tap.sql` (idempotent, chạy sau `db:push`).

### 2.1 `session_evaluations` — phiếu nhận xét buổi học

| Nhóm | Cột |
|---|---|
| Khoá | `id`, `tenant_id` (trigger `fill_tenant_id` tự điền theo cơ sở), `center_id`, `session_id`, `enrollment_id`, `student_id`, `class_id`, `course_id`, `lesson_id`, `teacher_id`; **unique (`session_id`, `enrollment_id`)** |
| Trạng thái | `status` `draft` / `published`; `revision` (0 khi nháp, 1 khi phát hành, +1 mỗi lần sửa sau phát hành) |
| Nội dung | `snapshot` JSONB (bản chụp — xem 2.2), `objective_result` (`achieved` / `partial` / `not_yet`), `highlights text[]`, `product_note`, `remark` (nhận xét cho phụ huynh = `attendance.student_remark`), `media_ids uuid[]` |
| Phát hành / sửa | `published_at`, `published_by`, `amended_at`, `amended_by`, `amend_reason` |
| Nhật ký | `created_by`, `updated_by`, `created_at`, `updated_at` |

Ràng buộc CHECK: trạng thái, kết quả mục tiêu bài, đã phát hành phải có mốc + kết quả + `revision ≥ 1`, sửa sau phát hành phải có lý do ≥ 5 ký tự,
độ dài ô chữ ≤ 1000, tối đa 6 thẻ nổi bật, `snapshot` đúng hình dạng. **Trigger `session_evaluations_immutable`**: phiếu đã phát hành không trở về nháp;
đổi nội dung (điểm, mục tiêu bài, thẻ, sản phẩm, nhận xét) chỉ khi đồng thời tăng `revision` và ghi `amended_at` — lớp chặn cuối ở CSDL.
Riêng `media_ids` (ảnh minh chứng) được gắn thêm sau khi ảnh lớp được duyệt.

### 2.2 Bản chụp (`SessionEvalSnapshot`)

`packages/core/src/portfolio/rubric.ts`:

```ts
{ version: "2026.09", scale: 4,
  criteria: [{ key, criterionId, label, description, levels: [{ value, label, hint }] × 4, value }],
  context: { date, startTime, sequenceNo, label, makeup, lessonTitle, lessonObjectives, teacherName,
             className, classCode, courseName, courseCode, centerName, studentName, studentCode },
  takenAt }
```

- Tiêu chí lấy từ `competency_criteria` đang dùng của khoá; khoá chưa cấu hình tiêu chí thì dùng bộ mặc định (Lắp ráp & thiết kế, Tư duy lập trình, Giải quyết vấn đề, Hợp tác & trình bày).
- **Chụp lại lúc phát hành** (`rebaseSnapshot`): lấy bài đã xác nhận, giáo viên đứng buổi, tiêu chí mới nhất và mang điểm đã chấm sang. Sau đó không bao giờ chụp lại —
  đổi tiêu chí / giáo trình / tên giáo viên sau này **không làm đổi phiếu cũ**.

### 2.3 `portfolio_shares` — link chia sẻ hồ sơ

`token` (≥ 32 byte base64url, unique, CHECK định dạng), `scope` (`all` / `course` / `range`) + `enrollment_id` / `from_date`, `to_date` (CHECK đủ tham số theo phạm vi),
`label` (ghi chú nội bộ: gửi cho ai), `expires_at` (mặc định 180 ngày), `revoked_at/by`, `revoke_reason` (bắt buộc), `view_count`, `first_viewed_at`, `last_viewed_at`, `created_by`.

### 2.4 `portfolio_exports` — bản PDF lưu trữ (tuỳ chọn)

`file_key` (`portfolio/<studentId>/<id>.pdf`), `size_bytes`, phạm vi, `created_by`, `created_at`.

### 2.5 Cột mới trên `report_cards`

- `rubric_scale` (4 / 5, mặc định 5): học bạ **tạo sau khi có phiếu buổi** chấm theo thang 4; học bạ cũ giữ thang 5 và hiển thị như trước.
- `aggregate` JSONB: bản chụp số liệu tổng hợp từ phiếu buổi lúc lưu học bạ (`MilestoneAggregate`).
- Xếp loại cuối khoá (`completionAverage`, gợi ý xếp loại khi đề xuất hoàn thành khoá) quy điểm thang 4 về thang 5 trong SQL (`1 + (điểm − 1) × 4/3`) trước khi lấy trung bình — ngưỡng xếp loại cũ giữ nguyên.

---

## 3. Luồng giáo viên sau mỗi buổi (một chạm, không thêm tab)

Màn buổi học `/teacher/sessions/<id>` — cũng là màn nhân sự mở từ **Buổi học**, **Lưới điểm danh**, **Lớp** và **Việc hôm nay**:

```
Điểm danh ──► Khối "Phiếu nhận xét buổi học" (ngay dưới điểm danh) ──► Nhận xét chung ──► Hoàn tất buổi
               mỗi HV có mặt: tiêu chí × 4 nút · 3 nút mục tiêu bài          │
               · thẻ nổi bật · Sản phẩm · Nhận xét cho PH · ảnh          ▼
               lưu nháp tự động 1,2 giây sau lần chạm cuối      phát hành MỌI phiếu nháp đủ điều kiện
                                                                 (cùng transaction, có nhật ký)
```

1. **Chấm**: mỗi học viên một dòng gọn (chấm màu từng tiêu chí + trạng thái "Sẵn sàng / Còn thiếu / Đã phát hành"); chạm để mở — hàng tiêu chí, mỗi tiêu chí **4 nút lớn**
   (số + nhãn mức; chạm lại để bỏ), dưới nút hiện **mô tả của mức vừa chọn**; 3 nút "Đạt / Một phần / Chưa đạt" cho mục tiêu bài; thẻ nổi bật chạm một lần
   (mặc định: Sáng tạo, Kiên trì, Giúp đỡ bạn, Hoàn thành sớm, Đặt câu hỏi hay, Trình bày tự tin — cấu hình ở `app_settings.ho_so_hoc_tap.highlights`);
   ô "Sản phẩm"; ô "Nhận xét cho phụ huynh"; chọn ảnh đã duyệt có gắn bé.
2. **Chép mức cho cả lớp**: nút "Chép mức của bé này cho cả lớp" chép điểm + mục tiêu bài sang mọi em có mặt chưa phát hành (không đụng nhận xét riêng), rồi chỉnh vài em khác biệt.
   Nút "Tiếp theo: <tên>" chuyển nhanh sang em kế.
3. **Nhận xét không nhập hai lần**: ô nhận xét của phiếu **chính là** `attendance.student_remark` (đồng bộ hai chiều). Trên danh sách điểm danh, dòng của học viên có mặt hiện
   nhận xét và trỏ xuống phiếu; nút "Lưu điểm danh" không gửi kèm nhận xét của học viên có mặt nên không ghi đè. Người không có quyền chấm phiếu (vd trợ giảng)
   vẫn thấy ô nhận xét nhanh như cũ.
4. **Không lập phiếu cho học viên vắng**; học viên chuyển sang vắng sau khi đã có nháp thì nháp bị xoá khi hoàn tất buổi. **Buổi học bù** (buổi loại `makeup` hoặc học viên điểm danh
   "Học bù") vẫn có phiếu, ghi rõ "Học bù" trên phiếu.
5. **Hoàn tất buổi** (`academics.sessions.transition` sự kiện `complete`):
   - Bước mới trong **Quy trình sau buổi**: "Phiếu nhận xét buổi học của từng học viên" (x/y phiếu đủ tiêu chí).
   - **Chặn hoàn tất** khi còn học viên có mặt thiếu phiếu đủ tiêu chí, thông báo tiếng Việt **nêu tên học viên thiếu**, vd
     *"Chưa đủ phiếu nhận xét cho 2 học viên có mặt: Học viên mẫu 3 (chưa chấm Làm việc nhóm, chưa chọn kết quả mục tiêu bài); Học viên mẫu 7 (chưa có phiếu)"*.
   - Cấu hình vận hành **"Hoàn tất buổi phải có phiếu nhận xét đủ tiêu chí cho từng học viên có mặt"** (`sessionRequireEvaluations`, nhóm *Lớp học*, theo cơ sở) —
     **mặc định BẬT (chặn)**. Tắt thì buổi vẫn hoàn tất; phiếu đủ được phát hành, phiếu thiếu ở lại nháp — điền xong là **phát hành ngay** và buổi xuất hiện ở "Việc hôm nay" tới khi đủ.
   - Phát hành (`publishSessionEvaluations`) chạy **trong cùng transaction** với việc chuyển trạng thái buổi, ghi một dòng nhật ký (`session_evaluations`, TRANSITION).
6. **Sửa phiếu đã phát hành**: nút "Sửa phiếu (cần lý do)" — bắt buộc lý do ≥ 5 ký tự, giữ nguyên bản chụp tiêu chí, `revision` + 1, ghi nhật ký trước / sau;
   phiếu in ghi "Đã chỉnh sửa lần N".
7. **Việc hôm nay** có nhóm **"Buổi chưa có phiếu nhận xét học viên"**: buổi đã diễn ra, có học viên có mặt chưa có phiếu phát hành, trong 30 ngày gần nhất và từ mốc bật tính năng
   (`app_settings.ho_so_hoc_tap.since`, migration đặt bằng ngày chạy — buổi cũ không bị nhắc hàng loạt). Giáo viên (quyền `_own`) chỉ thấy buổi mình dạy.
   Bấm "Chấm phiếu" mở thẳng khối phiếu của buổi.

API: `academics.evaluations.{board, save, amend, sheet}` (router `packages/api/src/routers/portfolio.ts`, service `packages/api/src/services/sessionEvaluations.ts`).

---

## 4. Học bạ mốc tự tổng hợp

Khi mở học bạ mốc (`/report-cards/<ghi danh>/<buổi mốc>`), service `milestoneAggregateFor` tính trực tiếp từ các phiếu buổi **đã phát hành**:

- **Giai đoạn** = từ sau buổi mốc trước đến buổi mốc này (vd mốc 12 → buổi 6–12), so theo **ngày buổi học** để gồm cả buổi học bù; giai đoạn trước (1–5) để tính xu hướng.
- **Điểm từng tiêu chí** = trung bình các phiếu trong giai đoạn, **làm tròn 1 chữ số**; **tiêu chí không có dữ liệu thì bỏ qua** (không tính vào điểm chung).
- **Xu hướng** so với giai đoạn trước: chênh ≥ +0,3 → *Tiến bộ*, ≤ −0,3 → *Cần chú ý*, còn lại *Ổn định*.
- **Chuyên cần** có mặt / tổng buổi của giai đoạn; **tỷ lệ đạt mục tiêu bài**; **3 thẻ nổi bật xuất hiện nhiều nhất**; **gợi ý nhận xét** (câu dựng từ số liệu + 3 nhận xét buổi gần nhất) — chạm để chèn.
- Học bạ **mới** (chưa có điểm) được **điền sẵn** điểm = trung bình làm tròn (thang 4); nút "Điền lại theo phiếu buổi". Giáo viên xác nhận / chỉnh + viết nhận xét tổng.
- **Luồng duyệt giữ nguyên**: nháp → chờ duyệt → trả lại / duyệt → gửi phụ huynh. Mỗi lần lưu, số liệu tổng hợp được **chụp** vào `report_cards.aggregate` —
  học bạ đã gửi phụ huynh không đổi khi phiếu buổi thay đổi sau đó.

Hàm thuần có kiểm thử: `packages/core/src/portfolio/aggregate.ts` (`aggregateMilestone`, `trendOf`, `milestonePeriod`, `normalizeTo5`, `suggestMilestoneComment`).

---

## 5. Hồ sơ học tập & chia sẻ

Service `packages/api/src/services/portfolio.ts`, router `portfolio.{get, options, milestone, shares, createShare, revokeShare, exportPdf}`.
Một hàm dựng dữ liệu duy nhất `buildPortfolio(db, studentId, phạm vi)` → `PortfolioView` (`packages/core/src/portfolio/view.ts`), dùng chung bốn cửa vào:

| Cửa vào | Đường dẫn | Quyền |
|---|---|---|
| Nhân sự | `/students/<id>` → khối **"Hồ sơ học tập"** (xem, in, chia sẻ — drawer, không thêm tab); trang đầy đủ `/ho-so-hoc-tap/<id>` (lọc theo khoá / khoảng ngày) | `student:read` tại cơ sở (GV: học viên lớp mình, quyền `_own`); `assertTenant`; `redact` theo tenant |
| Phụ huynh đã đăng nhập | `/ph/be/<id>` → "Hồ sơ học tập của con" → `/ph/be/<id>/ho-so` | chỉ con của mình (bảng `student_guardians`), không cần token |
| Link chia sẻ | `/hs/<token>` | token là quyền; có hạn; thu hồi được |
| Bộ xuất PDF máy chủ | `/in-ho-so/<id>?…&exp&sig` | chữ ký HMAC 5 phút, ký sau khi đã kiểm quyền |

Nội dung hồ sơ: thông tin bé (tên, mã HV, lớp phổ thông); **lộ trình** các khoá theo thời gian (khoá, cấp độ, lớp, cơ sở, thời gian, trạng thái); từng khoá: phiếu buổi đã phát hành,
học bạ mốc đã gửi phụ huynh, chứng nhận đã duyệt, **mạng nhện năng lực** trung bình; **biểu đồ đường tiến bộ** (điểm trung bình tiêu chí theo buổi);
**chuyên cần** (có mặt / muộn / bù / phép / vắng); **bộ sưu tập sản phẩm** (ảnh **đã duyệt** có gắn bé hoặc ảnh chung cả lớp, **chỉ khi phụ huynh đang đồng ý đăng ảnh** —
kiểm lại mỗi lần hiển thị, rút đồng ý là ảnh ẩn ngay; ảnh phát qua URL ký có hạn).

**Chia sẻ** (người có `student:update` hoặc `report_card:approve` tại cơ sở):
phạm vi *Toàn bộ lộ trình / Một khoá / Một khoảng thời gian*, hạn mặc định **180 ngày** (`PORTFOLIO_SHARE_DAYS`, 1–365), ghi chú nội bộ "gửi cho ai";
tạo xong **tự sao chép link**, nút "Chia sẻ" (Web Share API → Zalo trên điện thoại) và tin nhắn soạn sẵn. Danh sách link: trạng thái, **lượt xem**, lần xem gần nhất,
**thu hồi** (bắt buộc lý do). Mọi thao tác ghi nhật ký **trong transaction**; token **không** ghi vào nhật ký.

---

## 6. In / Lưu PDF và cơ chế lưu trữ

Bộ component dùng chung `apps/web/src/components/portfolio/`:

| Component | Dùng cho |
|---|---|
| `SessionSheet` | Phiếu một buổi — bản đầy đủ (in riêng khổ **A5**, `/phieu-buoi/<id>`) và bản gọn trong hồ sơ |
| `MilestoneCard` | Học bạ mốc — trong hồ sơ và in riêng (`/hoc-ba-moc/<id>`, A4) |
| `PortfolioDocument` | Cả hồ sơ nhiều trang |
| `RubricBar`, `TrendChip` (`parts.tsx`) | Thanh 4 nấc tô màu, mức đạt in đậm + mô tả mức; chip xu hướng |
| `ProgressLine`, `RadarChart` (`charts.tsx`) | Biểu đồ đường và mạng nhện — **SVG thuần**, toạ độ tính ở `packages/core/src/portfolio/chart.ts` (có kiểm thử), không thêm thư viện |
| `PortfolioPrintStyle` | CSS in |

**Bố cục PDF A4** (`@page A4`, lề 12 mm, `print-color-adjust: exact`, `break-inside: avoid`):
trang bìa (logo `/icon.svg`, "Hồ sơ học tập", tên bé, mã HV, giai đoạn, cơ sở, số khoá / phiếu / chứng nhận) →
trang tóm tắt (lộ trình dạng dòng thời gian, biểu đồ tiến bộ, chuyên cần, chứng nhận) →
**mỗi khoá sang trang mới** (tổng quan + mạng nhện, học bạ mốc, rồi **2 phiếu buổi / trang**) → trang sản phẩm.
Chân trang đánh số "Trang x / y" bằng ô lề trang CSS (`@bottom-right`, Chrome 131+; trình duyệt khác bỏ qua). Nút **"In / Lưu PDF"** gọi `window.print()`
→ chọn máy in "Lưu dưới dạng PDF" (Chrome / Edge) hoặc "Lưu thành PDF" (Safari); nên bật "Đồ hoạ nền".

**Cơ chế lưu trữ**

1. **Bất biến là bản lưu trữ chính**: phiếu buổi đã phát hành là bản chụp không đổi (trigger CSDL chặn sửa không lý do), học bạ lưu bản chụp số liệu tổng hợp —
   nên **in hồ sơ ra PDF vào bất kỳ lúc nào cũng cho nội dung giống hệt lúc phát hành** (chỉ khác ảnh nếu phụ huynh rút đồng ý đăng ảnh — đúng NĐ13). Không cần lưu tệp mới giữ được "bản gốc".
2. **Xuất PDF phía máy chủ (tuỳ chọn)** — `packages/api/src/services/pdfRender.ts`: khi `PDF_RENDERER=playwright`, nút **"Xuất PDF lưu trữ"** (trong drawer chia sẻ) dùng
   `playwright-core` **nạp động** (`await import(biến)` trong try/catch — không import tĩnh, typecheck / bundler không phụ thuộc gói) mở Chrome có sẵn
   (`chromium.launch({ channel: "chrome" })`, hoặc `PDF_CHROME_PATH`), in trang nội bộ `/in-ho-so/…` (ký HMAC 5 phút) ra PDF A4, lưu qua kho tệp (`putObject`,
   khoá `portfolio/<studentId>/<id>.pdf`) và ghi `portfolio_exports`. Tải lại bằng URL ký có hạn (`/api/content/file`). Không bật / chưa cài gói → nút ẩn, chỉ còn "In / Lưu PDF".
   `playwright-core` nằm ở `optionalDependencies` của `@satarobo/api` và `serverExternalPackages` của Next.

Biến môi trường: `PDF_RENDERER=playwright`, `PDF_CHROME_CHANNEL` (mặc định `chrome`), `PDF_CHROME_PATH`, `PDF_RENDER_BASE_URL` (mặc định `NEXT_PUBLIC_APP_URL`).

---

## 7. Quyền & bảo mật

| Việc | Quyền |
|---|---|
| Xem khối phiếu của buổi | `session:read` (GV: buổi mình dạy / lớp mình) |
| Chấm, lưu nháp, sửa phiếu đã phát hành (có lý do) | `session_note:write` (GV: `session_note:write_own`) |
| Xem / in một phiếu | người dạy buổi đó **hoặc** `student:read` tại cơ sở |
| Xem hồ sơ học tập | `student:read` tại cơ sở (GV: `student:read_own` — học viên lớp mình) |
| Chia sẻ link, thu hồi, xuất PDF lưu trữ | `student:update` **hoặc** `report_card:approve` tại cơ sở |
| Học bạ mốc | như cũ: `report_card:write*`, `report_card:approve` |

- Mọi truy vấn danh sách có `tenantCond`; nạp theo id có `assertTenant`; hồ sơ trả nhân sự qua `redact` theo tenant; mọi thao tác ghi có `writeAudit` **trong transaction**.
- 3 bảng mới đăng ký trigger `fill_tenant_id`, `assert_center_tenant`, chỉ mục `tenant_id`, chính sách RLS `tenant_isolation` (như 0009, chưa tự bật).
- **Link công khai `/hs/<token>`**: kiểm định dạng token trước khi truy vấn; trần tần suất theo IP (`portfolioViewIp` 300 lượt / 15 phút, nới bằng `RATE_LIMIT_PORTFOLIO_VIEW_IP_MAX`);
  `robots: noindex, nofollow`, `referrer: no-referrer`; hết hạn / thu hồi → câu lịch sự kèm số điện thoại cơ sở; mở link không đổi `updated_at` (đếm lượt xem bằng SQL riêng).
- **Không bao giờ trả ra** (trang công khai, cổng phụ huynh, bản in): SĐT / email / địa chỉ phụ huynh, ghi chú nội bộ của buổi (`private_note`), lý do vắng (`absence_reason`),
  id phụ huynh. `PortfolioView` chỉ gồm đúng những gì in trên hồ sơ.
- Trang in cho bộ xuất PDF chỉ mở bằng chữ ký HMAC (bí mật ký ảnh) trên đúng (học viên, phạm vi), hạn 5 phút.
- CSP: chỉ dùng `<style>` nội tuyến cho CSS in (được phép), **không** có `<script>` nội tuyến; tự in (`?in=1`) chạy trong component client.

---

## 8. Trước / sau

| Khía cạnh | Học bạ cũ | Hồ sơ học tập mới |
|---|---|---|
| Đánh giá mỗi buổi | Chỉ nhận xét chữ + 1–5 sao, không theo tiêu chí | **Phiếu theo tiêu chí năng lực của khoá**, rubric 4 mức có mô tả, mục tiêu bài, thẻ nổi bật, sản phẩm, ảnh |
| Nhập liệu của GV | Nhận xét buổi ở một ô, học bạ chấm lại từ đầu ở mốc | Một chạm ngay trên màn điểm danh, **chép mức cho cả lớp**, tự lưu nháp; nhận xét nhập **một lần** (đồng bộ với điểm danh) |
| Học bạ mốc | GV chấm tay 1–5 từ trí nhớ | **Điền sẵn** trung bình phiếu buổi + xu hướng ±0,3 + chuyên cần + tỷ lệ đạt mục tiêu + thẻ nổi bật + gợi ý nhận xét; GV xác nhận |
| Thang điểm | 1–5 ("Cần cố gắng … Xuất sắc") | 1–4 ngôn từ tích cực ("Đang làm quen … Vượt mong đợi"); học bạ cũ giữ thang 5, xếp loại cuối khoá quy đổi về thang 5 |
| Tính bất biến | Học bạ đã gửi PH không sửa; nhận xét buổi sửa được không dấu vết | Phiếu buổi **bất biến sau phát hành** (trigger CSDL), sửa phải có lý do + nhật ký + số lần sửa; học bạ chụp số liệu |
| Khi hoàn tất buổi | Không kiểm đánh giá từng HV (chỉ nhận xét chữ, tuỳ cấu hình) | **Chặn hoàn tất** nếu HV có mặt thiếu phiếu đủ tiêu chí (nêu tên), cấu hình được; phát hành cùng transaction |
| Theo dõi việc còn thiếu | Không có | "Việc hôm nay" → **Buổi chưa có phiếu nhận xét học viên** |
| Phạm vi | Từng mốc của một lớp | **Xuyên suốt các khoá**: lộ trình, biểu đồ tiến bộ, mạng nhện năng lực, chứng nhận, sản phẩm |
| Phụ huynh xem | Danh sách điểm số dạng chữ trong cổng | Cổng `/ph` có "Hồ sơ học tập của con" + link chia sẻ cho ông bà (có hạn, thu hồi được, đếm lượt xem) |
| In / lưu trữ | Không có bản in | **PDF nhiều trang A4** (bìa, tóm tắt, từng khoá, 2 phiếu / trang, sản phẩm), in riêng một phiếu (A5) / một học bạ; xuất PDF lưu trữ phía máy chủ tuỳ chọn |
| Bằng chứng | Không gắn ảnh | Ảnh đã duyệt có gắn bé, chỉ khi phụ huynh đồng ý đăng ảnh |

---

## 9. Xem thử với dữ liệu mẫu

`pnpm db:reset && pnpm db:push && pnpm db:apply-sql && pnpm db:seed` — seed sinh phiếu đã phát hành cho mọi học viên có mặt ở các buổi đã hoàn tất
(điểm tăng nhẹ theo số buổi, học viên vắng không có phiếu), chuyển học bạ mốc đã có sang thang 4 với số liệu tổng hợp, gắn 2 ảnh đã duyệt cho "Học viên mẫu 2", và in ở cuối:

- **Hồ sơ học tập mẫu** (không cần đăng nhập): `http://localhost:3000/hs/xem-thu-ho-so-hoc-tap-sata-robo-mau`
- Trang quản trị: **Học viên → Học viên mẫu 2 → khối "Hồ sơ học tập"** (xem, in, chia sẻ, danh sách link + lượt xem + thu hồi).
- Luồng giáo viên: đăng nhập `teacher1@satarobo.vn` → buổi quá hạn chưa chốt của lớp Sata4 sáng CN → điểm danh → chấm phiếu → thử **Hoàn tất** khi còn thiếu để thấy thông báo chặn.
- Mốc bật tính năng trong seed đặt 14 ngày trước để nhóm "Buổi chưa có phiếu nhận xét học viên" có việc mẫu.

---

## 10. Kiểm thử

- Hàm thuần: `packages/core/src/portfolio/portfolio.test.ts` — rubric 4 mức, bản chụp + chụp lại lúc phát hành, điều kiện phát hành buổi (nêu tên HV thiếu),
  chặn hoàn tất + cấu hình bỏ chặn, chép mức cho cả lớp, tổng hợp học bạ (trung bình, xu hướng ±0,3, bỏ tiêu chí trống), thang 4 / thang 5,
  phạm vi chia sẻ, hạn / thu hồi / định dạng token, chuỗi phạm vi ký HMAC, dữ liệu biểu đồ đường / mạng nhện, chuyên cần, xếp 2 phiếu / trang.
- Chạy: `node --experimental-transform-types --import /tmp/reg.mjs --test "packages/core/src/**/*.test.ts"`.
- Kịch bản toàn diện (`scripts/kiem-thu/kich-ban-toan-dien.ps1`): nhóm việc mới `session_evaluation` mở bằng `session_note:write|session_note:write_own`.
- Chuẩn hồ sơ: `packages/core/src/portfolio/standard.test.ts` — chuẩn mặc định = hành vi cũ, đọc từ cấu hình vận hành (khoá cũ `sessionRequireEvaluations`),
  tính hạn theo giờ Việt Nam (qua nửa đêm / qua tháng), trạng thái hạn, vi phạm từng phiếu (mã + câu tiếng Việt), bằng chứng theo ngưỡng, điểm đạt chuẩn hồ sơ,
  kiểm tra 4 mô tả mức, bộ mẫu robotics, mô tả mức riêng thắng mô tả theo tên, sắp xếp tiêu chí trọng tâm, điều kiện phát hành theo chuẩn, danh mục "Buổi này cần hoàn thiện".

## 11. Hướng mở rộng

- Gửi thông báo cho phụ huynh khi phiếu buổi được phát hành (gộp vào thông báo "buổi học đã hoàn tất" hiện có).
- ~~Cấu hình rubric / mô tả mức theo từng khoá~~ — đã làm (mục 13).
- Học sinh tự đánh giá (self-assessment) trên cùng rubric để so với đánh giá của giáo viên.
- Đính kèm tệp dự án (mã nguồn, video ngắn) làm bằng chứng, không chỉ ảnh.
- Đưa vi phạm "tỷ lệ bằng chứng của buổi" thành dòng riêng trong danh sách vi phạm (hiện ghi chú theo buổi) và tự nhắc GV khi phiếu sắp tới hạn.

---

## 12. Chuẩn thông tin hồ sơ học tập

Yêu cầu của chủ dự án: *"Ở quản trị tôi cần đảm bảo quản lý được việc hồ sơ học tập theo đúng chuẩn thông tin"*.
Chuẩn = **một tập quy tắc đo được**; quản trị theo dõi bằng **tỷ lệ đạt chuẩn** chứ không đọc từng phiếu.

| Quy tắc | Đo thế nào | Cấu hình (khoá) | Mặc định | Chặn hoàn tất buổi? |
|---|---|---|---|---|
| Phiếu đủ tiêu chí | mọi tiêu chí của phiếu đã chấm | — (luôn bắt buộc) | — | Có (khi bật chặn) |
| Kết quả mục tiêu bài | `objective_result` có giá trị | `requireObjectiveResult` | BẬT | Có (khi bật chặn) |
| Ghi "Sản phẩm" | `product_note` không rỗng | `requireProductNote` | TẮT | Có (khi bật chặn) |
| Nhận xét cho phụ huynh đủ dài | `length(trim(remark)) ≥ N` | `remarkMinLength` | 30 ký tự | **Không** — chỉ tính vào tỷ lệ đủ chuẩn |
| Bằng chứng mỗi buổi | tỷ lệ HV có ảnh đã chọn hoặc có "Sản phẩm" ≥ N% | `minEvidenceRatePct` | 0 (không bắt) | Không |
| Phiếu đúng hạn | phát hành trước *giờ kết thúc buổi + N giờ* (giờ Việt Nam) | `sheetDeadlineHours` | 24 giờ | Không |
| Học bạ mốc đúng lịch | nộp học bạ trước *cuối ngày buổi mốc + N ngày* | `milestoneDeadlineDays` | 7 ngày | Không |
| Hồ sơ HV đạt chuẩn | % phiếu (đã tới hạn) đủ chuẩn ≥ N% | `profileMinSheetPct` | 90% | Không |
| Chặn hoàn tất buổi khi thiếu phiếu | — | `sessionRequireEvaluations` (**giữ khoá cũ**) | BẬT | — |

**Cấu hình**: *Cấu hình vận hành → tab "Hồ sơ học tập"* (`/cau-hinh-van-hanh?tab=ho-so-hoc-tap`, nhóm `ho-so-hoc-tap` trong `OPS_GROUPS`).
Đặt *Mặc định toàn hệ thống* (quyền `system:configure`) rồi **ghi đè theo cơ sở** (quyền `automation:update` tại cơ sở) — cơ sở không ghi đè thì kế thừa.
Khoá `sessionRequireEvaluations` trước nằm ở tab *Lớp & GV*, nay chuyển sang tab này **giữ nguyên tên khoá** nên giá trị đã lưu vẫn hiệu lực.
Mặc định giữ đúng hành vi trước đây (chặn khi thiếu tiêu chí / mục tiêu bài; không bắt sản phẩm, không bắt ảnh).

**Định nghĩa dùng chung** (hàm thuần `packages/core/src/portfolio/standard.ts`, SQL tương ứng ở `packages/api/src/services/portfolioStandard.ts`):

- *Phiếu kỳ vọng*: mỗi học viên **có mặt / đi muộn / học bù** ở mỗi buổi đã diễn ra, tính từ mốc bật tính năng (`app_settings.ho_so_hoc_tap.since`).
- *Tới hạn*: đã phát hành, hoặc đã qua hạn hoàn thiện. Phiếu còn trong hạn **chưa tính** vào tỷ lệ (không phạt GV khi buổi vừa xong).
- *Đủ chuẩn*: đã phát hành + mục tiêu bài (nếu bắt buộc) + nhận xét ≥ `remarkMinLength` + sản phẩm (nếu bắt buộc).
- *Đúng hạn*: `published_at ≤ hạn`. Hạn = `(ngày + giờ kết thúc buổi) at time zone 'Asia/Ho_Chi_Minh' + sheetDeadlineHours giờ`.
- `evaluateSheetCompliance(phiếu, chuẩn)` → danh sách vi phạm có **mã** (`no_sheet`, `criteria_missing`, `objective_missing`, `remark_short`, `product_missing`,
  `not_published`, `late`, `overdue`) + câu tiếng Việt, cờ `contentOk` / `onTime` / `due`. `portfolioComplianceScore(...)` → % phiếu đủ chuẩn, % đúng hạn,
  % bằng chứng, % học bạ đúng hạn, điểm tổng 0–100 (trọng số 50 · 20 · 15 · 15, bỏ phần không có dữ liệu), `meetsStandard`, `milestoneLate`.
- Điều kiện phát hành phiếu / chặn hoàn tất (`validateSessionEvaluation`, `sessionEvaluationReadiness`) nhận thêm `requirement` đọc từ chuẩn của cơ sở.
  CSDL (0013) bỏ ràng buộc cứng "đã phát hành phải có kết quả mục tiêu bài" để cơ sở tắt được quy tắc này; dịch vụ vẫn chặn khi bật (mặc định).

## 13. Rubric có mô tả mức & tiêu chí trọng tâm

Cơ sở nghiên cứu: **rubric phân tích** chỉ cho kết quả tin cậy giữa các người chấm khi **mỗi mức có mô tả hành vi quan sát được**
(nghiên cứu rubric robotics, Frontiers in Education 2024 — độ tin cậy cao nhờ mô tả mức rõ + buổi hiệu chuẩn người chấm). Thiếu mô tả thì mỗi GV chấm một kiểu.

- **Dữ liệu** (`packages/db/sql/0013_chuan_ho_so.sql`, idempotent):
  - `competency_criteria.group_name` (nhóm, ≤ 60 ký tự) và `level_descriptors` JSONB — **mảng đúng 4 chuỗi** (mức 1 → 4), CHECK hình dạng; NULL = dùng mô tả mặc định theo tên.
  - Bảng mới `lesson_focus_criteria (lesson_id, criterion_id, created_by, created_at)`, unique (bài, tiêu chí), trigger chặn gắn tiêu chí khác khoá của bài.
    Phạm vi trung tâm đi theo khoá học (`courses.tenant_id`). Nhân bản giáo trình chép cả tiêu chí trọng tâm theo số thứ tự bài.
- **Trong phiếu**: tiêu chí trọng tâm của bài được **đánh dấu sao và xếp lên đầu** (`orderCriteriaWithFocus`); bài không khai thì dùng toàn bộ tiêu chí của khoá như cũ.
  Mô tả mức khai riêng **thắng** mô tả theo từ khoá tên (`rubricLevelsFor(tên, mô tả)`). Bản chụp phiếu ghi thêm `group`, `focus` — phiếu cũ không đổi.
- **Quản trị** — nút **"Tiêu chí đánh giá"** (drawer, không thêm tab) ở *Khoá học* (mỗi dòng khoá) và *Giáo trình* (đầu trang):
  - theo khoá: sửa tên, nhóm (gợi ý: Thiết kế & lắp ráp · Lập trình & tư duy · Kiến thức & kỹ năng · Thái độ & kỹ năng mềm), mô tả, **4 ô mô tả mức**,
    sắp thứ tự ↑↓, ngưng dùng (không xoá — học bạ cũ còn tham chiếu). Kiểm tra: đủ 4, mỗi ô ≥ 5 ký tự, không trùng nhau, ngôn từ tích cực.
  - khoá chưa có tiêu chí → **"Áp dụng bộ mẫu"** robotics / lập trình: 8 tiêu chí, 3 nhóm — *Lắp ráp mô hình, Thiết kế & cải tiến* (Thiết kế & lắp ráp);
    *Tư duy lập trình, Gỡ lỗi & giải quyết vấn đề, Cảm biến & điều khiển* (Lập trình & tư duy); *Hợp tác nhóm, Trình bày sản phẩm, Tập trung & kiên trì*
    (Thái độ & kỹ năng mềm), mỗi tiêu chí 4 mô tả hành vi viết sẵn (`CRITERIA_TEMPLATE_ROBOTICS`).
  - theo bài của giáo trình (chọn phiên bản): sửa **mục tiêu bài**, chọn **tối đa 4 tiêu chí trọng tâm** (chạm chip).
- Quyền: xem `course:read`; sửa tiêu chí `course:update`; mục tiêu bài / trọng tâm `curriculum:update`. Mọi thao tác ghi có nhật ký trong transaction.
- API: `portfolio.criteria.{board, save, reorder, applyTemplate, setFocus}` (service `packages/api/src/services/criteria.ts`).
- Seed: điền mô tả 4 mức + nhóm cho tiêu chí mẫu (Tư duy lập trình, Lắp ráp & cơ khí, Giải quyết vấn đề, Làm việc nhóm, Thuyết trình — theo bộ mẫu),
  tiêu chí trọng tâm cho 7 bài Sata4 (Cảm biến siêu âm, Vòng lặp & rẽ nhánh, Robot tránh vật cản, Lắp ráp khung gầm, Dự án nhóm, Gỡ lỗi, Thử thách sa hình);
  ~10% phiếu mẫu phát hành trễ 2 ngày để màn quản lý có số liệu trễ hạn.

## 14. Màn GV: "Buổi này cần hoàn thiện"

Yêu cầu: *"giáo viên cũng nhìn thấy các tiêu chí, nội dung để hoàn thiện sau mỗi buổi dạy"*. Đầu màn buổi dạy `/teacher/sessions/<id>`
(cũng là màn nhân sự mở từ *Buổi học*) có khối gọn, **thu gọn / mở được** (nhớ trên máy, `localStorage` bọc try/catch):

1. **Bài học**: "Bài N: tên bài", **mục tiêu bài**, **học cụ**; **hạn hoàn thiện phiếu** (giờ + "còn x giờ / quá hạn") theo chuẩn của cơ sở.
2. **Danh mục việc cần xong** — tự tính, cập nhật ngay khi GV chạm (đọc cả phần chưa lưu): điểm danh xong · mỗi HV có mặt đủ tiêu chí ·
   đã chọn kết quả mục tiêu bài · nhận xét ≥ N ký tự · (sản phẩm, nếu bắt buộc) · tỷ lệ HV có ảnh / sản phẩm ≥ ngưỡng · nhận xét chung của buổi.
   Mỗi dòng hiện **x/y** và **tên học viên còn thiếu**; bấm tên → mở đúng phiếu của em đó và cuộn tới (điểm danh → cuộn tới dòng điểm danh; nhận xét chung → ô nhận xét).
   Dòng "chỉ tính vào tỷ lệ đạt chuẩn" ghi rõ — không chặn hoàn tất.
3. **Tiêu chí đánh giá của buổi** (trọng tâm trước, có sao) — mở ra là **bảng rubric nhỏ**: tiêu chí × 4 mức với mô tả hành vi.
4. Trong phiếu từng HV: tiêu chí trọng tâm có nhãn "Trọng tâm"; **chạm một mức là hiện mô tả mức đó ngay dưới** (và khi rê chuột); ô nhận xét có bộ đếm "x/30 ký tự";
   ô Sản phẩm có dấu * khi cơ sở bắt buộc.

Chỉ hiển thị / điều hướng — điều kiện phát hành và chặn hoàn tất vẫn ở máy chủ (`sessionEvaluations.ts`), nay đọc theo chuẩn của cơ sở.
Trang chủ app GV (`/teacher`) có thẻ **"Phiếu cần hoàn thiện"**: buổi mình đã dạy còn học viên có mặt chưa có phiếu phát hành, kèm hạn / "Quá hạn"
(`academics.evaluations.pending`). *Việc hôm nay*: nhóm "Buổi chưa có phiếu nhận xét học viên" đánh dấu quá hạn theo `sheetDeadlineHours` và hiện hạn;
nhóm "Học bạ kỳ chưa viết" (đã có — không thêm nhóm mới, nên kịch bản kiểm thử không đổi) hiện hạn và đánh dấu quá hạn theo `milestoneDeadlineDays`
(trước: cố định 3 ngày; nay mặc định 7 ngày theo chuẩn).

## 15. Quản lý hồ sơ học tập (`/ho-so-hoc-tap`)

Menu *Học viên → **Học bạ & hồ sơ học tập*** (icon `folder-check`, quyền `report_card:read`) — **mục menu duy nhất cho học bạ**
(docs/KIEN-TRUC-MENU.md §3). Ba chip chế độ xem:

| Chip | Đường dẫn | Thay cho |
|---|---|---|
| Tổng quan chuẩn hồ sơ (màn dưới đây) | `/ho-so-hoc-tap` | "Quản lý hồ sơ học tập" |
| Học bạ mốc cần viết / duyệt — lưới theo lớp + hàng đợi duyệt | `/ho-so-hoc-tap?xem=hoc-ba-moc&class=<lớp>` | `/report-cards` "Học bạ năng lực" (chuyển hướng 308) |
| Tra cứu học viên — học bạ mọi trạng thái, chứng nhận, mở hồ sơ | `/ho-so-hoc-tap?xem=tra-cuu&student=<HV>` | `/hoc-ba` "Học bạ" (chuyển hướng 308) |

Viết / duyệt một học bạ vẫn ở `/report-cards/<ghi danh>/<buổi mốc>`, tiêu chí ở `/report-cards/criteria`.

Chip *Tổng quan chuẩn hồ sơ* — một màn hình:

| Chỉ số | Cách tính | Cách đọc |
|---|---|---|
| **Tỷ lệ phiếu đúng hạn** | phiếu phát hành trước hạn / phiếu đã tới hạn | GV có hoàn thiện phiếu kịp trong N giờ sau buổi không |
| **Tỷ lệ phiếu đủ chuẩn** | phiếu đủ chuẩn / phiếu đã tới hạn | Chất lượng thông tin trong hồ sơ (thiếu phiếu, nhận xét quá ngắn, thiếu mục tiêu / sản phẩm) |
| **Học bạ mốc quá hạn** | học bạ của buổi mốc trong khoảng lọc đã qua hạn mà chưa nộp | Số việc tồn cần xử lý ngay |
| **Hồ sơ đạt chuẩn** | HV có ≥ `profileMinSheetPct`% phiếu (tới hạn) đủ chuẩn / HV có phiếu tới hạn | Bao nhiêu hồ sơ đủ tốt để gửi phụ huynh / in |

- **Bộ lọc**: cơ sở, khoá, lớp, GV, khoảng ngày (mặc định 30 ngày gần nhất) — nhớ bằng `RememberFilters`.
- **Bảng theo giáo viên / theo lớp** (chuyển bằng chip): số buổi dạy, phiếu đủ chuẩn / tới hạn, trễ hạn, tỷ lệ — **dòng dưới 90% tô cảnh báo**, sắp tỷ lệ thấp lên đầu.
  Mỗi dòng: nút chính **"Nhắc GV"** (gửi thông báo loại `portfolio.remind` qua cổng `notify`, liệt kê tối đa 8 buổi thiếu kèm hạn; mỗi GV một lần / ngày cho cùng danh sách buổi)
  và liên kết **Chi tiết** (lọc danh sách vi phạm theo GV / lớp đó).
- **Vi phạm cụ thể**: buổi – học viên – vi phạm (chip + câu cụ thể) – hạn; chọn nhiều + **"Nhắc hàng loạt"** (gom theo GV đứng buổi). Buổi chưa đạt tỷ lệ bằng chứng ghi chú "Cả buổi: …".
- Truy vấn tổng hợp hoàn toàn bằng SQL (CTE `flag`, `count(*) filter (...)`, `group by`), `tenantSql` trên buổi, phạm vi cơ sở theo quyền `report_card:read`
  (không tính quyền `_own`). Nhắc GV cần `report_card:approve` tại cơ sở của buổi; ghi nhật ký `portfolio_reminders` trong transaction.
- **Hồ sơ từng HV** (`/ho-so-hoc-tap/<id>`): dải **"Mức đạt chuẩn hồ sơ"** — x/y buổi đủ phiếu, đúng hạn, có ảnh / sản phẩm, học bạ mốc đúng hạn, điểm tổng hợp.
  **Chỉ nhân sự** (`print:hidden`; không có ở cổng phụ huynh, link chia sẻ hay bản in / PDF).
- API: `portfolio.standard.{board, options, remind, student}`.

## 16. Quy trình hiệu chuẩn người chấm (gợi ý mỗi quý)

Mô tả mức chỉ giúp chấm nhất quán khi mọi GV **hiểu mô tả giống nhau**. Đào tạo tổ chức một buổi hiệu chuẩn ~60 phút mỗi quý (và khi có GV mới):

1. **Chuẩn bị**: chọn **3 sản phẩm mẫu** của học viên (ảnh / video ngắn + chương trình) ở 3 trình độ khác nhau, cùng một bài có tiêu chí trọng tâm.
2. **Chấm độc lập**: mỗi GV chấm riêng cả 3 sản phẩm theo rubric (phiếu giấy in bảng rubric của drawer *Tiêu chí đánh giá*), không trao đổi.
3. **So lệch**: tổng hợp bảng tiêu chí × GV; đánh dấu ô lệch ≥ 2 mức, hoặc tiêu chí có < 70% GV cho cùng mức.
4. **Thảo luận**: với từng ô lệch, mỗi GV nêu **hành vi quan sát được** khiến mình chọn mức đó; đối chiếu câu mô tả mức.
5. **Thống nhất**: sửa câu mô tả mức mơ hồ trong drawer *Tiêu chí đánh giá* (ghi rõ hành vi, bỏ từ cảm tính); lưu 3 sản phẩm mẫu + mức đã thống nhất làm **ví dụ neo**.
6. **Theo dõi**: quý sau so tỷ lệ đồng thuận; kết hợp bảng *Quản lý hồ sơ học tập* theo GV để phát hiện GV luôn chấm lệch cao / thấp so với lớp cùng khoá.

Phiếu đã phát hành giữ bản chụp mô tả mức cũ — thay đổi sau hiệu chuẩn chỉ áp cho phiếu mới.
