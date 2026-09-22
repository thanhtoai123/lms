# Giấy chứng nhận & lộ trình học

> Tóm tắt: trung tâm ghép các khoá thành **lộ trình học**; học viên hoàn thành (đã được duyệt) mọi khoá bắt buộc
> thì đủ điều kiện nhận **giấy chứng nhận hoàn thành lộ trình**. Giấy in theo **mẫu thiết kế trên Canva** (ảnh nền +
> các ô chữ kéo-thả), mỗi giấy có **mã QR** dẫn tới trang xác thực công khai `/cn/<token>`.

## 1. Vì sao là "chứng nhận", không phải "chứng chỉ"

Theo pháp luật giáo dục Việt Nam, **văn bằng, chứng chỉ** là giấy tờ thuộc **hệ thống giáo dục quốc dân**, do cơ sở /
cơ quan có thẩm quyền cấp theo chương trình được phê duyệt (Luật Giáo dục 2019, Điều 12). Trung tâm ngoài công lập
dạy kỹ năng STEM / Robotics cho trẻ **không cấp chứng chỉ**; cái trung tâm cấp là **giấy chứng nhận hoàn thành**
khoá / lộ trình — xác nhận học viên đã tham gia và đạt yêu cầu của chính trung tâm.

Vì vậy:

- Mọi chữ hiển thị cho người dùng, thông báo lỗi, menu, nhãn quyền, tài liệu, dữ liệu mẫu dùng **"chứng nhận"**.
  Riêng "chứng chỉ chuyên môn" của **giáo viên** (bằng cấp bên ngoài của nhân sự) và các tài liệu khảo sát nguyên văn
  hệ cũ (`docs/NGHIEP-VU-GOC.md`, `docs/KHAO-SAT-GOC-2.md`, `docs/admin-survey.raw.json`) giữ nguyên.
- Tên cột / bảng / định danh mã nguồn cũ (`course_completions.certificate_no`, `certificateNo`…) **giữ nguyên** để
  không phải di chuyển dữ liệu — chỉ đổi chữ hiển thị và chú thích.
- Trang in cũ `/hoan-thanh-khoa/chung-chi/[id]` **chuyển hướng** sang `/hoan-thanh-khoa/chung-nhan/[id]`.
- Chân trang xác thực ghi rõ: *"không phải văn bằng, chứng chỉ thuộc hệ thống giáo dục quốc dân"*.

## 2. Các trường dữ liệu theo 1EdTech Open Badges 3.0

Open Badges 3.0 là chuẩn chứng nhận số phổ biến nhất hiện nay. Ta không ký mật mã (không phát hành
Verifiable Credential), nhưng giữ đủ **bộ trường tối thiểu** để một người thứ ba đối chiếu được giấy in:

| Open Badges 3.0 | Ở hệ thống | Nguồn |
|---|---|---|
| `achievement.name` — tên thành tích | Tên lộ trình / tên khoá | `snapshot.pathName` |
| `achievement.description` | Mô tả lộ trình | `snapshot.description` |
| `achievement.criteria.narrative` — tiêu chí đạt | **Điều kiện đạt** (soạn ở lộ trình, ≤ 600 ký tự) | `learning_paths.criteria_text` → `snapshot.criteriaText` |
| `issuer` — đơn vị cấp (tên, liên hệ) | Pháp nhân / trung tâm + tên cơ sở, địa chỉ, SĐT cơ sở | `tenants`, `centers` |
| `credentialSubject` — người nhận | Họ tên học viên | `snapshot.studentName` |
| `validFrom` — ngày cấp | Ngày cấp (giờ Việt Nam) | `certificates.issued_at`, `snapshot.issuedDate` |
| `id` — mã định danh duy nhất | Số chứng nhận `CN-<cơ sở>-<yy>-<6 số>` (+ id UUID) | `certificates.number` |
| `evidence` — bằng chứng | Liên kết **hồ sơ học tập** (chỉ khi có link chia sẻ còn hiệu lực) | `portfolio_shares` |
| cách xác thực | Trang công khai `/cn/<verify_token>` qua mã QR | `certificates.verify_token` |

