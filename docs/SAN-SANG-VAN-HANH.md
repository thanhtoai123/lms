# Sẵn sàng vận hành — đánh giá trước khi đi vào hoạt động thật

_Lập 26/09/2026. Đối chiếu `docs/LO-TRINH-HOAN-THIEN.md` (lập 18/09) với **mã nguồn thật hôm nay**,
không dựa vào ô tick trong tài liệu. Mọi khẳng định dưới đây đều kèm tệp làm bằng chứng._

## 0. Kết luận một dòng

> **Cập nhật 27/09:** các lỗi mã nguồn ở mục 2–4 và 6 đã sửa xong, kèm rà soát tấn công — xem **mục 0b**. Phần còn lại là bốn việc của chủ hệ thống (nơi chạy, kho tệp, Zalo, hoá đơn điện tử). Nội dung từ mục 1 trở đi giữ nguyên làm hồ sơ đánh giá ban đầu (26/09).

**Chưa vào hoạt động thật được.** Phần mềm đã đủ chức năng — 929 trang qua kiểm tra menu, 209 kịch
bản nghiệp vụ đạt — nhưng **nền để đặt nó lên thì chưa có**, và ba lỗi dưới đây sẽ **hỏng hoặc lộ
dữ liệu thật** ngay trong tuần đầu.

Khoảng cách không nằm ở tính năng. Nằm ở: **nơi cất tệp, môi trường chạy, và ba lỗi dữ liệu**.

## 0b. Cập nhật 27/09/2026 — sau đợt hoàn thiện cuối

**Phần mã nguồn: đã đóng toàn bộ các lỗi chặn go-live nêu ở mục 2–4 và 6.** Việc còn lại để vào
hoạt động thật **không còn nằm trong mã** mà ở bốn quyết định / hợp đồng của chủ hệ thống (cuối mục này).

### Đã sửa — kèm bằng chứng kiểm được

| Mục | Đã làm | Kiểm bằng |
|---|---|---|
| 2.1 PII nhập cũ | `migrate-legacy` dùng chung `dongHop/moHop` (core) với ứng dụng; mã hoá xong mở lại, lệch là dừng | `core/security/hopKin.test.ts`, `api/services/pii.test.ts` |
| 2.2 SĐT trùng | `phone_normalized` + chỉ mục duy nhất (sql 0017); `pnpm sdt-trung [--gop]` | PC: 151 dòng, 0 trùng; chỉ mục đã tạo |
| 2.3 Nghỉ dạy mất buổi | Duyệt đơn `class_off` đi đường huỷ buổi chính (`cancelSessionInTx`): dời bù + lùi nhịp | Bộ E: E20–E23 |
| 3 Lộ tài chính chéo | Công nợ / Thiếu học phí / Công nợ ghi danh / Hoa hồng: tổng gồm cả nhượng quyền, **danh sách chỉ dòng được xem chi tiết + che PII** | Bộ E: E10–E13 |
| 3 RLS chết | `refunds`, `commissions` có `tenant_id` (sql 0018); middleware `DB_RLS=on`; `pnpm rls-kiem` chạy trên CSDL thật rồi hoàn tác | PC: rls-kiem **tất cả đạt**, kể cả chặn ghi dòng trung tâm khác |
| 3 Đóng trung tâm là giả | Tạm ngừng / đóng: đọc được, **không ghi được**; chỉ Hội sở đổi trạng thái | Bộ E: E15–E19 |
| 4.1 Kho tệp | Bộ chuyển S3/R2 (SigV4 viết tay, không thêm thư viện); `/van-hanh` báo **nguy hiểm** nếu chạy thật trên đĩa | `kho/sigv4.test.ts`, `kho.test.ts` |
| 4.3 Không biết khi lỗi | Theo dõi lỗi tự chứa: gom theo vân tay, ghi từ tRPC + `instrumentation.onRequestError` + worker; bảng ở `/van-hanh` | `core/ops/loiMayChu.test.ts`, E24 |
| 4.5 `.env.example` | Bổ sung 19 biến + `DB_RLS`, `SCORM_ORIGIN`, `TRUSTED_PROXY_HOPS`, `S3_*` | so khớp `process.env.*` toàn kho |
| 6 Mẫu test api | `src/**/*.test.ts` | PC: api 31/31 |
| KT-03 | Nút "Chạy lại" hàng đợi chết ở `/van-hanh`, có nhật ký | — |
| KT-06 | Thiếu học phí: bỏ 3 truy vấn con tương quan, phân trang 100 | E14 |
| KT-12 / KT-13 | `/tich-hop` nói đúng kho đếm; form công khai dùng trần chung (bảng `rate_limits`) | E09 |

