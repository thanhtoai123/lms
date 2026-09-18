# Kiểm định bảo mật — Sata Robo Platform

Phạm vi: toàn bộ `packages/api` (tRPC router + service), `packages/core`, `packages/db`,
`apps/web` (route handler, proxy, trang đăng nhập, cấu hình Next.js).

Hệ thống chứa **dữ liệu cá nhân của trẻ em** (họ tên, ngày sinh, trường, ảnh lớp),
**dữ liệu phụ huynh** (số điện thoại, email, CCCD, địa chỉ) và **dữ liệu tài chính**
(đơn học phí, thanh toán, đối soát ngân hàng). Vì vậy mọi lỗi cho phép đọc chéo cơ sở
hoặc mạo danh đều được xếp mức cao trở lên.

Ngày kiểm định: 18/09/2026 · Nhánh đợt 1: `worktree-agent-aa4334bd36a56d2f2` · Nhánh đợt 2: `worktree-agent-ae832b3e92a4dcdbe`

---

## 1. Tổng hợp

| Mức | Phát hiện | Đã vá | Còn lại |
|---|---|---|---|
| Nghiêm trọng | 2 | 2 | 0 |
| Cao | 6 | 6 | 0 |
| Trung bình | 8 | 7 | 1 |
| Thấp | 4 | 3 | 1 |
| **Tổng** | **20** | **18** | **2** |

**Đợt 2 (18/09/2026, nhánh `worktree-agent-ae832b3e92a4dcdbe`)** đóng nốt T7, Th3, Th4 và thêm
một phát hiện mới T8 (gói SCORM chạy cùng miền với khu quản trị). Chi tiết ở mục 9.

Kết quả tốt cần ghi nhận: tầng service đã có kỷ luật phân quyền rất đều
(`requirePermission` / `authorize` / `centersWith` / `visibleCenterIds`, các helper
`loadForWrite`, `loadOpenTx`, `loadAssignment`, `parentScope`…). Rà 577 hàm service
được router gọi **không tìm thấy lỗi IDOR đọc/ghi chéo cơ sở nào**: mọi hàm nhận `id`
đều nạp bản ghi rồi đối chiếu `centerId` trước khi trả dữ liệu hoặc ghi. Phần lớn rủi ro
thực tế nằm ở **hạ tầng xác thực, khoá bí mật và tệp tải lên**, không ở phân quyền nghiệp vụ.

---

## 2. Nghiêm trọng

| # | Vị trí | Mô tả & cách khai thác | Trạng thái |
|---|---|---|---|
| N1 | `packages/api/src/context.ts:41` (trước vá) | Cửa hậu `ALLOW_DEV_ACTOR_IN_PRODUCTION=1` cho phép bật lại đăng nhập bằng "tài khoản mẫu" ngay trên môi trường chạy thật. Kết hợp với N2, kẻ tấn công chỉ cần gửi `x-dev-actor: superadmin@example.test` là **trở thành quản trị tối cao**, đọc/sửa toàn bộ dữ liệu trẻ em và tài chính. | **Đã vá** — `devActorAllowed()` trả `false` bất biến khi `NODE_ENV=production`; không còn biến môi trường nào mở lại được (`packages/core/src/security/devActor.ts`). |
| N2 | `apps/web/src/app/api/trpc/[trpc]/route.ts:53` (trước vá) | Header `x-dev-actor` do **máy khách** gửi được giữ nguyên (`if (dev && !h.get("x-dev-actor"))` chỉ điền khi header *chưa có*), rồi `createContext` tin header đó. Ở bất kỳ môi trường nào bật `ALLOW_DEV_ACTOR=1` (staging, bản demo, máy CI mở cổng), một request `curl -H 'x-dev-actor: superadmin@…'` là mạo danh xong — không cần mật khẩu. | **Đã vá** — header client bị `h.delete()` trước, chỉ cookie do máy chủ đọc mới có hiệu lực; áp dụng cho cả `apps/web/src/lib/route-ctx.ts` và `/api/media/upload`. |

---

## 3. Cao