## 3. Dữ liệu

Migration: `packages/db/sql/0012_chung_nhan_lo_trinh.sql` (idempotent) — schema Drizzle `packages/db/src/schema/certificates.ts`.

| Bảng | Nội dung |
|---|---|
| `learning_paths` | `code` (duy nhất trong tenant, IN HOA), `name`, `description`, `criteria_text`, `certificate_template_id`, `is_active` |
| `learning_path_courses` | `path_id`, `course_id`, `seq`, `required`; duy nhất `(path_id, course_id)` |
| `certificate_templates` | `name`, `orientation` (landscape/portrait), `background_key`, `width_px`, `height_px`, `fields` JSONB, `is_default` (tối đa một / tenant), `is_active` |
| `certificates` | `kind` path/course, `learning_path_id` / `course_completion_id`, `student_id`, `center_id`, `template_id`, `number` (duy nhất), `verify_token` (duy nhất), `issued_at/by`, `status` valid/revoked, `revoked_at/by`, `revoke_reason`, `snapshot` JSONB |

Ràng buộc đáng chú ý:

- Một học viên chỉ có **một** chứng nhận còn hiệu lực cho mỗi lộ trình (chỉ mục duy nhất một phần), và một cho mỗi hoàn thành khoá.
- Thu hồi bắt buộc mốc + lý do ≥ 5 ký tự; chứng nhận đã thu hồi **không khôi phục** được (cấp mới).
- Trigger `certificates_immutable`: sau khi cấp, **không sửa** được số, token, người nhận, ngày cấp, bản chụp — chỉ thu hồi.
- `fill_tenant_id` + chỉ mục tenant + chính sách RLS như các bảng khác; `assert_center_tenant` cho `certificates`.
- **Backfill**: mỗi `course_completions` đã duyệt có `certificate_no` → một dòng `certificates` `kind='course'` **giữ nguyên số cũ**
  (SR-…), token xác thực mới, bản chụp dựng từ dữ liệu hiện có. Chạy lại không nhân đôi.
- Mỗi trung tâm chưa có mẫu nào được tạo sẵn **mẫu mặc định** dùng nền dựng sẵn `builtin/sata-mac-dinh.svg`.

Từ nay, mỗi lần **duyệt hoàn thành khoá** (`reportCards.issueCompletion`) cũng tạo luôn dòng `certificates` kind='course'
trong cùng transaction — giấy hoàn thành khoá cũng có QR xác thực và in được theo mẫu.

## 4. Luật thuần (packages/core/src/certificates/rules.ts)

- `pathProgress(pathCourses, completions, activeCourseIds)` — mỗi khoá: *Đã hoàn thành* (chỉ bản ghi **đã duyệt, chưa thu hồi**) /
  *Đang học* (có ghi danh mở) / *Chưa học*; `%` tính trên khoá bắt buộc; `eligible` khi mọi khoá bắt buộc đã hoàn thành.
  Lộ trình không đánh dấu khoá bắt buộc nào thì cần **mọi** khoá.
- `pathCertificateNumber("CS1", 2026, 12)` → `CN-CS1-26-000012`; `nextCertificateSeq`; sinh số trong transaction có
  `pg_advisory_xact_lock` theo tiền tố (cơ sở + năm) nên cấp song song không trùng số.
- `formatIssuedDate(iso, "dmy" | "long", place?)` — `22/09/2026` hoặc `ngày 22 tháng 9 năm 2026`; theo thể thức
  Nghị định 30/2020/NĐ-CP: ngày < 10 và tháng 1, 2 thêm số 0 (`ngày 05 tháng 01 năm 2026`); có thể đặt địa danh phía trước.
- `normalizeTemplateFields` / `validateTemplateFields` — toạ độ 0–100 % của khung, ô không tràn mép phải, cỡ chữ 6–144 pt, màu `#rrggbb`…
- `buildCertificateSnapshot` — chụp **mọi chữ đã in** (tên HV, tên lộ trình, ngày, xếp loại, điều kiện đạt, cơ sở, người ký, dòng tuỳ ý):
  in lại luôn giống bản gốc dù sau này đổi tên lộ trình, người ký hay học viên đổi tên.