### Rà soát tấn công (đọc mã + kiểm thử chạy thật)

Đã rà: XSS lưu trữ, chuyển hướng mở, SSRF, IDOR cổng phụ huynh, route công khai, phục vụ tệp,
PII trong log, xác thực phiên, gán thuộc tính hàng loạt, chèn SQL. Tìm được và **đã sửa**:

| Mức | Lỗ hổng | Sửa |
|---|---|---|
| Cao | Gói SCORM (JavaScript người dùng tải lên) chạy **cùng miền** quản trị → người có quyền tải học liệu cài mã tự cấp quyền, chờ Super Admin mở xem | `SCORM_ORIGIN`: phát trên miền học liệu riêng; cầu nối `window.name`/`postMessage` thay `window.parent.API`; miền đó không phục vụ trang/API |
| Cao | Route tải lên / tải xuống **bỏ qua xác thực 2 lớp** (chỉ tRPC kiểm) | `routeContext` bắt buộc 2 lớp như tRPC |
| TB | Chuyển hướng mở sau đăng nhập (`/\evil.com`, tab/xuống dòng) | `duongNoiBo` dùng chung cho login, thông báo phụ huynh, markdown |
| TB | Giả `X-Forwarded-For` để lách mọi trần theo IP; form công khai đếm trong bộ nhớ một tiến trình | `ipTuHeader` lấy phần proxy nối (`TRUSTED_PROXY_HOPS`); trần chung trong Postgres |
| TB | Link bài nộp loại khác không kiểm → hiện thành liên kết cho giáo viên | luôn phải http/https |
| Thấp | Ghi nhật ký "đăng xuất" từ token chưa kiểm chữ ký; SSRF vào địa chỉ siêu dữ liệu đám mây qua cổng Zalo; nonce không kiểm | chỉ ghi khi token thật; chặn 169.254.x / metadata, không theo chuyển hướng; kiểm nonce |
| — | Trạng thái trung tâm đi chung cổng với tuỳ chọn riêng tư → nhượng quyền tự "mở lại" được | chỉ Super Admin Hội sở đổi trạng thái |

Đã kiểm và **ổn**: markdown/tin tức escape trước; mọi đọc theo con ở cổng phụ huynh đều kiểm quan hệ
giám hộ; phiên phụ huynh băm + cookie `__Host-`; tài khoản mẫu luôn tắt ở production; token nhân sự
kiểm ở máy chủ (`auth.getUser`); OTP `crypto.randomInt` + so khớp hằng thời gian; URL ký HMAC có hạn;
webhook kiểm chữ ký hằng thời gian; không `sql.raw` với dữ liệu người dùng; zod bỏ khoá lạ.

Bộ kiểm thử mới **bộ E** (`kich-ban-toan-dien.ps1 -Only tan-cong`, 24 bài): CSRF, sai phương thức,
token giả, chèn SQL, lỗi không lộ cấu trúc, thân 3MB, giả IP, cộng các hồi quy ở bảng trên.

### Việc của chủ hệ thống — mã không làm thay được

1. **Chọn nơi chạy + tên miền** (xem khuyến nghị dưới). Cần **hai tên miền con**: quản trị
   (vd `admin.…`) và học liệu (vd `hoc-lieu.…`, trỏ cùng ứng dụng) cho `SCORM_ORIGIN`.
2. **Kho đối tượng** S3/R2: tạo bucket + khoá, điền 4 biến `S3_*`.
3. **Zalo**: duyệt mẫu ZNS; khai token OA ở `/tich-hop`.
4. **Hoá đơn điện tử**: ký hợp đồng nhà cung cấp, điền `EINVOICE_API_URL/KEY`.