| # | Vị trí | Mô tả & cách khai thác | Trạng thái |
|---|---|---|---|
| C1 | `packages/api/src/storage.ts:10`, `services/pii.ts:9`, `services/qrAttendance.ts:11`, `services/hrCheckin.ts:19`, `services/einvoice.ts:122`, `services/admin.ts:185`, `services/loginSecurity.ts:20` (trước vá) | Khoá dự phòng **cứng trong mã nguồn**: `"dev-only-media-secret"`, `"dev-otp-pepper"`, `"login-events"`. Chạy thật mà quên đặt biến môi trường thì bất kỳ ai đọc repo cũng tự ký được URL `/api/media/file?...&sig=` → tải mọi **ảnh lớp và tài liệu**; giải mã được cột `parent_private` (**CCCD, địa chỉ phụ huynh**); dò ngược được băm OTP. | **Đã vá** — `packages/api/src/lib/secrets.ts` + `packages/core/src/security/secrets.ts`: ở production thiếu khoá / khoá ngắn / khoá trùng giá trị mẫu đều ném `MissingSecretError` ngay. |
| C2 | `packages/api/src/services/parentAccounts.ts:154` (trước vá) | `verifyActivationCode` không đếm số lần thử. Mã kích hoạt chỉ **6 chữ số**, sống **72 giờ**; chặn duy nhất là `rateLimited` theo IP trong bộ nhớ ở `/api/ph/login`. Đổi IP (proxy pool) là dò tới khi mở được cổng phụ huynh → xem hồ sơ con, điểm danh, học phí, tin nhắn. | **Đã vá** — đếm theo **số điện thoại** (8 lần / 15 phút), so khớp băm timing-safe, reset sau khi đúng. Xác suất đoán trúng trong cả đời một mã còn ~0,23%. |
| C3 | `packages/api/src/services/media.ts:46` (trước vá), `services/assignments.ts:283` (`submitWork`, trước vá) | Ảnh lớp và bài nộp chỉ kiểm tra `Content-Type` **do máy khách khai báo**, không soi nội dung. Gửi tệp SVG/HTML chứa `<script>` kèm `Content-Type: image/png` là lưu được mã kịch bản vào kho của trung tâm. | **Đã vá** — `checkImageUpload` / `checkSubmissionFile` trong `packages/core/src/security/upload.ts` đối chiếu magic bytes (PNG/JPG/WEBP/PDF) và chặn nội dung có `<svg`, `<html`, `<script`. |
| C4 | `apps/web/src/app/api/media/file/route.ts:3,21` (trước vá) | Bảng kiểu phát ảnh có `svg: "image/svg+xml"`. Chỉ cần tồn tại một đối tượng `.svg` (kết hợp C1/C3) là mở thẳng URL đó trên miền quản trị → **XSS lưu trữ**, đọc được cookie phiên nhân sự. CSP hiện cho `script-src 'self' 'unsafe-inline'` nên kịch bản nội tuyến chạy được. | **Đã vá** — bỏ `svg` khỏi bảng kiểu; đuôi lạ bị ép `Content-Disposition: attachment`; thêm `Content-Security-Policy: default-src 'none'; sandbox` cho cả `/api/media/file` và `/api/content/file`. |
| C5 | `packages/api/src/services/students.ts:95` (`exportStudents`), `services/leads.ts:444` (`exportLeads`) | Xuất tới **10.000 dòng** gồm họ tên trẻ, ngày sinh, trường, tên + SĐT phụ huynh mà **không ghi nhật ký**. Một nhân viên sắp nghỉ việc tải toàn bộ danh sách khách hàng, không để lại dấu vết nào để điều tra. (Phân quyền và che SĐT theo vai trò thì đã đúng.) | **Đã vá** — cả hai ghi `writeAudit` hành động `PII_REVEAL` kèm số dòng, bộ lọc và trạng thái che SĐT. |
| C6 | `apps/web/src/app/api/webhooks/zalo/route.ts:14` → `services/messaging.ts:51` (trước vá) | `zaloSignatureOk` nhận `timestamp` nhưng **không kiểm tra độ tươi**. Chữ ký hợp lệ bắt được một lần có thể phát lại vô thời hạn để bơm tin nhắn giả vào CRM. | **Đã vá** — chuyển vào `packages/core/src/security/webhook.ts`, thêm cửa sổ ±5 phút (`timestampFresh`) và so khớp timing-safe trên toàn chuỗi header. |

---

## 4. Trung bình

| # | Vị trí | Mô tả & cách khai thác | Trạng thái |
|---|---|---|---|
| T1 | `apps/web/src/app/api/cron/outbox/route.ts:12` (trước vá) | `if (!secret && NODE_ENV === "production")` — khi `CRON_SECRET` chưa đặt **và** `NODE_ENV` không phải `production` (rất thường gặp khi tự triển khai), route chạy toàn bộ tác vụ nền (gửi email, ZNS, đẩy thông báo) cho **bất kỳ ai** gọi. | **Đã vá** — không còn mở khi thiếu khoá; chỉ môi trường phát triển (đã bật tài khoản mẫu) mới gọi tay được; so khoá timing-safe. |
| T2 | `apps/web/src/app/api/media/upload/route.ts`, `content/upload`, `content/site-media`, `content/submission` (trước vá) | Các route handler multipart **không có** lớp kiểm tra cùng nguồn mà `/api/trpc` đã có. Cookie `SameSite=Lax` chặn được phần lớn POST liên miền nên chưa khai thác trực tiếp được, nhưng đây là lớp phòng thủ bị thiếu. | **Đã vá** — thêm `crossSite()` / `crossSiteResponse()` dùng chung ở `apps/web/src/lib/route-ctx.ts`. |
| T3 | `apps/web/src/lib/route-ctx.ts:16` (trước vá) | `hits = new Map<string, number[]>()` **không bao giờ dọn khoá cũ**. Bắn request với IP giả (`X-Forwarded-For` tuỳ ý) làm Map phình vô hạn → cạn bộ nhớ tiến trình (DoS). | **Đã vá** — thay bằng `MemoryRateLimiter` (trần 10.000 khoá, dọn định kỳ mỗi phút). |
| T4 | `packages/api/src/services/parentAccounts.ts:20` (trước vá) | `hashActivationCode` = `sha256(code)` **không muối**. Không gian mã chỉ 1.000.000; ai đọc được bảng `parents` dựng bảng tra trong vài giây là ra mã kích hoạt còn hiệu lực của mọi phụ huynh. | **Đã vá** — thêm muối bí mật (`OTP_PEPPER`). *Lưu ý vận hành: các mã kích hoạt đang chờ sẽ mất hiệu lực sau khi triển khai — cấp lại cho phụ huynh chưa kích hoạt.* |
| T5 | `packages/api/src/services/pilot.ts:205` (trước vá) | `sql.raw(\`array[${weeks.map(x => \`'${x}'::date\`).join(",")}]\`)` — nối chuỗi vào SQL. Hiện `weeks` sinh từ `recentWeeks()` (ngày nội bộ, số tuần đã kẹp 1–26) nên **chưa khai thác được**, nhưng là bẫy chờ người sau đổi nguồn dữ liệu. | **Đã vá** — dùng tham số mảng `${weeks}::date[]`. |
| T6 | `apps/web/src/app/api/public/otp/route.ts` | Không có trần theo IP ở cửa ngõ (chỉ có trần trong CSDL theo SĐT / mục đích). | **Đã vá** — thêm `rateLimited('otp|<ip>', 30, 1 giờ)`; `verifyOtp` so khớp băm timing-safe. |
| T7 | `apps/web/next.config.ts:37` (trước vá) | CSP dùng `script-src 'self' 'unsafe-inline'`. `'unsafe-inline'` vô hiệu hoá phần lớn giá trị của CSP trước XSS: chèn được một thẻ `<script>` vào trang quản trị là chạy được mã trong phiên của nhân sự. | **Đã vá** — mỗi yêu cầu sinh một nonce trong `apps/web/src/proxy.ts`; CSP dựng ở `packages/core/src/security/headers.ts`. `script-src` nay là `'self' 'nonce-…' 'strict-dynamic'`, **không còn `'unsafe-inline'`**. Xem mục 9.1. |
| T8 | `apps/web/src/app/api/content/scorm/[exp]/[sig]/[docId]/[version]/[...path]/route.ts` | **Phát hiện mới.** Gói SCORM là HTML + JavaScript của **bên thứ ba** nhưng được phát trên **đúng miền của khu quản trị**. Một gói độc hại (hoặc gói hợp lệ bị sửa) chạy trong ngữ cảnh same-origin: cookie phiên là `httpOnly` nên không đọc trực tiếp được, nhưng mã trong gói vẫn `fetch('/api/trpc/...')` kèm cookie được — tức thao tác thay cho người đang mở bài giảng. | **Còn lại** — vá đúng là tách sang một miền riêng (`scorm.<domain>`) hoặc `sandbox` không kèm `allow-same-origin`; cả hai đều đổi cách phát bài giảng nên phải có kiểm thử nội dung. Trước mắt: chỉ tải gói SCORM từ nguồn tin cậy và duyệt trước khi xuất bản. Route này đã được **loại khỏi** CSP `default-src 'none'` của `/api/*` để không vỡ bài giảng. |