- `readImageSize` / `backgroundWarnings` — đọc kích thước PNG / JPEG từ đầu tệp, cảnh báo lệch khổ A4 hoặc dưới 150 dpi.

Test: `packages/core/src/certificates/rules.test.ts`.

## 5. Hướng dẫn thiết kế mẫu trên Canva

1. Tạo thiết kế **A4 ngang (297 × 210 mm)** — hoặc cỡ tuỳ chỉnh **3508 × 2480 px** (300 dpi). Mẫu dọc: 2480 × 3508 px.
2. Vẽ khung, logo, chữ **"GIẤY CHỨNG NHẬN"**, hoạ tiết… lên nền.
3. **Để trống** các vị trí sẽ do hệ thống in: tên học viên, tên lộ trình / khoá, điều kiện đạt, ngày cấp, chữ ký + tên người ký,
   số chứng nhận, **mã QR** (chừa ô vuông ≥ 2,5–3 cm, nền sáng, gần mép dưới).
4. **Tải xuống → PNG**, chất lượng cao nhất, **không** chọn nền trong suốt. Dung lượng ≤ 15 MB (JPG cũng được).
5. Vào **Lộ trình học & chứng nhận → Mẫu giấy chứng nhận → Tạo mẫu mới → Tải ảnh nền**. Hệ thống kiểm tra *magic bytes*
   (chặn tệp SVG / HTML đội lốt ảnh) và báo nếu ảnh lệch khổ A4 hoặc độ phân giải thấp.
6. Kéo các ô vào đúng chỗ trống; kéo tay nắm góc phải-dưới để đổi rộng (QR giữ hình vuông); phím mũi tên dịch 0,25 % (Shift: 1 %).
   Chỉnh cỡ chữ (pt khi in), đậm, nghiêng, màu, căn lề, IN HOA, phông (**Be Vietnam Pro** đã có sẵn trong dự án, hoặc
   phông có chân / không chân của hệ thống — **không nạp phông ngoài** vì chính sách CSP).
7. Bấm **Xem thử với dữ liệu mẫu** để xem đúng như bản in (kèm mã QR mẫu do máy chủ sinh), rồi **Lưu mẫu**. Đặt làm mặc định nếu cần.

Toạ độ lưu theo **% khung**, cỡ chữ lưu theo **pt khi in A4** và hiển thị bằng đơn vị `cqw` (khung đặt `container-type: inline-size`)
— nên trình dựng, xem thử và bản in khớp nhau ở mọi độ phân giải.

## 6. Quy trình

**Cấp**: `/lo-trinh` → chọn lộ trình → khung *Học viên* có ba nhóm: **Đủ điều kiện – chưa cấp** / **Đã cấp** / **Đang học (x/y khoá)**.
Tick các em ở nhóm đầu → *Cấp chứng nhận*. Máy chủ **tính lại điều kiện**, bỏ qua em chưa đủ điều kiện hoặc đã có chứng nhận
còn hiệu lực (trả lý do), cấp tất cả trong **một transaction**, ghi nhật ký. Quyền `completion:approve` tại cơ sở của học viên.

**In**: tick nhiều em ở nhóm *Đã cấp* → *In N giấy* (hoặc từ hồ sơ học viên, hoặc từ trang hoàn thành khoá) →
`/lo-trinh/in-chung-nhan?ids=…`: mỗi giấy **một trang A4** đúng hướng mẫu, `@page { size: A4 landscape; margin: 0 }`
(trang có tên `cn-landscape` / `cn-portrait` nên một lệnh in trộn được mẫu ngang và dọc), ảnh nền phủ kín trang,
`print-color-adjust: exact`. Bấm **In / Lưu PDF** (`window.print()`); trong hộp thoại in chọn *Lề: Không* và bật *Đồ hoạ nền*.

**Thu hồi**: ở nhóm *Đã cấp* → *Thu hồi* (bắt buộc lý do ≥ 5 ký tự). Trang xác thực hiện **"Đã thu hồi" kèm ngày**; bản in lại
có dấu "ĐÃ THU HỒI". Thu hồi chứng nhận khoá cũng đánh dấu `course_completions.revoked_at`.