Sau khi có môi trường: chạy `pnpm db:apply-sql` → `pnpm rls-kiem` (phải đạt) →
`SELECT satarobo_rls_enable();` → đặt `DB_RLS=on` → mở `/van-hanh`, **mọi mục phải xanh**.

### Khuyến nghị nơi chạy

Luật Bảo vệ dữ liệu cá nhân có hiệu lực từ 01/01/2026: đưa dữ liệu cá nhân (ở đây là **dữ liệu trẻ
em**, nhóm nhạy cảm) ra nước ngoài phải lập và nộp hồ sơ đánh giá tác động chuyển dữ liệu; vi phạm bị
phạt tới hàng tỷ đồng. Vì vậy thứ tự khuyến nghị:

| Phương án | Chi phí tham khảo | Công vận hành | Dữ liệu cá nhân |
|---|---|---|---|
| **A. Máy chủ ảo tại Việt Nam** (Postgres + ứng dụng + worker trên 1–2 máy, sao lưu ra kho đối tượng trong nước) — **khuyến nghị** | vài trăm nghìn – ~2 triệu đ/tháng tuỳ cấu hình | Cao nhất: tự vá hệ điều hành, tự giám sát; có sẵn `scripts/ops/backup.sh` | Ở trong nước — đơn giản nhất về pháp lý |
| B. Vercel Pro + Supabase Pro | ~20 USD/người phát triển/tháng + 25 USD/tháng, chưa tính vượt mức | Thấp | Ở nước ngoài (vd Singapore) → **phải làm hồ sơ chuyển dữ liệu ra nước ngoài** |
| C. Kết hợp: ứng dụng ở Vercel, CSDL + kho tệp ở Việt Nam | B + A (phần CSDL) | Trung bình; độ trễ giữa hai nơi làm trang chậm hơn | Vẫn có dữ liệu đi qua máy chủ nước ngoài → vẫn nên có hồ sơ |

Với phương án A: worker chạy như dịch vụ hệ thống (`pnpm worker`), cron `scripts/ops/backup.sh` mỗi
đêm, và **phục hồi thử một lần** bằng `restore.sh` trước ngày mở (mục 8.3). Giá cụ thể phụ thuộc nhà
cung cấp — nên lấy báo giá 2–3 nơi. Đây là thông tin tham khảo, không phải tư vấn pháp lý: nên hỏi
luật sư về hồ sơ chuyển dữ liệu nếu chọn B hoặc C.

## 1. Ba cửa phải qua

Đừng đọc danh sách 32 mục KT- như một hàng dài. Chúng rơi vào đúng ba cửa, và chỉ cửa 1–2 chặn go-live:

| Cửa | Câu hỏi | Tình trạng |
|---|---|---|
| **1. Dữ liệu không hỏng, không mất** | Nhập dữ liệu cũ vào có nguyên vẹn không? Tệp tải lên có còn sau khi triển khai không? | ❌ **Hỏng** — 3 lỗi dưới |
| **2. Dữ liệu không lộ ra ngoài tổ chức** | Trung tâm nhượng quyền A có thấy tiền của B không? | ❌ **Hở hai lớp** |
| **3. Vận hành được khi có sự cố** | Hỏng thì ai biết? Mất dữ liệu thì lấy lại từ đâu? | ⚠️ **Một nửa** |

## 2. Ba lỗi hỏng dữ liệu — phải sửa trước khi nhập dữ liệu thật

### 2.1 Nhập dữ liệu cũ làm hỏng CCCD và địa chỉ phụ huynh, **không báo lỗi**

Đây là lỗi nặng nhất và **không có mã KT- nào phụ trách**, nghĩa là không ai đang làm.

Hai bên mã hoá PII theo hai cách hoàn toàn khác nhau:

| | `scripts/migrate-legacy/src/index.ts:29-37` | `packages/api/src/services/pii.ts:9-55` |
|---|---|---|
| Tên biến | `ENCRYPTION_KEY` | `PII_ENCRYPTION_KEY` |
| Khoá | dùng thẳng, hex 32 byte | `sha256("pii\|" + secret)` |
| Định dạng | `<iv>.<tag>.<ct>` — hex, dấu chấm | `v1:<iv>:<tag>:<ct>` — base64url, dấu hai chấm |