---

## 5. Thấp

| # | Vị trí | Mô tả | Trạng thái |
|---|---|---|---|
| Th1 | `apps/web/src/app/login/page.tsx:26` (trước vá) | Cookie `x-dev-actor` đặt `httpOnly: false` — kịch bản trên trang đọc/đổi được danh tính phiên phát triển. | **Đã vá** — `httpOnly: true`, `secure` theo môi trường. |
| Th2 | `packages/core/src/growth/rules.ts:392` | `anonymizedPhone(id)` chỉ dùng **7 ký tự hex đầu** của id → hai chủ thể trùng 7 ký tự đầu sinh cùng một "số điện thoại ẩn danh", có thể đụng ràng buộc duy nhất khi thực hiện yêu cầu xoá dữ liệu. | **Còn lại** — xác suất rất thấp (~1/268 triệu cho mỗi cặp) và cần đổi dữ liệu đã ẩn danh; ghi nhận để xử lý cùng đợt di trú. Có kiểm thử ghim hành vi hiện tại tại `packages/core/src/security/pii.test.ts`. |
| Th3 | `packages/api/src/services/loginSecurity.ts`, `apps/web/src/lib/route-ctx.ts` (trước vá) | Mọi trần tần suất đều **trong bộ nhớ một tiến trình**. Chạy nhiều bản sao (Vercel, k8s) thì trần thực tế nhân lên theo số bản sao, và mỗi lần triển khai lại là đếm về 0 — kẻ dò mã kích hoạt phụ huynh chỉ cần đợi một lần deploy. | **Đã vá** — bảng `rate_limits` trong Postgres, tăng nguyên tử `insert … on conflict do update`; bộ nhớ vẫn chạy trước như lớp thứ nhất. Xem mục 9.2. |
| Th4 | `apps/web/src/app/api/trpc/[trpc]/route.ts:64` (trước vá) | `console.error` in nguyên đối tượng lỗi tRPC khi `INTERNAL_SERVER_ERROR`. Lỗi `postgres-js` mang theo `query` (nguyên văn SQL), `parameters` (SĐT, email, CCCD phụ huynh) và `detail` (`Key (phone)=(0912345678)`). Log máy chủ thường đẩy thẳng sang dịch vụ bên thứ ba → đây là một đường rò PII trẻ em và phụ huynh ra ngoài. | **Đã vá** — bộ ghi log dùng chung `packages/core/src/security/log.ts`; mọi `console.*` trong `packages/api` và `apps/web` đã chuyển sang logger có che PII. Thông báo lỗi trả cho máy khách cũng đi qua `clientSafeMessage`. Xem mục 9.3. |

---

## 6. Những điểm đã kiểm tra và **đạt**

Ghi lại để lần kiểm định sau không phải rà lại từ đầu.

- **Phân quyền & phạm vi cơ sở (IDOR).** 577 hàm service được router gọi, rà từng hàm nhận
  `id` của lead / học viên / lớp / buổi / thanh toán / nhân sự: đều nạp bản ghi rồi đối chiếu
  `centerId` (`loadForWrite` ở `leads.ts:492`, `loadOpenTx`/`canHandle` ở `bank.ts`,
  `loadAssignment` ở `assignments.ts`, `parentScope` ở `parentAccounts.ts`, `editable` ở
  `evaluations.ts`, `isProcessor` ở `compliance.ts`…). **Không phát hiện lỗi đọc/ghi chéo cơ sở.**
- **Nhật ký.** Phần lớn mutation nhạy cảm gọi `writeAudit` **bên trong cùng transaction** với
  nghiệp vụ, đúng như thiết kế ở `services/audit.ts:16` (`eraseSubject`, `matchManually`,
  `importLegacyTuition`…). Đợt 2 rà lại **toàn bộ 329 mutation** trong `packages/api/src/routers/**`
  và bịt 12 chỗ còn thiếu hoặc ghi ngoài transaction — danh sách ở mục 9.4.
- **Che PII theo vai trò.** `maskPhone` / `canSeeFullPhone` / `canSeeLeadPhone` áp dụng nhất quán
  cho danh sách, chi tiết và **cả bản xuất CSV**. Xem đầy đủ CCCD là thao tác break-glass có
  bắt buộc lý do và ghi `PII_REVEAL` (`students.revealPrivate`, `finance.revealCustomerPrivate`).
- **Header bảo mật**: nay định nghĩa ở **một nơi duy nhất**
  (`packages/core/src/security/headers.ts`, có `headers.test.ts` ghim danh sách bắt buộc).
  Phản hồi trang lấy header từ `apps/web/src/proxy.ts` (vì CSP mang nonce theo từng yêu cầu),
  route `/api/*` lấy từ `apps/web/next.config.ts`. Đủ: CSP (nonce, không `'unsafe-inline'` cho
  script), `frame-ancestors`, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. Xem mục 9.1.