**Xác thực**: người nhận giấy (phụ huynh, trường, ban tổ chức cuộc thi) quét QR → `/cn/<token>`: trạng thái **Hợp lệ / Đã thu hồi**,
tên thành tích, điều kiện đạt, người nhận, ngày cấp, số chứng nhận, đơn vị cấp (tên cơ sở + địa chỉ + SĐT **cơ sở**), và nút
**Xem hồ sơ học tập** *chỉ khi* học viên đang có link chia sẻ hồ sơ còn hiệu lực.

**Hồ sơ học tập**: mục *Giấy chứng nhận* liệt kê cả chứng nhận khoá và lộ trình (có liên kết *Xác thực*).

## 7. Bảo mật

- **Token QR**: 32 byte ngẫu nhiên (`crypto.randomBytes`) mã hoá base64url (43 ký tự, ràng buộc CSDL `^[A-Za-z0-9_-]{32,80}$`).
  QR trỏ tới **token**, không trỏ số chứng nhận — số tăng dần nên đoán được. Backfill dùng 64 ký tự hex từ hai UUID ngẫu nhiên.
- **Kiểm định dạng trước khi chạm CSDL** (regex token), **trần tần suất** theo IP dùng chung giữa các bản sao
  (`certificateVerifyIp`: 120 lần / 15 phút, nới bằng `RATE_LIMIT_CERTIFICATE_VERIFY_IP_MAX`).
- `robots: noindex, nofollow, nocache` + `referrer: no-referrer`; trang công khai **không** hiện SĐT / email phụ huynh, ngày sinh,
  mã học viên, lý do thu hồi, người cấp.
- **Ảnh nền**: chỉ PNG / JPG ≤ 15 MB, soi *magic bytes* + chặn nội dung có mã kịch bản (`checkImageUpload`), lưu kho tệp riêng,
  phát lại qua **URL có chữ ký, có hạn** (`/api/media/file`, `Content-Security-Policy: sandbox`). Nền SVG chỉ dành cho nền
  **dựng sẵn** do máy chủ phát (`apps/web/public/mau-chung-nhan/`), không nhận SVG tải lên.
- Mã QR là SVG do **máy chủ** sinh bằng bộ sinh QR thuần TypeScript sẵn có (`packages/core/src/qr/encode.ts`) — không thêm thư viện.
- Mọi thủ tục: `tenantCond` khi liệt kê, `assertTenant` khi nạp theo id, `writeAudit` trong cùng transaction.

## 8. Quyền

| Việc | Quyền |
|---|---|
| Xem lộ trình, mẫu | `course:read` (hoặc `completion:read` / `enrollment:read`) |
| Tạo / sửa lộ trình, mẫu, tải ảnh nền, đặt mặc định | `course:update` |
| Xem học viên theo lộ trình, xem / in giấy | `enrollment:read` hoặc `completion:read` tại cơ sở |
| Cấp, thu hồi | `completion:approve` tại cơ sở của học viên / giấy |

## 9. Xem thử (dữ liệu mẫu)

Sau `pnpm db:push && pnpm db:apply-sql && pnpm db:seed`:

- Quản trị: đăng nhập `superadmin@example.test` → **LMS / Học liệu → Lộ trình học & chứng nhận** (`/lo-trinh`), lộ trình mẫu
  `LT-ROBO-NT` "Lộ trình Robotics nền tảng" (Sata1 → Sata4 bắt buộc, Sata6 tuỳ chọn): Học viên mẫu 12, 13 *đủ điều kiện*,
  Học viên mẫu 11 *đã cấp*, Học viên mẫu 14 và lớp Sata4 đang chạy ở nhóm *đang học*.
- Mẫu: `/lo-trinh/mau-chung-nhan` (mẫu mặc định nền dựng sẵn).
- Xác thực công khai (không cần đăng nhập): `/cn/xem-thu-giay-chung-nhan-sata-robo-mau` — lệnh seed in đường dẫn đầy đủ ở cuối.