`openPii()` gặp chuỗi kiểu cũ thì `v !== "v1"` → **`return null` lặng lẽ**. Không ném lỗi, không ghi
nhật ký. Nghĩa là: nhập xong, mọi thứ trông bình thường, đến khi kế toán cần CCCD phụ huynh để xuất
hoá đơn thì ô đó trống — và bản gốc ở hệ cũ có thể đã ngừng dùng.

**Sửa**: cho `migrate-legacy` gọi thẳng `sealPii()` của `@satarobo/api` thay vì tự mã hoá. Nửa ngày.
Kèm một kiểm thử: mã hoá bằng script, giải mã bằng ứng dụng, phải ra đúng chuỗi ban đầu.

### 2.2 `parents.phone` không unique → phụ huynh trùng số **không đăng nhập được**

`packages/db/src/schema/people.ts:44-68` khai bảng `parents` **không có một chỉ mục nào**; `phone`
chỉ `notNull()`. Trong khi đó `packages/api/src/services/parentPortal.ts:31-32` tìm phụ huynh bằng:

```ts
const rows = await d.select()...limit(2);
if (rows.length !== 1) return null;   // hai dòng cùng số → coi như không có
```

Dữ liệu hệ cũ gần như chắc chắn có số trùng (bố và mẹ khai cùng số, nhập hai lần). Hệ quả: phụ
huynh đó **không vào được cổng `/ph`, không nhận được thông báo**, và không hiểu vì sao.

Thứ tự bắt buộc: **dọn trùng → thêm unique → rồi mới nhập dữ liệu thật**. Làm sau là sửa dữ liệu
sản xuất, đắt hơn nhiều. `upsertParent` (`services/students.ts:391`) cũng phải đổi sang `ON CONFLICT`.

### 2.3 Duyệt đơn "Nghỉ buổi dạy" làm lớp **mất buổi**

`packages/api/src/services/hrSessionEffects.ts:34` đặt buổi thành `cancelled` rồi dừng: không sinh
buổi thay thế, không dời ngày kết thúc dự kiến, không báo phụ huynh. Sai dây chuyền sang: số buổi
còn lại, cảnh báo "sắp hết khoá", và **mẫu số của `refundProposal` — tức là tính sai tiền hoàn**.

Chú thích ở đầu tệp ghi `TODO(Đợt 3)` với lý do *"nhánh này chưa có `sessionChanges.ts`"* — nhưng
tệp đó **đã có** (`services/sessionChanges.ts:132` có `cancelSession` làm đúng việc). Một chú thích
lạc hậu đang giữ nguyên một lỗi dữ liệu. Chỉ cần cho `hrRequests` đi qua đường chính.

## 3. Hai lớp chống lộ dữ liệu — **cùng hở**

Hệ thống thiết kế hai lớp: lọc ở tầng dịch vụ, và RLS ở Postgres đỡ phía sau. Hôm nay **cả hai đều
không hoạt động** ở phần tài chính:

- **Tầng dịch vụ**: 4 màn tài chính chỉ lọc theo *cơ sở*, không theo *tenant* —
  `services/finance.ts:1419` (Công nợ), `:1493` (Thiếu học phí), `:1643` (Công nợ ghi danh),
  `services/commissions.ts:115` (Hoa hồng). Hai bảng `refunds` và `commissions` thậm chí **không có
  cột `tenantId`** (`schema/finance.ts:308, 527`).
- **Tầng CSDL**: `packages/db/sql/0009_rls_tenant.sql` đã viết xong chính sách, `packages/db/src/rls.ts`
  có `withTenantSession` / `withAdminSession` — nhưng **không một nơi nào trong kho gọi hai hàm này**.
  Lớp phòng thủ cuối là mã chết.

Với mô hình nhượng quyền, đây không phải lỗi phân quyền nội bộ mà là **lộ dữ liệu ra ngoài tổ chức**.