- **SQL injection.** Toàn bộ `sql.raw` còn lại chỉ chứa **hằng chuỗi tên cột** (ví dụ
  `sql.raw('"students"."id"')`) cho truy vấn con tương quan — không có dữ liệu người dùng.
- **XSS.** `renderMarkdown` (`packages/core/src/growth/rules.ts:74`) escape trước rồi mới dựng thẻ;
  `safeUrl` chỉ nhận `https?://` hoặc `/` và chặn `//`. Các `dangerouslySetInnerHTML` còn lại nhận
  SVG mã QR / thẻ học viên do **máy chủ tự sinh**, không phải dữ liệu người dùng.
- **Open redirect.** `safeNext()` (`login/page.tsx:15`) chỉ nhận đường dẫn bắt đầu bằng `/`
  và loại `//`. `proxy.ts` dựng URL đích từ `req.nextUrl.clone()`, không lấy host từ đầu vào.
- **SSRF.** Không có `fetch` nào nhận URL do người dùng nhập; các lời gọi ra ngoài đều tới host cố định
  (Supabase, Resend, SePay, Meta, Zalo) và có `AbortSignal.timeout`.
- **Webhook.** SePay dùng `checkApiKey` so sánh không lệ thuộc thời gian; Meta dùng HMAC-SHA256;
  idempotency theo mã giao dịch (`ingestBankTx`) nên gửi lại không tạo khoản thu trùng.
  `safeHeaders()` (`packages/core/src/system/rules.ts:187`) **đã** ẩn `authorization` / `cookie`
  trước khi lưu vào bảng `webhook_events` — không rò khoá API vào CSDL.
- **Biến `NEXT_PUBLIC_`.** Chỉ có `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_APP_URL` — đều là giá trị công khai theo thiết kế. `SUPABASE_SERVICE_ROLE_KEY`
  chỉ dùng phía máy chủ.
- **Phiên đăng nhập.** Cookie `httpOnly` + `SameSite=Lax` + `Secure` ở production; tự đăng xuất
  khi không thao tác (`idleExpired`, mặc định 60 phút, cưỡng chế ở cả `proxy.ts` và `/api/trpc`);
  khoá tạm khi sai mật khẩu nhiều lần theo cả tài khoản và IP (`loginLockDecision`);
  bắt buộc xác thực 2 lớp cho `SUPER_ADMIN` (chặn ở middleware tRPC `trpc.ts:42` **và** ở layout).
- **`/api/dev/push-sink`** đã tự tắt khi `NODE_ENV=production`.

---

## 7. Khuyến nghị vận hành (không sửa được bằng mã nguồn)

1. **Xoay toàn bộ khoá bí mật ngay khi triển khai bản vá này.** Nếu hệ thống từng chạy thật mà
   thiếu `MEDIA_SIGNING_SECRET` / `OTP_PEPPER` / `PII_ENCRYPTION_KEY`, coi như các khoá đó **đã lộ**:
   mọi URL ảnh đã ký, dữ liệu `parent_private` và băm OTP phải coi là không còn bí mật.
   Tạo khoá mới bằng `openssl rand -base64 48`, và **mã hoá lại** cột `parent_private` bằng khoá mới.
2. **Đặt `NODE_ENV=production` tường minh** trên mọi môi trường không phải máy cá nhân
   (staging, demo, UAT). Nhiều lớp phòng thủ trong mã nguồn khoá theo biến này.
3. **Chạy `pnpm db:apply-sql` (hoặc `db:push`) khi triển khai bản vá này** để tạo bảng
   `rate_limits` (`packages/db/sql/0006_tran_tan_suat.sql`). Thiếu bảng thì trần tần suất **tự động
   lùi về bộ đếm trong bộ nhớ** (fail-open, có ghi cảnh báo trong log) — hệ thống vẫn chạy nhưng
   trần lại chỉ đúng trong một tiến trình. Kiểm tra bằng cách xem log có dòng
   `không ghi được bộ đếm dùng chung` hay không.
4. **Giám sát trần tần suất.** Trần mặc định (`RATE_LIMITS` trong
   `packages/core/src/security/rateLimit.ts`) đặt RỘNG để không chặn nhầm người thật. Nếu nghiệp vụ
   thật hoặc bộ kiểm thử tự động bị chặn, **nới bằng biến môi trường** `RATE_LIMIT_<TÊN>_MAX`
   (danh sách đầy đủ ở `.env.example`) thay vì sửa mã. `RATE_LIMIT_DISABLED=1` tắt hẳn khi chạy
   kiểm thử tải. Worker dọn dòng hết hạn mỗi 10 phút; không chạy worker thì bảng chỉ phình chứ
   không sai kết quả.
5. **Nếu bản vá CSP làm hỏng giao diện**, theo thứ tự: (a) đặt `CSP_REPORT_ONLY=1` để trang chạy
   lại ngay và thu thập vi phạm; (b) nếu vẫn hỏng, `CSP_STRICT_DYNAMIC=0`; (c) cuối cùng mới
   `CSP_ALLOW_UNSAFE_INLINE=1` — đây là ĐƯỜNG THOÁT KHẨN, trả CSP về mức gần như đợt 1, **phải gỡ
   sau khi sửa xong**. Dấu hiệu nhận biết: trang trắng, console báo
   `Refused to execute inline script because it violates the following Content Security Policy`.
6. **WAF trước ứng dụng**: chặn dò `/api/ph/login` và `/api/public/otp`, chặn user-agent quét,
   giới hạn kích thước body cho các route multipart (hiện chỉ `/api/content/site-media` tự kiểm
   `content-length`). Trần trong ứng dụng đã dùng chung giữa các bản sao, nhưng chặn ở tầng mạng
   vẫn rẻ hơn nhiều (không tốn một truy vấn CSDL cho mỗi lượt bắn).
