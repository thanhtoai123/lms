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

## 11. Hướng mở rộng

- Gửi thông báo cho phụ huynh khi phiếu buổi được phát hành (gộp vào thông báo "buổi học đã hoàn tất" hiện có).
- Cấu hình rubric / mô tả mức theo từng khoá (bảng cấu hình + bản chụp như hiện nay).
- Học sinh tự đánh giá (self-assessment) trên cùng rubric để so với đánh giá của giáo viên.
- Đính kèm tệp dự án (mã nguồn, video ngắn) làm bằng chứng, không chỉ ảnh.