Cùng nhóm: `packages/api/src/trpc.ts:79-84` không kiểm trạng thái tenant, nên **đóng hay tạm ngưng
một trung tâm là hành vi giả** — nhân sự tenant đó vẫn ghi đơn, thu tiền, điểm danh bình thường.

## 4. Nền để đặt hệ thống lên — chưa có

### 4.1 Kho tệp: **chưa có S3/R2** (nặng nhất về hậu quả)

`packages/api/src/storage.ts` chỉ biết ghi ra đĩa cục bộ; chú thích dòng 8 vẫn ghi *"Production: thay
bằng R2/S3"*. Trong kho không có một dòng `S3_`, `R2_` hay `SigV4` nào.

Hậu quả tuỳ nơi triển khai, cả hai đều xấu:

- **Vercel** (đã có sẵn `apps/web/vercel.json`): đĩa là tạm thời → **mọi ảnh lớp, tài liệu, CV, bài
  nộp bay sau mỗi lần triển khai.**
- **Tự dựng máy chủ**: toàn bộ kho tệp nằm trên một ổ đĩa không nhân bản.

Việc này phải xong **trước khi dựng môi trường thật**, không phải trước ngày go-live.

### 4.2 Không có môi trường thật, không có `Dockerfile`

Cả kho chỉ có `docker-compose.yml` cho **Postgres dev** (cổng 5433, mật khẩu `postgres/postgres`).
Không có manifest triển khai nào. Nghĩa là chưa có chỗ để đặt: HTTPS và tên miền, Chromium cho kết
xuất PDF, worker chạy như dịch vụ, lịch cron sao lưu. `docs/CHECKLIST-DOI-SANH.md:100` tự khai đúng
điều này.

### 4.3 Không ai biết khi hệ thống lỗi

Không có Sentry hay bất kỳ dịch vụ theo dõi lỗi nào (tìm `sentry` toàn kho: 0 kết quả). Lỗi 500 ở
môi trường thật chỉ nằm trong stdout của tiến trình: **không cảnh báo, không stack trace, không biết
bao nhiêu người bị ảnh hưởng**. Với 5 nhóm vai trò dùng thật, đây là chạy mù. Cũng **không có mã KT-
nào phụ trách**.

Phần đã tốt, ghi nhận: `/api/health` và `/api/ready` (có đo tồn đọng outbox), nhật ký che PII/SQL
(`core/security/log.ts`), ghi lại thủ tục chậm kèm số truy vấn để bắt N+1 (`trpc.ts:66-75`).

### 4.4 Sao lưu: script tốt, **chưa lên lịch**

`scripts/ops/backup.sh` + `restore.sh` làm đúng bài: `pg_dump -Fc`, gói kèm `STORAGE_DIR`, giữ 14
ngày, phục hồi có chốt xác nhận và đếm lại số bản ghi. `/van-hanh` chấm độ tươi bản sao (ngưỡng 26
giờ). **Còn thiếu**: chưa có cron thật chạy nó, chưa có bản để ngoài máy chủ, chưa mã hoá at-rest.
Một bản sao chỉ là bản sao khi đã **phục hồi thử thành công một lần** — `restore.sh` có ghi
`restoreTestedAt`, hãy dùng.

### 4.5 `.env.example` thiếu 18 biến mà mã nguồn thật đọc