7. **Sao lưu mã hoá + kiểm thử phục hồi.** `STORAGE_DIR` (ảnh lớp, tài liệu, bài nộp) phải nằm trong
   kế hoạch sao lưu cùng CSDL, mã hoá khi lưu trữ (at-rest), và **diễn tập phục hồi định kỳ** —
   sao lưu chưa bao giờ phục hồi thử thì coi như chưa có.
8. **Quét vi-rút cho tệp tải lên.** Kiểm tra magic bytes chặn được tệp giả dạng ảnh, nhưng không
   phát hiện mã độc trong PDF/ZIP/SCORM. Nên đưa ClamAV (hoặc dịch vụ tương đương) vào đường tải lên.
9. **Giám sát nhật ký `PII_REVEAL`.** Sau bản vá này, mọi lượt xuất CSV học viên / lead đều để lại
   bản ghi. Đặt cảnh báo khi một tài khoản xuất quá N lần/ngày hoặc xuất ngoài giờ làm việc.
10. **Rà soát định kỳ tài khoản.** Trang `/bao-mat` đã cảnh báo tài khoản "ngủ" quá 90 ngày và số
   lượng quản trị tối cao — nên đưa vào quy trình rà hằng quý, kèm thu hồi vai trò khi nhân sự nghỉ.
11. **Mã hoá at-rest và hạn chế truy cập CSDL.** Cột `parent_private` đã mã hoá ở tầng ứng dụng,
   nhưng họ tên trẻ em, ngày sinh, trường học thì chưa — dựa hoàn toàn vào kiểm soát truy cập Postgres.
   Bật mã hoá đĩa, giới hạn IP kết nối, tách tài khoản chỉ-đọc cho báo cáo.
12. **Log máy chủ vẫn phải coi là dữ liệu nhạy cảm.** Bộ ghi log đã che SĐT / email / CCCD và
    lược câu SQL, nhưng log vẫn chứa `path` của tRPC, mã lỗi và tên ràng buộc. Giới hạn quyền đọc
    log, đặt thời hạn lưu (30–90 ngày) và **không** bật lại `console.log` trực tiếp ở bất kỳ đâu —
    quy ước: mọi chỗ ghi log đi qua `createLogger` (`@satarobo/core`).
13. **Gói SCORM (T8) chạy cùng miền với khu quản trị.** Cho tới khi tách miền riêng: chỉ nhận gói
    từ nhà cung cấp tin cậy, có người duyệt trước khi xuất bản, và ghi nhận ai tải gói lên.
14. **Giữ RLS của Postgres là lớp phòng thủ cuối.** `packages/core/src/policy/policy.ts:3` nói rõ
    nguồn sự thật về quyền nằm ở tầng service; hãy đảm bảo RLS thực sự được bật và đồng bộ với
    ma trận quyền, để một lỗi ở tầng ứng dụng không mở toang dữ liệu.

---

## 8. Kiểm thử

Logic bảo mật thuần được kiểm thử bằng `node:test` tại `packages/core/src/security/*.test.ts`:

| Tệp | Nội dung |
|---|---|
| `devActor.test.ts` | Tài khoản mẫu tắt tuyệt đối ở production; chuẩn hoá email; chặn chèn header |
| `secrets.test.ts` | Thiếu khoá / khoá ngắn / khoá mẫu công khai đều bị chặn ở production |
| `rateLimit.test.ts` | Cửa sổ trượt, chống sửa đồng hồ, trần số khoá, dọn khoá hết hạn · **(bổ sung)** cửa sổ cố định cho bộ đếm CSDL: mốc ô, chặn đúng ngưỡng, `retryAfterSec`, chuẩn hoá khoá, nới trần bằng biến môi trường |
| `upload.test.ts` | Magic bytes, phát hiện SVG/HTML, tên tệp và khoá lưu trữ chống path traversal |
| `scope.test.ts` | Phạm vi cơ sở: Hội sở / cơ sở / không có cơ sở / bản ghi không gắn cơ sở |
| `webhook.test.ts` | Sinh & so khớp chữ ký Meta / Zalo, chống phát lại, khoá API SePay |
| `pii.test.ts` | Che SĐT, email, CCCD, IP trên đúng hình dạng dữ liệu của hệ thống |
| `headers.test.ts` | **(mới)** Sinh & kiểm nonce (tất định theo byte, không trùng, chặn nonce giả mạo), `script-src` không còn `'unsafe-inline'`, đủ bộ header bắt buộc, các đường thoát bằng biến môi trường |
| `log.test.ts` | **(mới)** Lược câu SQL / tên cột / `Key (cột)=(giá trị)`, che PII trong bản ghi log và trong lỗi kèm theo, lỗi CSDL không lọt ra máy khách, chống vòng lặp tham chiếu |

Chạy:

```bash
node --experimental-transform-types --import /tmp/reg.mjs --test "packages/core/src/**/*.test.ts"
```

Kết quả gần nhất (đợt 2): **437/437 đạt**, 0 lỗi — 391 sẵn có + 46 mới cho nonce/CSP, bộ ghi log
che PII và thuật toán cửa sổ của trần tần suất. `packages/api` chạy riêng: **5/5 đạt**.

> Không có kiểm thử tự động cho việc *nonce có thực sự tới được thẻ `<script>` do Next sinh ra* hay
> không — cái đó phải mở trình duyệt. Xem "Việc phải kiểm chứng bằng tay" ở mục 9.1.

---

## 9. Đợt 2 — chi tiết cách vá (18/09/2026)

### 9.1. CSP: bỏ `'unsafe-inline'`, dùng nonce mỗi yêu cầu (T7)

**Nơi định nghĩa duy nhất:** `packages/core/src/security/headers.ts` (hàm thuần, có
`headers.test.ts`). `apps/web/src/proxy.ts` sinh nonce cho từng yêu cầu và gắn header cho phản hồi
trang; `apps/web/next.config.ts` chỉ còn lo `/api/*` (proxy không chạy ở đó).

Chính sách hiện tại cho trang:

