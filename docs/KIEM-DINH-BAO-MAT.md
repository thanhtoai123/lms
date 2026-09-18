# Kiểm định bảo mật — Sata Robo Platform

Phạm vi: toàn bộ `packages/api` (tRPC router + service), `packages/core`, `packages/db`,
`apps/web` (route handler, proxy, trang đăng nhập, cấu hình Next.js).

Hệ thống chứa **dữ liệu cá nhân của trẻ em** (họ tên, ngày sinh, trường, ảnh lớp),
**dữ liệu phụ huynh** (số điện thoại, email, CCCD, địa chỉ) và **dữ liệu tài chính**
(đơn học phí, thanh toán, đối soát ngân hàng). Vì vậy mọi lỗi cho phép đọc chéo cơ sở
hoặc mạo danh đều được xếp mức cao trở lên.

Ngày kiểm định: 18/09/2026 · Nhánh: `worktree-agent-aa4334bd36a56d2f2`

---

## 1. Tổng hợp

| Mức | Phát hiện | Đã vá | Còn lại |
|---|---|---|---|
| Nghiêm trọng | 2 | 2 | 0 |
| Cao | 6 | 6 | 0 |
| Trung bình | 7 | 5 | 2 |
| Thấp | 4 | 1 | 3 |
| **Tổng** | **19** | **14** | **5** |

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
| T7 | `apps/web/next.config.ts:37` | CSP dùng `script-src 'self' 'unsafe-inline'`. `'unsafe-inline'` vô hiệu hoá phần lớn giá trị của CSP trước XSS. Next.js App Router cần nonce cho script nội tuyến; đổi sang nonce phải sửa `proxy.ts` để sinh và truyền nonce cho mọi trang. | **Còn lại** — cần một đợt riêng, có kiểm thử giao diện. Đã giảm rủi ro bằng C3/C4 (không còn đường đưa HTML/SVG vào miền quản trị). |

---

## 5. Thấp

| # | Vị trí | Mô tả | Trạng thái |
|---|---|---|---|
| Th1 | `apps/web/src/app/login/page.tsx:26` (trước vá) | Cookie `x-dev-actor` đặt `httpOnly: false` — kịch bản trên trang đọc/đổi được danh tính phiên phát triển. | **Đã vá** — `httpOnly: true`, `secure` theo môi trường. |
| Th2 | `packages/core/src/growth/rules.ts:392` | `anonymizedPhone(id)` chỉ dùng **7 ký tự hex đầu** của id → hai chủ thể trùng 7 ký tự đầu sinh cùng một "số điện thoại ẩn danh", có thể đụng ràng buộc duy nhất khi thực hiện yêu cầu xoá dữ liệu. | **Còn lại** — xác suất rất thấp (~1/268 triệu cho mỗi cặp) và cần đổi dữ liệu đã ẩn danh; ghi nhận để xử lý cùng đợt di trú. Có kiểm thử ghim hành vi hiện tại tại `packages/core/src/security/pii.test.ts`. |
| Th3 | `packages/api/src/services/loginSecurity.ts`, `apps/web/src/lib/route-ctx.ts` | Mọi trần tần suất đều **trong bộ nhớ một tiến trình**. Chạy nhiều bản sao (Vercel, k8s) thì trần thực tế nhân lên theo số bản sao. | **Còn lại** — cần kho dùng chung (Redis/Upstash) hoặc bảng đếm trong Postgres; xem "Khuyến nghị vận hành". Lớp chặn theo CSDL cho đăng nhập nhân sự (`loginLockDecision`) và OTP vẫn đúng trên mọi bản sao. |
| Th4 | `apps/web/src/app/api/trpc/[trpc]/route.ts:64` | `console.error` in nguyên đối tượng lỗi tRPC khi `INTERNAL_SERVER_ERROR`. Lỗi từ tầng CSDL có thể kèm giá trị tham số (SĐT, email) vào log máy chủ. | **Còn lại** — cần đi qua `maskPiiText()` trước khi ghi; chạm vào đường xử lý lỗi nên tách khỏi đợt này. Rà `console.*` toàn repo: **không có** chỗ nào chủ động in PII. |

---

## 6. Những điểm đã kiểm tra và **đạt**

Ghi lại để lần kiểm định sau không phải rà lại từ đầu.

- **Phân quyền & phạm vi cơ sở (IDOR).** 577 hàm service được router gọi, rà từng hàm nhận
  `id` của lead / học viên / lớp / buổi / thanh toán / nhân sự: đều nạp bản ghi rồi đối chiếu
  `centerId` (`loadForWrite` ở `leads.ts:492`, `loadOpenTx`/`canHandle` ở `bank.ts`,
  `loadAssignment` ở `assignments.ts`, `parentScope` ở `parentAccounts.ts`, `editable` ở
  `evaluations.ts`, `isProcessor` ở `compliance.ts`…). **Không phát hiện lỗi đọc/ghi chéo cơ sở.**