Nguồn sự thật về biến môi trường là `packages/core/src/ops/rules.ts:9-41`, **không phải**
`.env.example`. Ai triển khai mà đọc `.env.example` sẽ **bỏ sót toàn bộ Web Push, SMS dự phòng và
hoá đơn điện tử**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SMS_API_URL`,
`SMS_API_KEY`, `ZNS_API_URL`, `EINVOICE_API_URL`, `EINVOICE_API_KEY`, `EINVOICE_ALLOW_SANDBOX`,
`DELIVERY_ALLOW_SANDBOX`, `PDF_RENDERER`, `PDF_CHROME_PATH`, `PDF_CHROME_CHANNEL`,
`PDF_RENDER_BASE_URL`, `PORTFOLIO_SHARE_DAYS`, `TRIAL_REPORT_SHARE_DAYS`, `GA4_API_SECRET`,
`ZALO_OAUTH_URL`.

Bắt buộc ở môi trường thật (thiếu thì `/van-hanh` đỏ): `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`,
`MEDIA_SIGNING_SECRET` (≥32), `OTP_PEPPER` (≥16), `CRON_SECRET` (≥24), `STORAGE_DIR`, và
`ALLOW_DEV_ACTOR` **phải tắt**.

Lưu ý riêng: **token Zalo OA không để trong `.env`** — access token sống 25 giờ, refresh token dùng
một lần, phải khai ở màn `/tich-hop` (`docs/VAN-HANH.md:89-101`).

## 5. Ba đường nối ra ngoài **chưa từng chạy thật**

Không phải lỗi, nhưng không được nhầm là đã xong:

| Đường | Tình trạng | Việc còn lại |
|---|---|---|
| **ZNS / SMS** | `services/delivery.ts:57-79` còn nhánh giả lập; production đã chặn đúng cách | Zalo duyệt mẫu ZNS, chạy thử với số thật |
| **Hoá đơn điện tử** | `services/einvoice.ts:124` mặc định nhà cung cấp `sandbox` | Ký hợp đồng, nối API thật, đối chiếu một hoá đơn |
| **Kết xuất PDF** | Chỉ chạy khi `PDF_RENDERER=playwright` **và** đã cài `playwright-core` | Container triển khai phải có Chromium |

## 6. Không có cách biết mình làm hỏng gì

`packages/api/package.json:13` viết `"test": "node --test --import tsx src/*.test.ts"` — **một cấp
thư mục**. Hệ quả đo được: `packages/api/src/services/` có **0 tệp kiểm thử** trên **25.978 dòng**
mã dịch vụ. Tệ hơn: kiểm thử viết ra trong `services/` sẽ **bị bỏ qua lặng lẽ, CI vẫn xanh**.

Sửa mẫu này mất **15 phút** và là điều kiện mở đường cho mọi kiểm thử dịch vụ sau đó. Đây là món
rẻ nhất trên cả danh sách.

Phần kiểm thử hiện có vẫn đáng tin trong phạm vi của nó: 646 kiểm thử quy tắc thuần ở `packages/core`,
CI chạy khói hơn 100 trang theo 3 vai, cộng hai kịch bản PowerShell (929 + 209 mục) chạy trên máy thật.

## 7. Thứ tự làm — và vì sao theo thứ tự này

### Đợt A — trước khi dựng môi trường thật (~4 ngày công)

Làm trước vì **sửa sau khi đã có dữ liệu thật thì đắt gấp nhiều lần**.

| # | Việc | Cỡ | Nghiệm thu đo được |
|---|---|---|---|
| A1 | Bộ chuyển S3/R2 cho `storage.ts` | 2 ngày | Tải một ảnh lên, triển khai lại, ảnh vẫn mở được |
| A2 | Thống nhất mã hoá PII của `migrate-legacy` với ứng dụng | 0,5 ngày | Kiểm thử: script mã hoá → `openPii()` trả đúng chuỗi gốc |
| A3 | Dọn `parents.phone` trùng + unique + `ON CONFLICT` | 1 ngày | `select phone, count(*) … having count(*)>1` trả 0 dòng |
| A4 | Sửa mẫu `test` của `packages/api` | 15 phút | Thêm một tệp `services/*.test.ts`, `pnpm -F @satarobo/api test` chạy nó |

### Đợt B — trước ngày mở cho người dùng thật (~6 ngày công)

| # | Việc | Cỡ | Nghiệm thu đo được |
|---|---|---|---|
| B1 | Đơn "Nghỉ buổi dạy" đi qua `cancelSession` | 2 ngày | Duyệt đơn → lớp 24 buổi vẫn còn 24 buổi, phụ huynh nhận thông báo |
| B2 | Phủ lọc tenant 4 màn tài chính + thêm `tenantId` cho `refunds`/`commissions` | 2 ngày | Đăng nhập tenant A, không thấy một dòng nào của B (kịch bản bộ B) |
| B3 | Nối dây RLS: gọi `withTenantSession` ở đường đọc | 1 ngày | Tắt lọc ở service → CSDL vẫn chặn |
| B4 | Chặn ghi khi tenant `closed`/`suspended` | 1 ngày | Đặt tenant `suspended` → mọi mutation trả lỗi rõ ràng |
| B5 | Theo dõi lỗi (Sentry hoặc tương đương) | 0,5 ngày | Ném một lỗi giả → có cảnh báo kèm stack trace |
| B6 | `missingTuition` phân trang + bỏ truy vấn con tương quan | 1 ngày | `EXPLAIN` không còn quét toàn bảng; mở màn < 2 giây |

### Đợt C — tuần đầu vận hành

Gộp hai bộ đếm tần suất ở route công khai (KT-13) · nút "Chạy lại" hàng đợi chết ở `/van-hanh`
(KT-03 phần còn lại) · sửa `/tich-hop` báo `ok` sai khi đặt biến Redis mà không có mã Redis (KT-12) ·
bổ sung 18 biến vào `.env.example` · lên cron sao lưu + phục hồi thử một lần · chỉ mục cho 9 bảng
còn lại (KT-19).

### Cố ý **không** làm trước go-live

Vai trò tuỳ chỉnh (KT-10) · module Kỳ thi / Vinh danh (KT-18) · nhập Excel (KT-17) · viết lại kịch
bản kiểm thử bằng TypeScript (KT-20) · LMS nội bộ (KT-26) · cổng học sinh riêng. Không mục nào
trong đây làm hỏng hay lộ dữ liệu.

## 8. Trình tự ngày mở

1. Dựng môi trường thật + tên miền + HTTPS; đặt đủ biến bắt buộc; `ALLOW_DEV_ACTOR` **tắt**.
2. Mở `/van-hanh` — phải **xanh toàn bộ** trước khi đi tiếp. Đây là cổng chặn, không phải bảng tham khảo.
3. Chạy `scripts/ops/backup.sh` một lần, rồi `restore.sh` vào CSDL trống để **chứng minh bản sao dùng được**.
4. Nhập dữ liệu cũ vào **môi trường thử trước**: đối soát số học viên / công nợ / số dư xu với
   `admin.satarobo.vn`, và mở ba hồ sơ phụ huynh kiểm tra CCCD giải mã đúng (đúng lỗi 2.1).
5. Nhập thật. Khoá quyền ghi trên hệ cũ ngay sau đó — hai hệ cùng ghi là cách chắc chắn nhất để
   lệch số liệu.
6. Bật Zalo OA / ZNS với mẫu đã duyệt; gửi thử tới **số của chính nhân sự trung tâm** trước khi gửi
   cho phụ huynh.
7. Mở cho nhân sự dùng trước một tuần, rồi mới gửi đường dẫn cổng `/ph` cho phụ huynh.

## 9. Đã đối chiếu tài liệu cũ — bốn chỗ tài liệu nói không đúng thực tế

Ghi lại để lần sau không tin nhầm:

1. `LO-TRINH-HOAN-THIEN.md` xếp **11 mục Đợt 1 chặn go-live**; kiểm chứng trong mã: **2 xong
   (KT-11, và KT-12 mới nửa đường), 1 làm một phần (KT-03), 8 chưa làm**.
2. Tiêu chí nghiệm thu của KT-13 dặn tìm `"new Map()"` — mã thật viết `new Map<string, number[]>()`,
   nên tìm ra 0 kết quả và **"đạt" giả**.
3. KT-24 đặt mục tiêu giảm ép kiểu `as unknown as` từ 389 xuống ≤10; hôm nay đếm được **427** —
   đang đi ngược.
4. KT-16 nêu route `/hoc-ba`; route đó **không tồn tại** (chỉ có `/ho-so-hoc-tap` và `/hoc-ba-moc`),
   nên không rõ mục này đã xong hay còn thiếu một màn.

## 10. Hai việc không có mã KT- nào phụ trách

Nghĩa là không ai đang làm, và sẽ không tự xuất hiện trong bất kỳ báo cáo tiến độ nào:

- **Lệch mã hoá PII khi nhập dữ liệu cũ** (mục 2.1) — nằm đúng trên đường go-live.
- **Không có theo dõi lỗi** (mục 4.3) — nghĩa là tuần đầu vận hành sẽ chạy mù.