```
script-src 'self' 'nonce-<ngẫu nhiên 128 bit>' 'strict-dynamic'
script-src-attr 'none'
style-src 'self' 'unsafe-inline'
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'self'
img-src 'self' data: blob: https:; font-src 'self' data:; worker-src 'self' blob:
connect-src 'self' <Supabase https + wss>; frame-src 'self' youtube-nocookie drive.google
media-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests
```

**Nonce tới được `<script>` bằng cách nào.** Next.js đọc nonce từ header
`Content-Security-Policy` **trên YÊU CẦU** rồi tự gắn `nonce=` cho các thẻ `<script>` nó sinh ra.
Vì vậy `proxy.ts` đặt header đó lên request (`NextResponse.next({ request: { headers } })`),
không chỉ lên response, và đặt thêm `x-nonce` để React Server Component đọc lại khi cần
(`apps/web/src/lib/nonce.ts`). Header cùng tên do máy khách tự gửi bị **xoá trước**, nếu không
người gọi tự chọn nonce của chính mình.

**Kiểm kê script nội tuyến của ứng dụng** (rà toàn bộ `apps/web/src`):

| Nguồn | Có nonce? | Ghi chú |
|---|---|---|
| Mã của chúng ta | *không có script nội tuyến nào* | Không dùng `next/script`; không `dangerouslySetInnerHTML` nào chứa `<script>` |
| `<style dangerouslySetInnerHTML>` (`components/column-chooser.tsx:87`) | không cần | Là `<style>`, thuộc `style-src` |
| `renderMarkdown` (tin tức, tuyển dụng, trang giới thiệu) | không cần | Đã escape trước khi dựng thẻ (`growth/rules.ts:74`) |
| SVG mã QR / thẻ học viên (`the-hoc-vien`, `cham-cong`, `ph/be/[id]`) | không cần | Máy chủ tự sinh, không chứa script |
| Bootstrap + dữ liệu RSC (`self.__next_f.push(...)`) của **Next.js** | **có** — Next tự gắn | Cơ chế đọc nonce từ header yêu cầu ở trên |
| Mảnh JS nạp động lúc chạy (webpack chunk) | **không chắc** | Đây là lý do phải có `'strict-dynamic'` |
| Service worker `/ph/sw.js` | không cần | Thuộc `worker-src`; nội dung không có `importScripts` / `eval` |

**Vì sao vẫn có `'strict-dynamic'`.** Next.js nạp các mảnh JS bằng cách tự tạo thẻ `<script>` lúc
chạy; không phải phiên bản nào cũng gắn nonce cho những thẻ đó. Nếu chỉ có nonce mà không có
`'strict-dynamic'`, những mảnh này bị chặn và **trang trắng**. `'strict-dynamic'` cho phép script
đã được tin (mang nonce) nạp tiếp script con — đây đúng là khuyến nghị "strict CSP" phổ biến.
Đánh đổi: các nguồn dạng host (`'self'`) trong `script-src` bị trình duyệt bỏ qua; ta không dựa
vào chúng. Tắt được bằng `CSP_STRICT_DYNAMIC=0` nếu về sau xác nhận Next đã gắn nonce cho mọi thẻ.

**Vì sao `style-src` VẪN giữ `'unsafe-inline'`.** Next.js + Tailwind v4 + `next/font` chèn `<style>`
nội tuyến và thuộc tính `style=` ở rất nhiều chỗ, mà React **không** gắn nonce cho thuộc tính
`style=`. Bỏ `'unsafe-inline'` ở đây sẽ vỡ giao diện mà không đổi được rủi ro chính: chiếm phiên
đăng nhập cần chạy được *script*, và đường đó đã bị nonce chặn. Rủi ro còn lại của CSS nội tuyến là
giả mạo giao diện (UI redressing) — đã chặn bằng `frame-ancestors 'self'` và `X-Frame-Options`.
Bù lại, `script-src-attr 'none'` chặn hẳn `onclick="…"`, thứ mà nonce không bảo vệ được.

**Việc phải kiểm chứng bằng tay** (không tự động hoá được ở tầng này): mở `/dashboard`, `/login`,
`/ph`, `/teacher` trên trình duyệt; Console **không** được có dòng
`Refused to execute inline script…`, và xem mã nguồn trang phải thấy `nonce="…"` trên các thẻ
`<script>` do Next sinh. Nếu hỏng, dùng đường thoát theo thứ tự ở khuyến nghị vận hành số 5.

**Lưu ý hiệu năng:** đặt header CSP lên yêu cầu khiến trang **render động** (mất tối ưu tĩnh).
Với khu quản trị thì không đổi gì (vốn đã động); với trang công khai (`/tin-tuc`, `/gioi-thieu`)
thì mất cache tĩnh — chấp nhận để đổi lấy nonce.

### 9.2. Trần tần suất dùng chung trong CSDL (Th3)

- **Bảng mới** `rate_limits` (`packages/db/src/schema/system.ts` +
  `packages/db/sql/0006_tran_tan_suat.sql`): khoá chính `(key, window_start)`, cột `count`,
  `expires_at`, index trên `expires_at`.
- **Thuật toán thuần** ở `packages/core/src/security/rateLimit.ts`: `fixedWindowStart`,
  `fixedWindowDecision`, `rateLimitKey`, bảng trần `RATE_LIMITS`, `rateLimitFor` (đọc biến môi
  trường). Kiểm thử không cần CSDL.
- **Phần chạm CSDL** ở `packages/api/src/lib/rateLimit.ts`: `checkRateLimit` tăng nguyên tử bằng
  `insert … on conflict (key, window_start) do update set count = count + 1 returning count`.
  `resetRateLimit` xoá đếm sau khi xác thực đúng. `pruneRateLimits` dọn dòng hết hạn (worker gọi
  mỗi 10 phút).
- **Vì sao cửa sổ CỐ ĐỊNH chứ không trượt.** Cửa sổ trượt phải giữ từng mốc thời gian nên không
  tăng nguyên tử bằng một câu lệnh được. Đánh đổi đã biết: ngay ranh giới hai ô có thể lọt tối đa
  `2 × max` lượt trong một khoảng bằng `windowMs`. Với mục đích chống dò mã / chống quét thì chấp
  nhận được, và lớp `MemoryRateLimiter` (cửa sổ trượt) vẫn chạy trước như lớp thứ nhất.