- **Nhật ký.** Các mutation nhạy cảm đều gọi `writeAudit`, và các luồng nhiều bước
  (`eraseSubject`, `setConsent`, `matchManually`, `importLegacyTuition`…) gọi **bên trong cùng
  transaction** với nghiệp vụ, đúng như thiết kế ở `services/audit.ts:16`.
- **Che PII theo vai trò.** `maskPhone` / `canSeeFullPhone` / `canSeeLeadPhone` áp dụng nhất quán
  cho danh sách, chi tiết và **cả bản xuất CSV**. Xem đầy đủ CCCD là thao tác break-glass có
  bắt buộc lý do và ghi `PII_REVEAL` (`students.revealPrivate`, `finance.revealCustomerPrivate`).
- **Header bảo mật** (`apps/web/next.config.ts:46`): đủ CSP, HSTS (2 năm, includeSubDomains),
  `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`. Chỉ vướng `'unsafe-inline'` (T7).
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
3. **Trần tần suất dùng chung giữa các bản sao.** Chuyển `MemoryRateLimiter` sang Redis/Upstash
   hoặc bảng đếm Postgres nếu chạy nhiều bản sao. Trước mắt, đặt WAF/CDN (Cloudflare) giới hạn
   theo IP cho `/api/public/*`, `/api/ph/login`, `/login`, `/quen-mat-khau`.
4. **WAF trước ứng dụng**: chặn dò `/api/ph/login` và `/api/public/otp`, chặn user-agent quét,
   giới hạn kích thước body cho các route multipart (hiện chỉ `/api/content/site-media` tự kiểm
   `content-length`).
5. **Sao lưu mã hoá + kiểm thử phục hồi.** `STORAGE_DIR` (ảnh lớp, tài liệu, bài nộp) phải nằm trong
   kế hoạch sao lưu cùng CSDL, mã hoá khi lưu trữ (at-rest), và **diễn tập phục hồi định kỳ** —
   sao lưu chưa bao giờ phục hồi thử thì coi như chưa có.
6. **Quét vi-rút cho tệp tải lên.** Kiểm tra magic bytes chặn được tệp giả dạng ảnh, nhưng không
   phát hiện mã độc trong PDF/ZIP/SCORM. Nên đưa ClamAV (hoặc dịch vụ tương đương) vào đường tải lên.
7. **Giám sát nhật ký `PII_REVEAL`.** Sau bản vá này, mọi lượt xuất CSV học viên / lead đều để lại
   bản ghi. Đặt cảnh báo khi một tài khoản xuất quá N lần/ngày hoặc xuất ngoài giờ làm việc.
8. **Rà soát định kỳ tài khoản.** Trang `/bao-mat` đã cảnh báo tài khoản "ngủ" quá 90 ngày và số
   lượng quản trị tối cao — nên đưa vào quy trình rà hằng quý, kèm thu hồi vai trò khi nhân sự nghỉ.
9. **Mã hoá at-rest và hạn chế truy cập CSDL.** Cột `parent_private` đã mã hoá ở tầng ứng dụng,
   nhưng họ tên trẻ em, ngày sinh, trường học thì chưa — dựa hoàn toàn vào kiểm soát truy cập Postgres.
   Bật mã hoá đĩa, giới hạn IP kết nối, tách tài khoản chỉ-đọc cho báo cáo.
10. **Giữ RLS của Postgres là lớp phòng thủ cuối.** `packages/core/src/policy/policy.ts:3` nói rõ
    nguồn sự thật về quyền nằm ở tầng service; hãy đảm bảo RLS thực sự được bật và đồng bộ với
    ma trận quyền, để một lỗi ở tầng ứng dụng không mở toang dữ liệu.

---

## 8. Kiểm thử

Logic bảo mật thuần được kiểm thử bằng `node:test` tại `packages/core/src/security/*.test.ts`:

| Tệp | Nội dung |
|---|---|
| `devActor.test.ts` | Tài khoản mẫu tắt tuyệt đối ở production; chuẩn hoá email; chặn chèn header |
| `secrets.test.ts` | Thiếu khoá / khoá ngắn / khoá mẫu công khai đều bị chặn ở production |
| `rateLimit.test.ts` | Cửa sổ trượt, chống sửa đồng hồ, trần số khoá, dọn khoá hết hạn |
| `upload.test.ts` | Magic bytes, phát hiện SVG/HTML, tên tệp và khoá lưu trữ chống path traversal |
| `scope.test.ts` | Phạm vi cơ sở: Hội sở / cơ sở / không có cơ sở / bản ghi không gắn cơ sở |
| `webhook.test.ts` | Sinh & so khớp chữ ký Meta / Zalo, chống phát lại, khoá API SePay |
| `pii.test.ts` | Che SĐT, email, CCCD, IP trên đúng hình dạng dữ liệu của hệ thống |

Chạy:

```bash
node --experimental-transform-types --import /tmp/reg.mjs --test "packages/core/src/**/*.test.ts"
```

Kết quả gần nhất: **367/367 đạt** (323 sẵn có + 44 mới), 0 lỗi.