- **Khoá đếm không phải danh bạ:** số điện thoại và email được **băm có muối** (`OTP_PEPPER`)
  trước khi ghép vào khoá; IP và `user_id` để nguyên vì cần cho vận hành.
- **Fail-open có chủ đích:** CSDL lỗi hoặc chưa có bảng ⇒ **cho qua**, chỉ ghi cảnh báo. Trần tần
  suất không bao giờ được là lý do khiến cả hệ thống không đăng nhập được.

Áp dụng cho:

| Luồng | Nơi gọi | Trần mặc định |
|---|---|---|
| Đăng nhập nhân sự | `apps/web/src/app/login/page.tsx` | 60 / 15 phút mỗi IP · 15 / 15 phút mỗi email |
| Đăng nhập & OTP phụ huynh | `apps/web/src/app/api/ph/login/route.ts` | 40 / 15 phút mỗi IP |
| OTP công khai | `apps/web/src/app/api/public/otp/route.ts` | 30 / giờ mỗi IP |
| Quên mật khẩu | `apps/web/src/app/quen-mat-khau/page.tsx` | 10 / giờ mỗi IP · 5 / giờ mỗi email |
| Mã kích hoạt phụ huynh | `services/parentAccounts.ts` → `verifyActivationCode` | 8 / 15 phút mỗi **SĐT** |
| Xuất dữ liệu (CSV học viên / lead) | `services/students.ts`, `services/leads.ts` | 40 / giờ mỗi người dùng |
| Tìm kiếm toàn cục | `services/search.ts` → `globalSearch` | 900 / 5 phút mỗi người dùng |
| Webhook (SePay, Zalo, Messenger) | `apps/web/src/app/api/webhooks/*` | 1.200 / phút mỗi IP |

Đăng nhập nhân sự và quên mật khẩu **trả đúng màn hình cũ** khi đụng trần (không lộ tài khoản nào
có thật): đăng nhập về `/login?error=locked`, quên mật khẩu về `/quen-mat-khau?sent=1`.

### 9.3. Không in dữ liệu cá nhân ra log (Th4)

- **Bộ ghi log dùng chung:** `packages/core/src/security/log.ts` — `createLogger(scope, sink)`,
  mỗi bản ghi là một dòng JSON, đi qua `scrubSql` (bỏ nguyên văn SQL, tên bảng / cột trong nháy
  kép, tham số vị trí `$1`, mẫu `Key (cột)=(giá trị)`) rồi `maskPii` / `maskPiiText` (dùng lại bộ
  che của nhật ký audit ở `system/pii.ts`). Có chống vòng lặp tham chiếu và giới hạn độ sâu, vì
  một đối tượng tự trỏ vào chính nó đủ để **giết tiến trình máy chủ** khi ghi log.
- **Điểm vào:** `packages/api/src/lib/logger.ts` (`apiLogger`) và `apps/web/src/lib/logger.ts`
  (`webLogger`). Toàn bộ `console.*` cũ trong `packages/api` và `apps/web` đã chuyển sang đây
  (`worker.ts`, `services/accounts.ts`, `admin.ts`, `loginSecurity.ts`, `staffAuth.ts`,
  `einvoice.ts`, `finance.ts`, `api/webhooks/sepay`, `api/trpc`).
- **Đường lỗi tRPC** (`apps/web/src/app/api/trpc/[trpc]/route.ts`): trước đây
  `console.error(path, error)` in nguyên đối tượng lỗi — lỗi `postgres-js` mang theo `query`,
  `parameters` (SĐT, email, CCCD) và `detail`. Nay chỉ ghi `path`, `type` và phần lỗi đã lược
  (`redactErrorForLog`: giữ `name`, mã SQLSTATE, tên ràng buộc — đủ để điều tra, không còn dữ liệu
  người thật).
- **Thông báo trả cho máy khách:** `errorFormatter` trong `packages/api/src/trpc.ts` cho mọi thông
  báo đi qua `clientSafeMessage` — câu nghiệp vụ tiếng Việt giữ nguyên, còn lỗi tầng CSDL (mã
  SQLSTATE, câu SQL, `column "x" does not exist`, `duplicate key`) về câu chung; `stack` bị gỡ
  khỏi `data`. Cùng cách đó áp cho các route handler còn trả `(e as Error).message`:
  `/api/content/upload`, `/api/content/site-media`, `/api/content/submission`, `/api/media/upload`,
  `/api/public/leads`, và `finance.bulkConfirmBackfill`. Tiền lệ: `packages/db/src/health.ts`.
- **`logWebhook`** lược SQL + che PII trước khi lưu cột `error` vào bảng `webhook_events`.

### 9.4. Mutation được bổ sung nhật ký (mục 4)

Rà **toàn bộ 329 mutation** trong `packages/api/src/routers/**` bằng máy (dò hàm service có
`insert` / `update` / `delete` mà không có `writeAudit`, và dò `writeAudit` nằm **ngoài**
transaction mang thay đổi), rồi lọc tay theo tiêu chí "tiền, quyền, PII, trạng thái hợp đồng".

| # | Hàm service | Vấn đề | Cách vá |
|---|---|---|---|
| 1 | `einvoice.updateDraft` | Sửa người mua trên hoá đơn (mã số thuế, địa chỉ, email) — **không có** audit, 2 câu lệnh rời nhau | Gói 1 transaction + `writeAudit` (before/after đầy đủ) |
| 2 | `einvoice.cancelDraft` | Huỷ hoá đơn nháp — **không có** audit | Gói 1 transaction + `writeAudit` |
| 3 | `einvoice.doIssue` | Phát hành hoá đơn: audit chỉ có ở `issueInvoice` (thao tác tay) và ghi **sau** transaction; hoá đơn do worker phát hành (`syncInvoiceDrafts`) **không để lại dấu vết nào** | `writeAudit` chuyển vào transaction chốt số, dùng cho cả hai đường; `issueInvoice` truyền IP xuống |
| 4 | `finance.bulkConfirmBackfill` | Xác nhận hàng loạt khoản thu: chỉ có **một** bản ghi tổng kết ngoài transaction, không truy được khoản nào của đơn nào | Thêm `writeAudit` **từng khoản** trong đúng transaction của khoản đó (giữ bản tổng kết) |
| 5 | `inventory.sellProducts` (đường bù trừ) | Hết hàng giữa chừng: huỷ đơn + bút toán âm chạy 3 câu lệnh rời, **không** audit | Gói 1 transaction + `writeAudit` |
| 6 | `compliance.setConsent` | Đổi đồng ý (ảnh lớp của trẻ, marketing, hạn chế xử lý) — audit ghi **ngoài** transaction | Chuyển `writeAudit` vào trong transaction |
| 7 | `compliance.linkSubject` | Gắn yêu cầu dữ liệu vào hồ sơ cụ thể (mở đường cho xuất / xoá dữ liệu) — **không có** audit | Gói 1 transaction + `writeAudit` |
| 8 | `media.updateMediaTags` | Gắn thẻ học viên vào ảnh lớp = liên kết "khuôn mặt trẻ ↔ hồ sơ" — **không có** audit | Gói 1 transaction + `writeAudit` |
| 9 | `recruit.hireCandidate` | Nhận việc → phát sinh quan hệ lao động; 4 câu lệnh rời, **không** audit | Gói 1 transaction + `writeAudit` |
| 10 | `hrPositions.upsertPositionDef` (nhánh tạo mới) | Vị trí mang **bộ vai trò** cấp cho người giữ → tạo vị trí là cấp quyền; audit ghi ngoài transaction | Gói 1 transaction + `writeAudit` bên trong |
| 11 | `messaging.saveMessagingSettings` và `messaging.savePilot` | Cấu hình kênh nhắn tin quyết định tin phụ huynh chảy về cơ sở nào (ai được đọc) — **không có** audit | Gói 1 transaction + `writeAudit` (có `before`) |
| 12 | `assignments.assignmentAction` | Mỗi nhánh một transaction riêng, `writeAudit` chạy **sau** tất cả | Gộp về **một** transaction, audit bên trong |
| 13 | `reportCards.setNextCourse` | Lộ trình khoá học (kéo theo báo giá khoá tiếp) — **không có** audit, lệch với phần còn lại của danh mục | Gói 1 transaction + `writeAudit` |

**Xem xét rồi quyết định KHÔNG đổi** (ghi lại để lần sau khỏi rà lại):

- `admissionsAdmin.upsertAssignee` / `removeAssignee` — đã có nhật ký chuyên biệt `logPool`
  (kèm actor, before/after, lý do) **trong cùng transaction**. Đủ.
- `leads.addActivity` / `completeTask` / `addLeadChild` / `updateLeadChild` / `removeLeadChild` —
  `lead_activities` chính là sổ hoạt động của lead, có actor và nội dung.
- `documents.openDocument` / `scormLaunch` / `scormCommit` — bảng được ghi *chính là* nhật ký
  truy cập.
- `hrCheckin.punch` — `attendance_punches` chính là sổ chấm công (chỉ thêm, không sửa).
- `engagement.processOutbox` / `scanLeadSla`, `care.retryNotification` / `sendBirthdayGreeting`,
  `catalog.moveLessonOrder`, `sessions.saveSessionNote` / `saveSessionChecklist`,
  `cutover.logParallelDay`, `readiness.completeModule`, `pilot.createFeedback`,
  `admin.retryEmail`, `engagement.markRead` — không thuộc nhóm tiền / quyền / PII / trạng thái
  hợp đồng.
- `provisionTenant.provision` — máy dò báo "audit ngoài transaction" nhưng đọc kỹ thì `db` trong
  phạm vi đó **chính là** `tx`. Không phải lỗi.

### 9.5. Thay đổi hành vi cần biết

1. **`assignments.assignmentAction`, nhánh "giao bài".** Trước đây: cam kết trạng thái `published`
   **rồi** mới ném lỗi "Lớp chưa có học viên đang học" — người dùng thấy báo lỗi nhưng bài **đã**
   được giao. Nay lỗi đó cuộn ngược cả transaction, bài trở lại `draft`. Đây là sửa đúng, nhưng
   nếu bộ kiểm thử tự động đang khẳng định hành vi cũ thì phải chỉnh lại kịch bản.
2. **Trần tần suất mới cho `exportStudents` / `exportLeads` (40 lượt/giờ mỗi người) và
   `globalSearch` (900 lượt / 5 phút mỗi người).** Kịch bản kiểm thử bắn liên tục có thể đụng trần
   và nhận `TOO_MANY_REQUESTS`. Nới bằng `RATE_LIMIT_EXPORT_USER_MAX` /
   `RATE_LIMIT_SEARCH_USER_MAX`, hoặc `RATE_LIMIT_DISABLED=1` cho môi trường kiểm thử.
3. **Thông báo lỗi `INTERNAL_SERVER_ERROR` trả về máy khách nay là câu chung.** Kịch bản nào đang
   khớp chuỗi lỗi nội bộ (ví dụ khẳng định thấy `duplicate key`) sẽ không khớp nữa. Lỗi nghiệp vụ
   tiếng Việt giữ nguyên.
4. **`Cross-Origin-Resource-Policy` KHÔNG đặt cho `/api/*`** (chỉ cho phản hồi trang), vì website
   satarobo.vn gọi `/api/public/*` từ miền khác — đặt `same-site` sẽ chặn nhầm.
5. **Header trên `/api/content/scorm/*`** không có CSP `default-src 'none'` (gói SCORM là tài liệu
   HTML thật, đặt vào là bài giảng không chạy). Xem T8.
6. **Log đổi định dạng**: mỗi dòng nay là JSON (`{"level","time","scope","msg","data"}`) thay vì
   chuỗi tự do. Hệ thống gom log nào đang bóc theo định dạng cũ phải chỉnh lại.
