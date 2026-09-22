# Sổ khoảng trống — Sata Robo Platform

_Rà ngày 18/09/2026 trên mã nguồn thật của nhánh này._
_Đối chiếu với `docs/KHAO-SAT-GOC-2.md` (bản gốc admin.satarobo.vn), `docs/GIAO-DIEN-GOC.md`, `docs/CHECKLIST-DOI-SANH.md`._
_Thiết kế hiện tại mô tả ở `docs/THIET-KE-HE-THONG.md`. Lộ trình đóng khoảng trống ở `docs/LO-TRINH-HOAN-THIEN.md`._

## Cách đọc

- **Mức ảnh hưởng**: `Chặn vận hành` (không chạy thật được, hoặc chạy thật sẽ hỏng dữ liệu / lộ dữ liệu) · `Cao` · `Trung bình` · `Thấp`.
- **Công sức**: `S` ≤ 1 ngày · `M` 2–4 ngày · `L` ≥ 1 tuần.
- Mỗi mục có **bằng chứng `tệp:dòng`**. Nếu bằng chứng không còn đúng nghĩa là mã đã đổi — rà lại trước khi làm.

## Tổng kết

| Mức ảnh hưởng | Số mục |
|---|---|
| Chặn vận hành | 5 |
| Cao | 9 |
| Trung bình | 12 |
| Thấp | 6 |
| **Tổng** | **32** |

Phân bố theo loại: nghiệp vụ gốc còn thiếu 9 · dữ liệu & ràng buộc 5 · hiệu năng 5 · việc nền & vận hành 4 · bảo mật / cách ly 4 · kiểm thử 3 · chất lượng mã & ngôn ngữ 2.

---

# A. Chặn vận hành

## KT-01 — Đơn "Nghỉ buổi dạy" huỷ buổi bằng đường tắt, lớp mất một buổi khỏi lộ trình

**Hạng mục**: Nghiệp vụ gốc — hành vi khác

**Mô tả**. Có **hai** đường huỷ buổi học trong hệ thống, và chúng làm hai việc khác nhau:

| | `sessionChanges.cancelSession` (đường chính) | `hrSessionEffects.cancelSessionForRequest` (đường qua đơn từ) |
|---|---|---|
| Sinh buổi thay thế, giữ đủ tổng buổi | ✅ | ❌ |
| Đẩy buổi cũ sang dải lưu trữ `5001+` | ✅ | ❌ |
| Ghi `cancel_reason` / `cancelled_at` / `cancelled_by` | ✅ | ❌ (nhét lý do vào `private_note`) |
| Huỷ các buổi học thử gắn vào buổi đó | ✅ | ❌ |
| Báo phụ huynh | ✅ | ❌ |
| Cập nhật `classes.expected_end_date` | ✅ | ❌ |
| Chặn tranh chấp bằng điều kiện trong `UPDATE … WHERE` | ✅ | ❌ (đếm điểm danh ở câu truy vấn riêng ⇒ có khe TOCTOU) |

Khi giáo viên nộp đơn "Nghỉ buổi dạy" và quản lý duyệt, buổi bị đặt `status = 'cancelled'` và **biến mất khỏi lộ trình** — lớp 24 buổi còn 23 buổi, nhưng hợp đồng học (`enrollments.package_sessions`) vẫn là 24. Hệ quả dây chuyền: sai số buổi còn lại, sai "sắp hết khoá", sai đề xuất hoàn tiền (công thức `refundProposal` lấy `packageSessions` làm mẫu số), phụ huynh không được báo.

Chú thích trong chính tệp đó nói "hiện tại nhánh này chưa có file đó nên áp trực tiếp" — nhưng `services/sessionChanges.ts` **đã có trên nhánh này**.

**Bằng chứng**
- `packages/api/src/services/hrSessionEffects.ts:4-8` — TODO nói `sessionChanges.ts` chưa có.
- `packages/api/src/services/hrSessionEffects.ts:34` — `set({ status: "cancelled", privateNote: … })`, không sinh buổi thay thế, không ghi `cancelReason`.
- `packages/api/src/services/hrSessionEffects.ts:23-26` — `assertChangeable` đếm điểm danh bằng một câu `SELECT` riêng trước khi `UPDATE`.
- `packages/api/src/services/hrRequests.ts:273` — nơi gọi khi duyệt đơn.
- `packages/api/src/services/sessionChanges.ts` (`cancelSession`) — đường chính, có dời bù + `plan.archiveSeq` + `cancelTrialsFor` + thông báo.
- `packages/core/src/classes/lifecycle.ts:118-133` — quy ước dải số `CANCELLED_SEQUENCE_BASE = 5000`.
- Cam kết ngược lại: `docs/CHECKLIST-DOI-SANH.md:51` "huỷ kiểu 'dời' giữ đủ tổng buổi (kiểm chứng 24/24)".

**Mức ảnh hưởng**: Chặn vận hành · **Công sức**: M

**Cách làm gọn nhất**. Xoá `hrSessionEffects.cancelSessionForRequest` và `setSessionTeacherForRequest`; trong `hrRequests.ts:273, 280` gọi thẳng `sessionChanges.cancelSession({ sessionId, reason, mode: "shift" })` và hàm đổi giáo viên tương ứng của `sessionChanges`. Cần đổi chữ ký của `sessionChanges` để nhận `tx` sẵn có thay vì tự mở transaction (thêm tham số `tx?: Db`), vì việc duyệt đơn đã nằm trong một transaction. Thêm một kiểm thử: duyệt đơn nghỉ buổi dạy ⇒ lớp vẫn còn đủ 24 buổi và có buổi thay thế.

---

## KT-02 — `parents.phone` không có ràng buộc duy nhất, không có chỉ mục; trùng số là phụ huynh không đăng nhập được, im lặng

**Hạng mục**: Ràng buộc dữ liệu + hiệu năng + trải nghiệm

**Mô tả**. Bảng `parents` được tra cứu bằng `phone` ở ít nhất 8 đường (đăng nhập cổng phụ huynh, kích hoạt tài khoản, chốt lead, nhập dữ liệu hệ cũ, nhập giao dịch cũ, tuân thủ NĐ13, ghép người giới thiệu, tìm kiếm). Bảng này **không có chỉ mục nào cả** và **không có ràng buộc duy nhất trên `phone`**.

Hai hậu quả, hậu quả thứ hai nặng hơn:

1. *Hiệu năng*: mỗi lần phụ huynh mở cổng là một lần quét toàn bảng `parents`.
2. *Đúng đắn*: `upsertParent` là đọc-rồi-ghi không có khoá. Hai lượt chốt chạy song song cho cùng một số (rất dễ xảy ra ở màn "Chốt hàng loạt") sẽ tạo **hai** hồ sơ phụ huynh. Khi đó `findParentByPhone` lấy 2 dòng và `if (rows.length !== 1) return null` ⇒ **phụ huynh không bao giờ đăng nhập được, và không có thông báo lỗi nào nói vì sao** — hệ thống trả đúng câu "Nếu số điện thoại đã đăng ký với trung tâm, mã sẽ được gửi qua Zalo."

**Bằng chứng**
- `packages/db/src/schema/people.ts:44-69` — `parents` khai không có mảng chỉ mục (so với `teachers` ở `people.ts:37` và `students` ở `people.ts:113` đều có).
- `packages/api/src/services/students.ts:368-379` — `upsertParent` đọc rồi ghi, không có `onConflict`.
- `packages/api/src/services/parentPortal.ts:28-36` — `findParentByPhone` trả `null` khi `rows.length !== 1`.
- `packages/api/src/services/parentPortal.ts:41-44` — trả câu chung, không phân biệt "không có" và "trùng".
- Các đường tra cứu khác: `parentAccounts.ts:173`, `leads.ts:860`, `compliance.ts:59`, `affiliates.ts:87`, `migration.ts:58-60`.

**Mức ảnh hưởng**: Chặn vận hành · **Công sức**: S

**Cách làm gọn nhất**. Ba việc trong một lượt:
1. Thêm vào `packages/db/sql/0001_constraints.sql`: dọn trùng trước (gộp `student_guardians` về dòng cũ nhất), rồi `CREATE UNIQUE INDEX parents_phone_uq ON parents (phone) WHERE deleted_at IS NULL;`
2. Đổi `upsertParent` sang `INSERT … ON CONFLICT (phone) WHERE deleted_at IS NULL DO UPDATE … RETURNING id`.
3. Trong `findParentByPhone`, khi gặp > 1 dòng thì ghi cảnh báo vào `audit_log` và trả dòng cũ nhất thay vì trả `null` — để lỗi dữ liệu không biến thành "phụ huynh bị khoá ngoài" lặng lẽ.

---

## KT-03 — Outbox không có khoá chiếm việc và không có đường chạy lại thư chết

**Hạng mục**: Việc nền — thử lại / chống chạy trùng

**Mô tả**. Ba vấn đề trong 15 dòng mã:

1. **Không chống chạy trùng**. `processOutbox` chọn 200 dòng chưa xử lý rồi mới `UPDATE` từng dòng sau khi đã chạy xong hành động. Không có `FOR UPDATE SKIP LOCKED`, không có cột "đang xử lý". Nếu chạy đồng thời `pnpm worker` (10 giây/nhịp) và `/api/cron/outbox` (1 phút/nhịp) — cấu hình hoàn toàn hợp lệ theo tài liệu — hai bên chọn **cùng một tập sự kiện** và chạy hành động **hai lần**. Chỉ `create_care_task` có khoá chống trùng (`dedupeKey`); thông báo cho nhân sự và phụ huynh thì không ⇒ phụ huynh nhận hai tin giống nhau.
2. **Không có giãn cách thử lại**. Sự kiện lỗi được thử lại ngay nhịp sau; lỗi do nhà cung cấp quá tải sẽ bị bắn liên tục 5 lần trong 50 giây rồi chết hẳn.
3. **Thư chết không có đường về**. `attempts >= 5` bị loại khỏi truy vấn vĩnh viễn. Trang `/van-hanh` có hiển thị số "Outbox kẹt (≥ 3 lần lỗi)" nhưng **không có nút chạy lại**, trong khi webhook lại có hẳn trang `/crm/webhook-replay`.

**Bằng chứng**
- `packages/api/src/services/engagement.ts:19` — `where(and(isNull(processedAt), sql\`attempts < 5\`))`, không khoá.
- `packages/api/src/services/engagement.ts:22-25` — chạy hành động **trước**, đóng `processedAt` **sau**.
- `packages/api/src/services/engagement.ts:29-31` — chỉ tăng `attempts`, không có `nextAttemptAt`.
- `packages/api/src/worker.ts:33` và `apps/web/src/app/api/cron/outbox/route.ts:29` — hai nơi gọi cùng hàm.
- `apps/web/src/app/(admin)/van-hanh/page.tsx:49` — chỉ hiển thị số, không có hành động.
- Đối chiếu: `apps/web/src/app/(admin)/crm/webhook-replay/page.tsx` — webhook có chạy lại.

**Mức ảnh hưởng**: Chặn vận hành · **Công sức**: M

**Cách làm gọn nhất**.
1. Thêm hai cột vào `outbox`: `locked_until timestamptz`, `next_attempt_at timestamptz NOT NULL DEFAULT now()`.
2. Đổi câu chọn sang một câu duy nhất, chiếm việc nguyên tử:
   `UPDATE outbox SET locked_until = now() + interval '5 min' WHERE id IN (SELECT id FROM outbox WHERE processed_at IS NULL AND attempts < 5 AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now()) ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`
3. Khi lỗi: `next_attempt_at = now() + interval '1 min' * power(3, attempts)` (giãn cách luỹ thừa).
4. Thêm thủ tục `system.replayOutbox({ ids | all })` quyền `system:update` và một nút "Chạy lại" cạnh ô "Outbox kẹt" ở `/van-hanh`.

---

## KT-04 — Lọc theo trung tâm (tenant) chưa phủ đều: Hội sở chuỗi xem được công nợ và hoa hồng chi tiết của trung tâm nhượng quyền

**Hạng mục**: Bảo mật / cách ly dữ liệu

**Mô tả**. Thiết kế nhượng quyền nói rõ: `FRANCHISE` thì "Hội sở chỉ thấy số liệu tổng hợp và PII bị che, trừ khi tenant bật công tắc" (`packages/db/src/schema/tenant.ts:12-14`), và công tắc `hoSeesFinanceDetail` mặc định **tắt** cho tenant nhượng quyền.

Luật đó chỉ được thực thi ở nơi có gọi `tenantCond` + `canSeeFinanceDetailOf`. Trong `finance.ts`, hai hàm đó chỉ xuất hiện ở ba chỗ: `listPaymentMethods` (dòng 142), `listOrders` (dòng 221), `listPayments` (dòng 1169 + 1214). **Bốn màn tài chính còn lại không có**:

| Màn | Hàm | Dòng | Có `tenantCond`? | Có `canSeeFinanceDetailOf`? |
|---|---|---|---|---|
| `/cong-no` (tuổi nợ) | `debts` | `finance.ts:1322` | ❌ | ❌ |
| `/thieu-hoc-phi` | `missingTuition` | `finance.ts:1374` | ❌ | ❌ |
| `/cong-no` (theo ghi danh) | `enrollmentDebts` | `finance.ts:1524` | ❌ | ❌ |
| `/crm/commission` | `listCommissions` | `commissions.ts:114-117` | ❌ | ❌ |

Bốn hàm này chỉ lọc bằng `scope(ctx, …)` — mà `scope` trả `sql\`true\`` khi actor có bất kỳ vai trò toàn hệ thống nào (`finance.ts:53-57`). SUPER_ADMIN của chuỗi có `centerId = null` ⇒ **thấy tên học viên, tên phụ huynh, số tiền còn thiếu và số hoa hồng từng người của mọi trung tâm nhượng quyền**, bất kể công tắc.

Gốc rễ ở tầng schema: `refunds` và `commissions` **không có cột `tenant_id`** (`packages/db/src/schema/finance.ts`, khối `refunds` và `commissions` chỉ có `centerId`), trong khi `orders` và `payments` có. Nên hai bảng này hiện **không thể** lọc tenant kể cả khi muốn.

Phạm vi rộng hơn: 42 bảng mang `tenant_id`, nhưng chỉ **18/74** dịch vụ gọi `tenantCond` / `assertTenant` / `redact`.

**Bằng chứng**
- `packages/api/src/services/finance.ts:53-57` — `scope()` trả `true` khi `visibleCenterIds` là `null`.
- `packages/api/src/services/finance.ts:1322, 1374, 1524` — ba hàm không gọi `tenantCond`.
- `packages/api/src/services/commissions.ts:114-117` — chỉ `scope`, không tenant.
- `packages/api/src/services/tenantScope.ts:5-8` — quy tắc "ba việc phải làm ở MỌI service".
- `packages/core/src/org/tenant.ts:203-212` — `canSeePii` / `canSeeFinanceDetail`.
- `packages/db/src/schema/finance.ts` — `refunds`, `commissions` thiếu `tenantCol()`.

**Mức ảnh hưởng**: Chặn vận hành (với mô hình nhượng quyền) · **Công sức**: M

**Cách làm gọn nhất**.
1. Thêm `tenantId: tenantCol()` vào `refunds` và `commissions`, mở rộng trigger `fill_tenant_id` trong `packages/db/sql/0005_nhuong_quyen.sql` cho hai bảng đó.
2. Thêm `tenantCond(ctx, enrollments)` (hoặc `classes`) vào `debts`, `missingTuition`, `enrollmentDebts`; `tenantCond(ctx, commissions)` vào `listCommissions` và `listRefunds`.
3. Lọc kết quả qua `canSeeFinanceDetailOf(ctx, r.tenantId)` và `redact(ctx, row)` đúng như `listPayments` đã làm (`finance.ts:1214-1216`) — **dùng lại nguyên mẫu đó**, không viết cách mới.
4. Thêm một kiểm thử ma trận: actor SUPER_ADMIN chuỗi, tenant `FRANCHISE` với `hoSeesFinanceDetail = false` ⇒ bốn màn trên trả 0 dòng của tenant đó.

---

## KT-05 — Kho tệp chỉ có bộ chuyển đĩa cục bộ; không có S3/R2 nên không chạy được trên Vercel

**Hạng mục**: Vận hành — triển khai

**Mô tả**. `packages/api/src/storage.ts` đọc/ghi thẳng bằng `node:fs` vào `STORAGE_DIR` (mặc định `.data/uploads` trong thư mục làm việc). Chú thích ghi "Production: thay bằng R2/S3 cùng giao diện" — **bộ chuyển đó chưa được viết**, không có phụ thuộc `@aws-sdk/*` nào trong kho.

Trên Vercel (một trong hai phương án triển khai mà `docs/CHECKLIST-DOI-SANH.md:100` nêu) hệ thống tệp là chỉ-đọc và phù du. Hậu quả: ảnh lớp, CV ứng viên, học liệu, gói SCORM, ảnh website — **mọi thứ tải lên đều mất** sau mỗi lần triển khai, và `putObject` sẽ ném lỗi ngay lần đầu.

Danh sách nơi gọi: `media.ts:57` (ảnh lớp), `growth.ts:221` (ảnh website), `assignments.ts:295` (bài nộp), `documents.ts:213, 219` (học liệu + giải nén SCORM).

**Bằng chứng**
- `packages/api/src/storage.ts:8-9` — chú thích nêu rõ chưa có.
- `packages/api/src/storage.ts:11` — `ROOT() = process.env.STORAGE_DIR ?? .data/uploads`.
- `packages/api/src/storage.ts:24-27` — `putObject` dùng `mkdir` + `writeFile`.
- `.env.example:35` — `STORAGE_DIR=` là biến duy nhất cho kho tệp.
- Không có kết quả nào cho `S3|R2|@aws-sdk` ngoài `storage.ts`.

**Mức ảnh hưởng**: Chặn vận hành (nếu chạy Vercel) · **Công sức**: M

**Cách làm gọn nhất**. Giữ nguyên giao diện `putObject / getObject / deleteObject`, thêm nhánh S3-tương thích trong cùng tệp: khi có `S3_ENDPOINT + S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY` thì dùng `fetch` ký SigV4 (không cần SDK, tránh phình gói); thiếu thì giữ đĩa cục bộ. Thêm bốn biến đó vào bảng kiểm biến môi trường của `/van-hanh` (`packages/core/src/system/ops.ts`) và đánh dấu "nguy hiểm" khi `NODE_ENV=production` mà vẫn dùng đĩa cục bộ.

---

# B. Cao

## KT-06 — `missingTuition` không giới hạn dòng, mỗi dòng còn kèm hai truy vấn con tương quan

**Hạng mục**: Hiệu năng

**Mô tả**. Trang `/thieu-hoc-phi` gọi `finance.missingTuition`, hàm này `SELECT` **mọi ghi danh đang mở** của mọi cơ sở trong phạm vi, **không `LIMIT`, không phân trang**, và mỗi dòng mang hai truy vấn con tương quan (tên phụ huynh, mã đơn gần nhất). Đây là hàm tài chính duy nhất không có giới hạn: `debts` có `LIMIT 5000`, `enrollmentDebts` có `LIMIT 5000`, `listRefunds` có `LIMIT 300`, `listCommissions` có `LIMIT 1000`.

Với 2.000 ghi danh đang học, đó là 4.000 truy vấn con trong một câu `SELECT`, trả toàn bộ về Node rồi mới ghép với bảng đơn. Router cũng không có tham số `page` (`packages/api/src/routers/finance.ts:144`).

**Bằng chứng**
- `packages/api/src/services/finance.ts:1374-1395` — không có `.limit(...)`.
- `packages/api/src/services/finance.ts:1383-1386` — `parentName`, `orderId`, `legacyOrderId` là ba truy vấn con tương quan.
- `packages/api/src/routers/finance.ts:144` — input chỉ có `centerId`, `kind`.

**Mức ảnh hưởng**: Cao · **Công sức**: S

**Cách làm gọn nhất**. Thêm `page` vào input (như `listOrders` ở `finance.ts:219`), `LIMIT 200 OFFSET`, và thay ba truy vấn con bằng hai `LEFT JOIN LATERAL` hoặc hai lượt nạp theo `inArray` như `refundGaps` đã làm (`finance.ts:130174` khối `refundGaps`) — trong kho đã có sẵn nguyên mẫu, chỉ cần chép cách làm.

---

## KT-07 — Ba thủ tục ảnh lớp là N+1 thuần: tối đa 200 ảnh × (1 truy vấn + 1 transaction), riêng duyệt còn chèn từng thông báo

**Hạng mục**: Hiệu năng

**Mô tả**. `submitMedia`, `restoreMedia`, `reviewMedia` đều theo khuôn "vòng lặp theo `id`, mỗi vòng một `loadMedia` rồi một `db.transaction`". Router cho phép tới **200 id** mỗi lượt.

Nặng nhất là `reviewMedia`: với mỗi ảnh được duyệt nó nạp danh sách người giám hộ rồi **chèn từng dòng `parent_notifications` trong vòng lặp**. Duyệt một lô 200 ảnh của lớp 20 em (mỗi em ~2 người giám hộ) = 200 truy vấn `loadMedia` + 200 transaction + ~8.000 lệnh `INSERT` đơn lẻ trong một yêu cầu HTTP. Trên kết nối có độ trễ 10 ms là hơn 80 giây — quá thời gian chờ của mọi tầng.

Việc "Duyệt toàn bộ" là thao tác hằng ngày của giáo vụ (bản gốc: "Duyệt toàn bộ / Loại ảnh", `docs/KHAO-SAT-GOC-2.md:220`).

**Bằng chứng**
- `packages/api/src/services/media.ts:200-218` — `submitMedia`, vòng lặp + transaction mỗi id.
- `packages/api/src/services/media.ts:220-240` — `restoreMedia`, cùng khuôn.
- `packages/api/src/services/media.ts:260-299` — `reviewMedia`; dòng 289-291 chèn `parentNotifications` từng dòng trong vòng lặp.
- `packages/api/src/routers/learning.ts:60, 61, 63` — `.max(200)`.

**Mức ảnh hưởng**: Cao · **Công sức**: M

**Cách làm gọn nhất**. Nạp cả lô một lần (`inArray(sessionMedia.id, ids)` + một lần nạp roster + một lần nạp đồng ý + một lần nạp người giám hộ), kiểm quyền và kiểm luật trên tập đã nạp, rồi **một** transaction với `UPDATE … WHERE id IN (…)` theo nhóm kết quả và **một** `INSERT … VALUES (nhiều dòng)` cho `parent_notifications` và `audit_log`. Giữ nguyên kiểu trả về `{ results, ok, failed }` để giao diện không phải sửa.

---

## KT-08 — Trạng thái trung tâm `suspended` và `onboarding` không được kiểm ở bất cứ đâu; `closed` không khoá được gì

**Hạng mục**: Nghiệp vụ — luồng "đóng một trung tâm"

**Mô tả**. `TENANT_STATUSES = ["onboarding", "active", "suspended", "closed"]`. Tìm toàn kho, chỉ có **một** chỗ đọc giá trị này cho mục đích nghiệp vụ: `tenantScope` loại tenant `closed` khỏi tầm nhìn của Hội sở. Ngoài ra:

- `suspended` và `onboarding`: **không có mã nào kiểm**.
- `closed`: nhân sự **của chính tenant đó** vẫn đăng nhập, vẫn tạo lớp, vẫn thu tiền, vẫn chấm công — vì `tenantScope` luôn `ids.add(home)` ở cuối, và nhánh `FRANCHISE` trả thẳng `[home]` trước khi lọc `closed`.
- Không có gì chuyển tenant sang chỉ-đọc, không khoá tài khoản, không đặt hạn lưu trữ, không xuất dữ liệu bàn giao.

Bản gốc có quy tắc tương ứng và **có thực thi**: "Chỉ đơn vị **Đang hoạt động** được tính khi xét quyền" (`docs/KHAO-SAT-GOC-2.md:398`).

**Bằng chứng**
- `packages/core/src/org/tenant.ts:40` — khai 4 trạng thái.
- `packages/core/src/org/tenant.ts:163-170` — `FRANCHISE` trả `[home]` trước khi lọc `closed`; dòng 169 `ids.add(home)`.
- `packages/core/src/org/tenant.ts:166` — chỗ duy nhất đọc `closed`.
- `packages/api/src/services/tenants.ts:155` — chỗ thứ hai (loại khỏi danh sách mô hình mẫu).
- Tìm `"suspended"` trong `packages/core/src`, `packages/api/src`, `apps/web/src`: không có kết quả nào ngoài dòng khai báo.

**Mức ảnh hưởng**: Cao · **Công sức**: M

**Cách làm gọn nhất**. Trong `packages/api/src/trpc.ts` (nơi đã có chốt chặn 2FA), thêm một chốt nữa: nạp trạng thái tenant của actor từ `ctx.tenants`; `closed` ⇒ chỉ cho các thủ tục `query` (chỉ-đọc) và `auth.*`; `suspended` ⇒ chặn mọi `mutation` trừ `finance.*` đọc và `auth.*`, kèm thông báo tiếng Việt nêu rõ lý do. Viết luật thuần ở `packages/core/src/org/tenant.ts` (`tenantWriteAllowed(status, path)`) để kiểm thử được.

---

## KT-09 — Đổi trạng thái trung tâm không có máy trạng thái và không kiểm điều kiện

**Hạng mục**: Nghiệp vụ — luồng "đóng một trung tâm"

**Mô tả**. `tenants.updateSettings` nhận `status` là một trong bốn giá trị rồi ghi thẳng. Không có bảng chuyển hợp lệ (đóng rồi mở lại thành `active` được ngay), không kiểm bất kỳ điều kiện nào: còn lớp đang chạy, còn buổi tương lai, còn công nợ chưa thu, còn kỳ công chưa chốt, còn hoàn tiền chờ duyệt — tất cả đều bỏ qua.

So sánh nội bộ: mọi thực thể khác trong hệ thống **đều** có máy trạng thái ở core (lead, lớp, buổi, ghi danh, học bù, ảnh, đơn từ, kỳ công, hoàn tiền). Tenant là thực thể **cao nhất** mà lại là thực thể duy nhất không có.

**Bằng chứng**
- `packages/api/src/services/tenants.ts:134` — chỉ kiểm `TENANT_STATUSES.includes(...)`.
- `packages/api/src/services/tenants.ts:141` — `tx.update(tenants).set({ status })` không điều kiện.
- `packages/core/src/org/tenant.ts` — không có hàm `tenantTransition`.
- Đối chiếu: `packages/core/src/hr/rules.ts:757` có `periodTransition`; `packages/core/src/classes/lifecycle.ts:44` có `classTransition`.

**Mức ảnh hưởng**: Cao · **Công sức**: M

**Cách làm gọn nhất**. Thêm `tenantTransition(from, to)` vào `packages/core/src/org/tenant.ts` với bảng: `onboarding → active | closed`, `active → suspended | closed`, `suspended → active | closed`, `closed → ∅`. Thêm `tenantCloseCheck({ runningClasses, futureSessions, outstandingDebt, openPeriods, pendingRefunds })` trả `{ blockers, warnings }` theo đúng khuôn `lockCheck` của kỳ công (`hr/rules.ts:787`). Gọi cả hai trong `tenants.updateSettings` trước khi ghi.

---

## KT-10 — Không tạo được vai trò tuỳ chỉnh; bản gốc có RBAC động

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Bản gốc có quyền `roles: manage assign` và một màn quản trị vai trò thật: "role có Mã · Tên · Loại (Hệ thống / …) · Số quyền · Người dùng; **mọi thay đổi yêu cầu lý do và ghi nhật ký**" (`docs/KHAO-SAT-GOC-2.md:405`).

Bản mới: 16 vai trò là hằng số TypeScript; trang `/roles` là ma trận **chỉ đọc**, ghi rõ "nguồn sự thật ở máy chủ, không sửa tay". Không có thủ tục nào tạo/sửa/xoá vai trò. Muốn một cơ sở có vai trò riêng (vd "Lễ tân" chỉ xem lịch và điểm danh) thì phải đổi `packages/core/src/policy/policy.ts` và triển khai lại.

Lối thoát hiện có là **nhóm người dùng** (`user_group_permissions`, chỉ cộng thêm quyền — `policy.ts:158-167`). Nó giải quyết được "cấp thêm", không giải quyết được "cấp ít hơn một vai trò có sẵn".

Đây là **đánh đổi có chủ ý** (xem QĐ-4 trong `docs/THIET-KE-HE-THONG.md`), nhưng vẫn là khoảng trống so với bản gốc và cần một quyết định rõ ràng thay vì để lửng.

**Bằng chứng**
- `packages/core/src/policy/policy.ts:8-25` — 16 vai trò hằng số.
- `packages/core/src/policy/policy.ts:90-112` — `ROLE_PERMISSIONS` hằng số.
- `apps/web/src/app/(admin)/roles/page.tsx:25` — "không sửa tay".
- `packages/api/src/routers/system.ts:46` — chỉ có `roles` (query), không có mutation.
- `docs/GAP-NGHIEP-VU.md` mục "Còn lại (sau 5 đợt)" — đã nêu là "cần quyết định", chưa quyết.

**Mức ảnh hưởng**: Cao · **Công sức**: L

**Cách làm gọn nhất** (nếu quyết làm). Không biến toàn bộ RBAC thành động. Thay vào đó: cho **nhóm người dùng loại trừ** — thêm cột `effect` (`grant | deny`) vào `user_group_permissions`, `deny` được xét **sau cùng** và thắng. Như vậy dựng được "vai trò hẹp" bằng cách gán vai trò rộng + nhóm `deny`, giữ nguyên ma trận tĩnh kiểm được ở compile-time. Công sức S–M thay vì L. Nếu vẫn cần vai trò tuỳ chỉnh thật thì mới làm bảng `roles` + `role_permissions` (L) và đổi `permissionsOf(role)` sang đọc từ ngữ cảnh.

---

## KT-11 — `makeup_requests` không có một chỉ mục nào

**Hạng mục**: Ràng buộc dữ liệu / hiệu năng

**Mô tả**. Bảng hàng đợi học bù được truy vấn theo `status` (trang `/hoc-bu?status=requested`), theo `enrollment_id` (hồ sơ học viên), theo `missed_session_id` và `target_session_id` (màn điểm danh và màn chọn buổi bù). Bảng khai **không có mảng chỉ mục nào** — mọi truy vấn là quét toàn bảng.

Cùng tệp, các bảng anh em đều có chỉ mục: `sessions` có 3, `enrollments` có, `attendance` có, `competency_criteria` có (`academics.ts:505`). `makeup_requests` bị bỏ sót.

Bảng này lớn nhanh: mỗi buổi vắng có thể sinh một dòng, và luật mặc định là "cứ vắng là chờ xếp bù" khi dữ liệu cũ chưa có quyết định (`packages/core/src/makeup/rules.ts:83`).

**Bằng chứng**
- `packages/db/src/schema/academics.ts:476-487` — khai bảng, không có tham số thứ ba.
- `packages/db/src/schema/academics.ts:494-506` — so sánh với `competency_criteria` có `index("criteria_course_idx")`.
- `packages/core/src/makeup/rules.ts:81-85` — luật suy diễn làm bảng phình.

**Mức ảnh hưởng**: Cao · **Công sức**: S

**Cách làm gọn nhất**. Thêm vào khai báo bảng:
`index("makeup_status_idx").on(t.status, t.createdAt)`, `index("makeup_enrollment_idx").on(t.enrollmentId)`, `index("makeup_missed_idx").on(t.missedSessionId)`, `index("makeup_target_idx").on(t.targetSessionId)`. Kèm đó rà 31 bảng khác cũng không có chỉ mục (xem `KT-19`).

---

## KT-12 — Trang `/tich-hop` báo "Rate limit (Upstash Redis)" đã sẵn sàng trong khi không có mã nào dùng Redis

**Hạng mục**: Thủ tục trả dữ liệu không đúng thực tế + bảo mật

**Mô tả**. `integrationStatus` đọc `UPSTASH_REDIS_REST_URL || REDIS_URL` và nếu có thì báo trạng thái `ok` với câu "Kho đếm: Redis (Upstash) — dùng chung cho mọi phiên bản máy chủ". **Không có chỗ nào khác trong kho đọc biến đó.** Toàn bộ giới hạn tần suất chạy bằng `MemoryRateLimiter` — bộ nhớ **của một tiến trình**.

Hệ quả thực tế: trên môi trường nhiều phiên bản (Vercel), trần "5 lượt / 10 phút" thành "5 lượt × số phiên bản", và reset về 0 sau mỗi lần khởi động nguội. Người quản trị nhìn trang `/tich-hop` thấy màu xanh và tin rằng chống dò đang hoạt động ở mức đã khai.

Đây là loại lỗi nguy hiểm nhất trong nhóm "trang báo cáo trạng thái": nó **không sai lặng lẽ, nó sai to tiếng theo hướng trấn an**.

**Bằng chứng**
- `packages/api/src/services/admin.ts:621` — `const redis = e.UPSTASH_REDIS_REST_URL || e.REDIS_URL;`
- `packages/api/src/services/admin.ts:624-626` — `status: redis ? "ok" : "warn"` + câu mô tả.
- `apps/web/src/lib/route-ctx.ts:45-48` — `rateLimited` dùng `MemoryRateLimiter`.
- `packages/core/src/security/rateLimit.ts:37-39` — chú thích của chính mô-đun: "Một tiến trình một bộ đếm — ở nhiều máy chủ thì đây chỉ là lớp chặn đầu tiên".
- Tìm `UPSTASH_REDIS_REST_URL` toàn kho: chỉ 2 kết quả, cả hai ở `admin.ts`.

**Mức ảnh hưởng**: Cao · **Công sức**: M

**Cách làm gọn nhất**. Chọn một trong hai, đừng để nửa vời:
- *Gọn nhất (S)*: sửa `admin.ts:624` thành `status: "warn"` cố định với câu đúng sự thật — "Bộ đếm nằm trong bộ nhớ từng tiến trình; ở nhiều phiên bản máy chủ trần thực tế cao hơn khai báo. Lớp chặn thật là Postgres (`otp_requests`, `login_events`) và WAF."
- *Đúng đắn (M)*: viết `RedisRateLimiter` cùng giao diện `hit/reset` với `MemoryRateLimiter`, gọi REST của Upstash bằng `fetch`; `route-ctx.ts` chọn bộ đếm theo biến môi trường. Giữ `MemoryRateLimiter` làm dự phòng khi Redis lỗi.

---

## KT-13 — Hai bộ đếm tần suất song song; hai route công khai tự dựng `Map` không dọn khoá

**Hạng mục**: Chất lượng mã + bảo mật

**Mô tả**. `packages/core/src/security/rateLimit.ts` được viết ra để thay đúng cái mà hai route này đang làm — chú thích đầu tệp nói thẳng: *"Bản cũ ở apps/web dùng Map không bao giờ dọn khoá cũ (rò rỉ bộ nhớ) và chỉ đếm theo IP nên đổi IP là dò tiếp được."*

Nhưng hai route công khai vẫn còn nguyên khuôn cũ: mỗi route một `const hits = new Map()` riêng, chỉ lọc mốc thời gian **trong khoá đang tra**, không bao giờ xoá khoá cũ. Bắn 1 triệu IP giả vào `/api/public/leads` là 1 triệu khoá nằm lại trong bộ nhớ tiến trình.

Các route khác đã dùng bộ đếm chung (`rateLimited` từ `route-ctx.ts`): `otp`, `track`, `chat`, `homework`, `jobs/[slug]`, `ph/login`, `ph/messages`, `auth/mfa`.

**Bằng chứng**
- `packages/core/src/security/rateLimit.ts:5-6` — chú thích nêu đúng lỗi này.
- `packages/core/src/security/rateLimit.ts:41-57` — `MemoryRateLimiter` có `maxKeys` và `sweep`.
- `apps/web/src/app/api/public/leads/route.ts:9-18` — `Map` riêng, không dọn khoá.
- `apps/web/src/app/api/public/survey/[token]/route.ts:5-13` — `Map` riêng thứ hai.
- `apps/web/src/lib/route-ctx.ts:45-48` — bộ đếm chung đã có sẵn.

**Mức ảnh hưởng**: Cao · **Công sức**: S

**Cách làm gọn nhất**. Xoá hai khối `Map` + hàm `limited` cục bộ, `import { rateLimited } from "@/lib/route-ctx"` và gọi `rateLimited(\`lead|${ip}\`, 5, 10*60_000)` / `rateLimited(\`survey|${ip}|${token}\`, 10, 10*60_000)`. Thuần xoá mã, không thêm phụ thuộc.

---

## KT-14 — Toàn bộ 25.978 dòng dịch vụ không có một kiểm thử đơn vị nào, và cấu hình `test` không thể nhận tệp trong `services/`

**Hạng mục**: Thiếu kiểm thử cho logic phức tạp

**Mô tả**. `packages/core` có 55 tệp kiểm thử phủ gần kín (rà thử: chỉ `dates.ts` là yếu). `packages/api` có **2** tệp kiểm thử, cả hai cho tiện ích thuần (`zip.ts`, `webpush.ts`) — **không có tệp nào cho 74 dịch vụ**.

Tệ hơn: lệnh chạy kiểm thử là `node --test --import tsx src/*.test.ts` — mẫu **một cấp**, không đệ quy. Kể cả khi ai đó viết `src/services/finance.test.ts`, lệnh sẽ **không chạy nó** và CI vẫn xanh.

Phần logic nguy hiểm nhất của hệ thống nằm đúng ở tầng này: giao dịch nhiều bảng, phân bổ tiền vào đợt, huỷ lớp dây chuyền, áp đơn từ lên lịch và công, đối soát ngân hàng. Hiện chỉ có kịch bản khói bằng `curl` trong CI (`.github/workflows/ci.yml`) và hai kịch bản PowerShell (xem `KT-20`).

`docs/CHECKLIST-DOI-SANH.md:102` ghi "214 kiểm thử quy tắc lõi, 5 kiểm thử API" — con số 5 đó là 5 `test()` trong hai tệp tiện ích, không phải kiểm thử API.

**Bằng chứng**
- `packages/api/package.json:13` — `"test": "node --test --import tsx src/*.test.ts"`.
- `find packages/api -name "*.test.ts"` → chỉ `src/zip.test.ts`, `src/webpush.test.ts`.
- `packages/api/src/services/` — 74 tệp, 25.978 dòng, 0 tệp kiểm thử.

**Mức ảnh hưởng**: Cao · **Công sức**: L (nhưng bước đầu là S)

**Cách làm gọn nhất**. Bước đầu tốn 30 phút và đáng làm ngay: đổi thành `"test": "node --test --import tsx 'src/**/*.test.ts'"`. Sau đó viết kiểm thử tích hợp cho **năm** đường nguy hiểm nhất, dùng Postgres của CI (đã có sẵn dịch vụ trong `ci.yml`) + `createCaller`: (1) huỷ lớp dây chuyền, (2) duyệt đơn nghỉ buổi dạy — bắt được `KT-01`, (3) đối soát rót tiền cho nhiều con, (4) chốt kỳ công rồi thử ghi công, (5) ma trận tenant cho bốn màn tài chính — bắt được `KT-04`.

---

# C. Trung bình

## KT-15 — Màn Học viên thiếu bộ lọc lớp và ba bộ lọc vận hành của bản gốc

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Bản gốc `/students` lọc theo: `Đang học · Chờ xếp lớp · Bảo lưu · Vắng nhiều (frequent-absent) · Tái tục · Nghỉ học`, cộng lọc theo **cơ sở và lớp**, tìm theo tên/mã/phụ huynh/SĐT.

Bản mới có lọc cơ sở, trạng thái hồ sơ (6 giá trị khác), khối lớp và ô tìm — **không có lọc theo lớp**, và ba trạng thái vận hành `Chờ xếp lớp`, `Vắng nhiều`, `Tái tục` không có tương đương. Ba cái này không phải trạng thái hồ sơ mà là truy vấn: "đang học nhưng chưa có ghi danh vào lớp nào" · "vắng ≥ N buổi trong M tuần" · "vừa hoàn thành khoá, chưa ghi danh khoá tiếp".

"Vắng nhiều" đã có dưới dạng việc chăm sóc ở `/canh-bao-rui-ro`, nhưng giáo vụ ở màn Học viên vẫn không lọc được.

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:154-156` — bộ lọc của bản gốc.
- `apps/web/src/app/(admin)/students/page.tsx:12` — `STATUSES` chỉ có 6 giá trị hồ sơ.
- `apps/web/src/app/(admin)/students/page.tsx:43-58` — form lọc: `q`, `center`, `status`, `grade`. Không có `class`.
- `packages/api/src/services/students.ts:43` — nhãn 6 trạng thái hồ sơ.

**Mức ảnh hưởng**: Trung bình · **Công sức**: S

**Cách làm gọn nhất**. Thêm vào input của `students.list`: `classId` (join `enrollments` trạng thái mở) và `view: "unplaced" | "frequent_absent" | "renewing"`. Ba `view` này dựng bằng `EXISTS` / `NOT EXISTS` trên `enrollments` + `attendance`, không cần cột mới.

## KT-16 — Học bạ `/hoc-ba` không xuất PDF được

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Bản gốc: "`/hoc-ba` — Học bạ (chọn học viên → xem quá trình học tổng hợp + **xuất PDF**)". Bản mới có trang xem đầy đủ nhưng không có nút in/xuất. Chứng nhận hoàn thành khoá thì có (`window.print()`), học bạ thì không — nên phụ huynh xin bản in học bạ hiện không có đường đáp ứng.

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:182` — bản gốc có xuất PDF.
- `apps/web/src/app/(admin)/hoc-ba/page.tsx:1-8` — không import thành phần in nào.
- Đối chiếu có sẵn: `apps/web/src/app/(admin)/hoan-thanh-khoa/chung-nhan/[id]/print.tsx:4`.

**Mức ảnh hưởng**: Trung bình · **Công sức**: S

**Cách làm gọn nhất**. Chép nguyên `print.tsx` của chứng nhận, thêm một tệp CSS `@media print` cho trang học bạ (ẩn menu, bỏ nền, ngắt trang giữa các học bạ). Không cần thư viện PDF — trình duyệt in ra PDF là đủ, đúng cách chứng nhận đang làm.

## KT-17 — Không nhập được Excel cho Học viên, Lớp, Nhân sự

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Bản gốc có nút "Import Excel" ở ba màn: `/students` (`KHAO-SAT-GOC-2.md:156`), `/classes` (`:193`), `/nhan-su` (`:235`). Bản mới chỉ có bốn nơi đọc tệp: `/leads/import`, `/nhap-giao-dich-cu`, `/bien-dong-so-du`, `/chuyen-doi`.

`/chuyen-doi` **có** nhập học viên và ghi danh nhưng đó là công cụ **chuyển đổi một lần từ hệ cũ** (bắt buộc `legacyCode`, ghi `legacy_refs`, gắn `import_batches`) — không dùng để nhập bổ sung hằng ngày. Nhập lớp và nhập nhân sự thì không có đường nào.

Hạ tầng đọc `.xlsx` đã sẵn (`apps/web/src/components/xlsx.ts`, `csv-file-input.tsx`), nên đây là việc ghép chứ không phải việc xây mới.

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:156, 193, 235`.
- `grep -rl "readWorkbook|CsvFileInput" apps/web/src/app/(admin)/` → 4 tệp, không có `students`, `classes`, `nhan-su`.
- `apps/web/src/components/xlsx.ts:4-22` — hạ tầng đã có.

**Mức ảnh hưởng**: Trung bình · **Công sức**: M

**Cách làm gọn nhất**. Dùng lại khuôn ba bước của `/leads/import` (xem trước → ba nhóm Hợp lệ / Trùng / Lỗi → ghi thật). Ưu tiên `nhan-su` trước (ít quan hệ nhất), rồi `students`, cuối cùng `classes` (phức tạp vì kéo theo lịch và sinh buổi).

## KT-18 — Không có module Kỳ thi, Ngân hàng câu hỏi, Vinh danh

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Ba nhóm quyền của bản gốc không có thực thể tương ứng trong bản mới:

| Quyền gốc | Nội dung | Bản mới |
|---|---|---|
| `exams: view create edit delete grade` | Kỳ thi, đăng ký thi, chấm thi | Chỉ có `ORDER_TYPES` chứa `"exam"` và nhãn "Lệ phí thi" trong biểu mẫu ghi học phí — **không có bảng, không có màn** |
| `questions: view author edit delete` | Ngân hàng câu hỏi | Không có (`eval_questions` là câu hỏi phiếu khảo sát, `/huong-dan` là câu hỏi ôn tập nội bộ) |
| `honors: view create edit delete settings` | Vinh danh học viên | Không có (chỉ có "Thưởng danh hiệu" trong máy hoa hồng) |

Hệ quả cụ thể: thu được tiền lệ phí thi nhưng không quản lý được ai thi, thi gì, ngày nào, kết quả ra sao.

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:33, 35, 54` — ba nhóm quyền của bản gốc.
- `packages/core/src/finance/rules.ts:7-9` — `exam` là loại đơn, không phải thực thể.
- Tìm toàn kho: không có bảng `exams` / `questions` / `honors` trong `packages/db/src/schema/`.

**Mức ảnh hưởng**: Trung bình · **Công sức**: L

**Cách làm gọn nhất**. Không làm cả ba. Quyết định theo giá trị: **Kỳ thi** đáng làm nhất vì đã có dòng tiền chảy qua — bắt đầu bằng ba bảng (`exams`, `exam_registrations`, `exam_results`) gắn `orderItems.examId`, không cần chấm thi trực tuyến ở đợt đầu. **Vinh danh** làm sau bằng một bảng `honors` + trang danh sách. **Ngân hàng câu hỏi** hoãn tới khi có nhu cầu thi trực tuyến thật.

## KT-19 — 32 bảng không có chỉ mục nào, trong đó có `centers`, `parents`, `affiliates`, `stock_levels`

**Hạng mục**: Ràng buộc dữ liệu / hiệu năng

**Mô tả**. Rà toàn bộ 169 bảng: 32 bảng khai mà không có `index()` hay `uniqueIndex()` nào. Một số chấp nhận được (bảng cấu hình một dòng như `app_settings`, `tenant_settings`, `automation_settings`; bảng có khoá chính là khoá tra như `parent_private`, `staff_private`, `student_private`, `order_private`). Nhưng những bảng sau bị tra thường xuyên và đáng có chỉ mục:

| Bảng | Tra theo gì |
|---|---|
| `parents` | `phone` — xem `KT-02` |
| `makeup_requests` | `status`, `enrollment_id` — xem `KT-11` |
| `centers` | `code`, `tenant_id` |
| `affiliates` | `code` (đường `?ref=MÃ` công khai) |
| `stock_levels` | `item_id`, `center_id` |
| `campaigns` | `center_id`, khoảng ngày |
| `survey_responses` | `invite_id`, `created_at` |
| `einvoice_events` | `einvoice_id` |
| `candidate_events` | `candidate_id` |
| `coin_rules`, `reward_items` | `center_id`, `is_active` |

**Bằng chứng**
- Kết quả rà tự động toàn bộ `packages/db/src/schema/*.ts` (32 bảng không có mảng chỉ mục).
- `packages/db/src/schema/org.ts:23` — `centers`.
- `packages/db/src/schema/outreach.ts:148` — `affiliates`.
- `packages/db/src/schema/people.ts:44` — `parents`.

**Mức ảnh hưởng**: Trung bình · **Công sức**: S

**Cách làm gọn nhất**. Một lượt sửa `packages/db/src/schema/*.ts` thêm mảng chỉ mục cho 10 bảng trên. Trước khi làm, chạy `pg_stat_statements` trên môi trường có dữ liệu mẫu để xác nhận thứ tự ưu tiên — đừng thêm chỉ mục cho bảng không ai tra.

## KT-20 — Kịch bản kiểm thử đầu-cuối chỉ chạy được trên Windows

**Hạng mục**: Kiểm thử / vận hành

**Mô tả**. Hai kịch bản kiểm thử toàn diện là PowerShell (`scripts/kiem-thu/kich-ban-toan-dien.ps1`, `kich-ban-vai-tro.ps1`), và lệnh khởi động cũng gọi PowerShell (`package.json:11`). CI chạy `ubuntu-latest` nên **không chạy được hai kịch bản này** — CI chỉ có `curl` gọi khoảng 100 đường dẫn (`.github/workflows/ci.yml`).

Nghĩa là hai tài liệu `docs/KIEM-THU-TOAN-DIEN.md` (275 dòng) và `docs/KIEM-THU-VAI-TRO.md` phụ thuộc vào việc có người chạy tay trên máy Windows. Không có gì chặn một thay đổi làm hỏng kịch bản đó lọt vào nhánh chính.

**Bằng chứng**
- `scripts/kiem-thu/kich-ban-toan-dien.ps1`, `scripts/kiem-thu/kich-ban-vai-tro.ps1` — phần mở rộng `.ps1`.
- `package.json:11` — `"khoi-dong": "powershell -ExecutionPolicy Bypass -File ./scripts/khoi-dong.ps1"`.
- `.github/workflows/ci.yml` — `runs-on: ubuntu-latest`, các bước khói dùng `curl`.

**Mức ảnh hưởng**: Trung bình · **Công sức**: M

**Cách làm gọn nhất**. Viết lại hai kịch bản bằng TypeScript chạy qua `tsx` với `createCaller` của tRPC (đã có sẵn, `packages/api/src/index.ts:69`) — không cần HTTP, chạy nhanh hơn, và chạy được cả trên Windows lẫn CI. Giữ `.ps1` cho tới khi bản TS chạy xanh trong CI rồi mới xoá.

## KT-21 — Nhập giao dịch cũ khớp SĐT bằng hàm trên cột nên không dùng được chỉ mục

**Hạng mục**: Hiệu năng

**Mô tả**. Đường nhập giao dịch cũ khớp phụ huynh bằng `right(regexp_replace(parents.phone, '\D', '', 'g'), 9)`. Hàm bọc quanh cột ⇒ Postgres **không** dùng được chỉ mục B-tree thường, kể cả sau khi sửa `KT-02`. Với lô tối đa 3.000 dòng (`packages/api/src/routers/finance.ts:188`), đây là một lần quét toàn bảng `parents` cho mỗi lượt xem trước và mỗi lượt ghi thật.

**Bằng chứng**
- `packages/api/src/services/bank.ts:857` — biểu thức khớp.
- `packages/api/src/routers/finance.ts:188, 192` — `.max(3000)` dòng mỗi lô.

**Mức ảnh hưởng**: Trung bình · **Công sức**: S

**Cách làm gọn nhất**. Sau khi `KT-02` chuẩn hoá `parents.phone` về dạng `84xxxxxxxxx`, đổi biểu thức thành `inArray(parents.phone, variants)` như `parentPortal.ts:31` và `compliance.ts:59` đang làm. Nếu muốn giữ khớp theo 9 số cuối thì thêm chỉ mục biểu thức: `CREATE INDEX parents_phone_tail_idx ON parents (right(regexp_replace(phone,'\D','','g'), 9));`

## KT-22 — `buildDays` nạp ngày lễ của mọi cơ sở rồi mới lọc trong JavaScript

**Hạng mục**: Hiệu năng

**Mô tả**. Trong khi năm truy vấn song song khác đều có điều kiện theo `staffId`, truy vấn ngày lễ chỉ lọc theo khoảng ngày — nạp về ngày lễ của **mọi cơ sở và mọi tenant**, rồi lọc `h.centerId === null || h.centerId === p.centerId` ở vòng lặp JavaScript. Đây cũng là một chỗ **thiếu lọc tenant** (bảng `holidays` nằm trong nhóm bảng học vụ).

Ảnh hưởng còn nhỏ vì bảng ngày lễ nhỏ, nhưng sẽ lớn dần theo số tenant.

**Bằng chứng**
- `packages/api/src/services/hrShared.ts:164` — `db.select().from(holidays).where(and(gte(date, from), lte(date, to)))`.
- `packages/api/src/services/hrShared.ts:200` — lọc theo cơ sở trong JS.

**Mức ảnh hưởng**: Trung bình · **Công sức**: S

**Cách làm gọn nhất**. Thêm vào `where`: `or(isNull(holidays.centerId), inArray(holidays.centerId, [...new Set(people.map(p => p.centerId))]))`.

## KT-23 — Hai màn tài chính không phân trang, chỉ chặn bằng `LIMIT 5000`

**Hạng mục**: Hiệu năng

**Mô tả**. `debts` và `enrollmentDebts` lấy tối đa 5.000 dòng rồi trả hết về trình duyệt. Router không có `page` (`packages/api/src/routers/finance.ts:136, 138-140`). Với chuỗi 10 cơ sở, 5.000 dòng công nợ kèm tên học viên và số tiền là gói JSON vài megabyte cho mỗi lần mở trang — và khi vượt 5.000 thì **dòng bị cắt lặng lẽ**, người dùng không biết mình đang xem thiếu.

**Bằng chứng**
- `packages/api/src/services/finance.ts:1322` (`debts`) và `:1524` (`enrollmentDebts`) — `.limit(5000)`.
- `packages/api/src/routers/finance.ts:136, 138-140` — input không có `page`.
- Đối chiếu: `listOrders` (`finance.ts:219`) và `listPayments` (`:1167`) đều có `page`.

**Mức ảnh hưởng**: Trung bình · **Công sức**: S

**Cách làm gọn nhất**. Thêm `page` như `listOrders`, trả `{ items, total, page, pageSize }`, và khi `total > pageSize` thì hiện thanh phân trang (`components/admin-ui.tsx` đã có `Pager`).

## KT-24 — 389 chỗ `as unknown as Db` để lách kiểu transaction của Drizzle

**Hạng mục**: Ép kiểu nguy hiểm

**Mô tả**. Không có `as any` nào trong kho (tốt), nhưng có **389** chỗ `as unknown as` — gần như toàn bộ là `tx as unknown as Db` khi truyền đối tượng transaction của Drizzle vào hàm nhận `Database`. Đây là ép kiểu **hai tầng**, tức là tắt hẳn kiểm tra kiểu ở ranh giới quan trọng nhất của hệ thống (nơi phân biệt "đang trong giao dịch" với "không trong giao dịch").

Rủi ro thật: nếu ai đó truyền nhầm `ctx.db` (ngoài giao dịch) vào chỗ cần `tx`, trình biên dịch **không báo gì** vì kiểu đã bị ép. Nghiệp vụ rollback nhưng nhật ký hoặc sự kiện outbox vẫn nằm lại — đúng thứ mà thiết kế "ghi audit trong cùng transaction" sinh ra để tránh.

**Bằng chứng**
- Đếm toàn kho: 389 kết quả cho `as unknown as`.
- `packages/api/src/services/growth.ts:23` — `const asDb = (d: Database) => d as unknown as Db;` (đã gom thành một hàm, cách làm tốt nhất hiện có).
- `packages/api/src/services/admissionsAdmin.ts:69, 204, 245, 255, 280, 281, 296, 318, 424, 425, 463, 501, 532` — 13 chỗ chỉ trong một tệp.
- `packages/api/src/services/sessions.ts:155, 201, 224, 227, 279, 284, 286`.

**Mức ảnh hưởng**: Trung bình · **Công sức**: M

**Cách làm gọn nhất**. Khai một kiểu chung trong `packages/api/src/services/hrShared.ts` (hoặc một tệp `db-types.ts` mới):
`export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];`
`export type AnyDb = Database | Tx;`
rồi đổi chữ ký các hàm phụ trợ (`writeAudit`, `emit`, `notify`, `deliverNotifications`) sang nhận `AnyDb`. Làm xong thì 389 chỗ ép kiểu biến mất mà không phải sửa thân hàm nào. Đây là việc cơ khí, làm một lượt bằng tìm-thay.

## KT-25 — Không có ưu đãi theo khoá, không có luồng duyệt giảm giá và duyệt trả góp

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Bản gốc có hai quyền phê duyệt riêng: `discounts: approve` và `installments: approve` (`docs/KHAO-SAT-GOC-2.md:23, 40`). Bản mới **không có quyền nào tương ứng** trong 124 chuỗi quyền đang dùng: giảm giá chỉ bị chặn bằng trần % cấu hình được (mặc định 50%) và bắt buộc ghi lý do; kế hoạch trả góp chỉ bị chặn bằng số đợt ≤ 12 và tổng phải khớp. Ai có `finance:create` là tự quyết.

Ngoài ra bản gốc có bảng ưu đãi theo khoá (`course_discounts`) tách khỏi giảm giá theo dòng — bản mới không có, nên mọi chương trình khuyến mãi phải nhập tay từng đơn.

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:23, 40` — hai quyền của bản gốc.
- Danh sách 124 quyền đang dùng: không có `discount:*` hay `installment:*`.
- `packages/core/src/finance/rules.ts:153` — `DEFAULT_MAX_LINE_DISCOUNT_PCT = 50` là chốt chặn duy nhất.
- Tìm `course_discounts` toàn kho: không có kết quả.

**Mức ảnh hưởng**: Trung bình · **Công sức**: M

**Cách làm gọn nhất**. Đừng dựng luồng duyệt đầy đủ ngay. Bước một (S): thêm ngưỡng trong cấu hình vận hành — giảm quá `X%` hoặc quá `Y` đồng thì đơn vào trạng thái `chờ duyệt giảm giá`, cần quyền `finance:approve` (quyền này **đã có**, `packages/core/src/policy/policy.ts:100`) mới ghi nhận được khoản thu. Bước hai (M): bảng `course_discounts` + gợi ý tự động khi tạo đơn.

## KT-26 — LMS nội bộ của bản gốc (18 quyền) chỉ có phần Hướng dẫn và SCORM

**Hạng mục**: Nghiệp vụ gốc còn thiếu

**Mô tả**. Bản gốc có một hệ đào tạo nội bộ khá đầy đủ với 18 quyền `elearning:*`: cổng học, chương trình đào tạo, soạn và xuất bản nội dung, giao bài và gia hạn, yêu cầu bắt buộc, theo dõi tiến độ ba cấp (của mình / của nhóm / toàn bộ), phân tích video, chấm thi, mở khoá thi, cấp và thu hồi chứng nhận, xuất báo cáo.

Bản mới có: `/huong-dan` (6 bài theo vai trò kèm câu hỏi kiểm tra, có ghi `training_completions`) và `/scorm` (chạy gói SCORM 1.2/2004, ghi `scorm_attempts`). Thiếu: chương trình đào tạo bắt buộc theo vai trò, tiến độ theo nhóm, chứng nhận nội bộ, xuất báo cáo đào tạo.

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:25-28` — 18 quyền của bản gốc.
- `apps/web/src/app/(admin)/huong-dan/page.tsx:25` — 6 bài + quiz.
- `packages/db/src/schema/migration.ts` — `training_completions`.
- `packages/db/src/schema/content.ts` — `scorm_attempts`, không có bảng chương trình đào tạo.

**Mức ảnh hưởng**: Trung bình · **Công sức**: L

**Cách làm gọn nhất**. Hoãn. Mục này chỉ đáng làm sau khi hệ thống chạy thật ổn định. Khi làm, mở rộng `training_completions` thành `training_programs` + `training_requirements` + `training_progress` và tận dụng lại `documents`/`scorm` đã có thay vì dựng kho nội dung thứ hai.

---

# D. Thấp

## KT-27 — Trang bắt-tất-cả `[...slug]` đã chết cùng trường `ready` và `phase`

**Hạng mục**: Mã chết

**Mô tả**. Trang `(admin)/[...slug]/page.tsx` được viết cho giai đoạn xây dở: mục menu có `ready: false` thì mở trang "Đang xây dựng". Rà `ALL_NAV_ITEMS`: **118/118 mục đều `ready: true`** ⇒ điều kiện `if (!item || item.ready) notFound()` luôn đúng ⇒ trang không bao giờ render. Kéo theo: trường `phase`, bảng `PHASE_VI`, và chấm tròn "Đang xây dựng" trong sidebar cũng thành mã chết.

Trang này còn tham chiếu `docs/ADMIN-SPEC.md` như nguồn phạm vi — người đọc mã sẽ tưởng còn màn chưa xây.

**Bằng chứng**
- `apps/web/src/app/(admin)/[...slug]/page.tsx:25` — `if (!item || item.ready) notFound();`
- `apps/web/src/lib/admin-nav.ts` — 118 mục, tất cả `ready: true`.
- `apps/web/src/lib/admin-nav.ts:12-14` — `ready?`, `phase?`.
- `apps/web/src/components/admin-shell.tsx:136` — `{!i.ready && …}` không bao giờ đúng.

**Mức ảnh hưởng**: Thấp · **Công sức**: S

**Cách làm gọn nhất**. Xoá thư mục `[...slug]`, xoá hai trường `ready`/`phase` khỏi `NavItem` và khỏi 118 mục, xoá nhánh `!i.ready` trong `admin-shell.tsx`. Thuần xoá, không đổi hành vi.

## KT-28 — Nhãn không nhất quán giữa các trang

**Hạng mục**: Ngôn ngữ / nhãn

**Mô tả**. Ba chỗ lệch, đều nhỏ nhưng làm người mới bối rối:

| Khái niệm | Dùng ở đâu | Dạng lệch |
|---|---|---|
| Ghi danh | 29 chỗ "Ghi danh" | 4 chỗ "Đăng ký học" — ngay trên trang `/enrollments` tiêu đề là "Đăng ký học" còn nút lại là "+ Ghi danh" |
| Bộ lọc cơ sở | 28 chỗ "Mọi cơ sở" | 3 chỗ "Tất cả cơ sở" |

Không tìm thấy lỗi chính tả tiếng Việt nào (đã rà 16 dạng sai thường gặp: "sử lý", "sát nhập", "đăng kí", "qui định", "bổ xung"…).

**Bằng chứng**
- `apps/web/src/app/(admin)/enrollments/page.tsx:9` — `title: "Đăng ký học"`; cùng tệp dòng 39 — nút "+ Ghi danh".
- `apps/web/src/app/(admin)/enrollments/[id]/page.tsx:27`, `apps/web/src/app/(admin)/students/[id]/page.tsx:105` — "Đăng ký học".
- `apps/web/src/app/(admin)/bao-cao/doanh-thu/page.tsx:38`, `apps/web/src/app/(admin)/inventory/dashboard/page.tsx:57`, `apps/web/src/app/(admin)/chuyen-doi/page.tsx:71` — "Tất cả cơ sở".

**Mức ảnh hưởng**: Thấp · **Công sức**: S

**Cách làm gọn nhất**. Chọn "Ghi danh" (ngắn, đúng nghiệp vụ, đang là đa số) và "Mọi cơ sở"; sửa 7 chỗ lệch. Ghi hai từ này vào một mục "Từ điển thuật ngữ" trong `docs/THIET-KE-HE-THONG.md` để lần sau không lệch lại.

## KT-29 — `packages/core/src/dates.ts` gần như không có kiểm thử riêng

**Hạng mục**: Thiếu kiểm thử

**Mô tả**. Rà toàn bộ `packages/core`: 8 hàm xuất của `dates.ts` (`addDays`, `parseISODate`, `toISODate`, `compareISODate`, `isBetween`, `minutesOf`, `timeRangesOverlap`, `weekdayOf`) chỉ có 1 được nhắc tên trong 55 tệp kiểm thử. Đây là tệp duy nhất trong `packages/core` ở tình trạng này — mọi tệp khác đều được phủ.

Các hàm này bị dùng khắp nơi cho **tiền và công**: `allocateInstallments` tính ngày quá hạn, `buildPlan` tính hạn đợt, `datesBetween` dựng bảng công. Sai một ngày ở đây là sai tuổi nợ và sai số công.

**Bằng chứng**
- Rà tự động `packages/core/src/**/*.ts` đối chiếu với 55 tệp `*.test.ts`: chỉ `dates.ts` có tỉ lệ phủ < 50%.
- `packages/core/src/dates.ts` — 49 dòng, 8 hàm xuất.
- Nơi dùng: `packages/core/src/finance/rules.ts:5`, `packages/core/src/hr/rules.ts:8`.

**Mức ảnh hưởng**: Thấp · **Công sức**: S

**Cách làm gọn nhất**. Một tệp `packages/core/src/dates.test.ts` khoảng 40 dòng, tập trung vào biên: qua tháng, qua năm, năm nhuận (29/02/2028), múi giờ Việt Nam, `timeRangesOverlap` với khoảng chạm mép.

## KT-30 — Mã cũ của kỳ công (`locked`) vẫn còn trong enum CSDL

**Hạng mục**: Nợ dữ liệu

**Mô tả**. `PERIOD_STATUS_DB` cố ý gồm cả giá trị cũ `"locked"` để đọc được dữ liệu cũ, và `normalizePeriodStatus` quy về `closed`. Đúng cách làm khi đang chuyển đổi, nhưng cần một lần dọn: sau khi chạy `UPDATE timesheet_periods SET status='closed' WHERE status='locked'` thì bỏ `PERIOD_STATUS_LEGACY` để enum chỉ còn 5 giá trị thật.

Để lâu thì mọi người đọc mã phải tự hỏi "`locked` khác `closed` chỗ nào" — mỗi lần một người.

**Bằng chứng**
- `packages/core/src/hr/rules.ts:740` — `PERIOD_STATUS_LEGACY = ["locked"]`.
- `packages/core/src/hr/rules.ts:742` — `PERIOD_STATUS_DB` gộp cả hai.
- `packages/core/src/hr/rules.ts:745` — `normalizePeriodStatus`.

**Mức ảnh hưởng**: Thấp · **Công sức**: S

**Cách làm gọn nhất**. Thêm câu `UPDATE` vào `packages/db/sql/0001_constraints.sql`, rồi xoá `PERIOD_STATUS_LEGACY` và đơn giản hoá `normalizePeriodStatus`. Làm sau khi go-live, không làm trước.

## KT-31 — Cấu hình `test` của `packages/api` dùng mẫu một cấp

**Hạng mục**: Cấu hình kiểm thử

**Mô tả**. Tách riêng khỏi `KT-14` vì đây là một dòng sửa và nên làm ngay cả khi chưa viết thêm kiểm thử nào: `src/*.test.ts` không đệ quy, nên bất kỳ tệp kiểm thử nào đặt trong `src/services/` hay `src/routers/` sẽ **bị bỏ qua trong im lặng** và CI vẫn báo xanh. Đây là cái bẫy đặt sẵn cho người viết kiểm thử tiếp theo.

**Bằng chứng**
- `packages/api/package.json:13` — `"test": "node --test --import tsx src/*.test.ts"`.
- Đối chiếu: `packages/core/package.json` chạy toàn bộ cây.

**Mức ảnh hưởng**: Thấp · **Công sức**: S

**Cách làm gọn nhất**. `"test": "node --test --import tsx 'src/**/*.test.ts'"` (nhớ dấu nháy để shell không tự khai triển).

## KT-32 — Bộ quyền hẹp hơn bản gốc ở vài chỗ tinh vi

**Hạng mục**: Nghiệp vụ gốc — hành vi khác

**Mô tả**. Bản gốc có 164 quyền; bản mới dùng 124 chuỗi quyền với cách gom khác (rộng hơn ở chỗ này, hẹp hơn ở chỗ kia). Đa số chênh lệch là **cố ý và hợp lý** (gom `blog/news/jobs` thành `site:*`, gom `payments/orders/installments` thành `finance:*`). Nhưng có bốn quyền của bản gốc bị gom mất mà **hệ quả là nới lỏng kiểm soát**:

| Quyền gốc | Bản mới gom vào | Hệ quả |
|---|---|---|
| `students: change-code` | `student:update` | Ai sửa được hồ sơ là đổi được mã học viên |
| `leads: overwrite` | `lead:update` | Ai sửa lead là ghi đè được khi nhập trùng |
| `leads: export`, `students:` xuất | không có quyền riêng | Ai đọc được là xuất CSV toàn bộ (tối đa 10.000 dòng) được |
| `discounts: approve`, `installments: approve` | `finance:create` | Xem `KT-25` |

**Bằng chứng**
- `docs/KHAO-SAT-GOC-2.md:23, 40, 42-43, 64` — bộ quyền gốc.
- Danh sách 124 quyền đang dùng (rà tự động `requirePermission` / `hasPermission` / `authorize` / `can` / `perm:`).
- `apps/web/src/components/export-all-button.tsx` — xuất không có quyền riêng.

**Mức ảnh hưởng**: Thấp · **Công sức**: S

**Cách làm gọn nhất**. Thêm ba quyền vào `ROLE_PERMISSIONS`: `student:change_code`, `lead:overwrite`, `*:export` — cấp cho `CENTER_MANAGER` trở lên. Kiểm ở đúng ba chỗ: `students.update` khi `code` thay đổi, đường "Đè" của nhập lead, và `export-all` của mọi loại. Ba lần gọi `requirePermission`, không phải việc lớn.

---

# E. Đã kiểm tra và thấy đầy đủ

_Ghi lại để lần rà sau không mất công kiểm lại. Đây là những chỗ tôi đã nghi là khoảng trống nhưng đọc mã thấy đã có._

| Nghi vấn | Kết luận | Bằng chứng |
|---|---|---|
| Geofence chỉ gắn cờ chứ không chặn (bản gốc đổi từ 07/09) | **Đã chặn thật** — `checkPointGeofence` không ok thì ném lỗi trước khi ghi lượt | `packages/api/src/services/hrCheckin.ts:152-153` |
| Trần tổng tỉ lệ hoa hồng 9% | **Có**, cộng dồn theo sự kiện + loại đơn + phạm vi cơ sở, bậc lấy % cao nhất | `packages/core/src/finance/commission.ts:192, 244-289` |
| Sinh mã học viên bằng `count(*)` gây trùng (lỗi cũ nêu ở `GAP-NGHIEP-VU.md`) | **Đã sửa** — dùng `max(code)` khớp mẫu, gọi trong transaction | `packages/api/src/services/students.ts:357-364` |
| `sessions.transition` cho phép `reschedule` mà không sinh buổi thay thế (lỗi cũ) | **Đã sửa** — router chỉ nhận 5 sự kiện, `cancel`/`reschedule` đi luồng riêng | `packages/api/src/routers/academics.ts:55-58` |
| `transition` cho phép `enroll` trực tiếp, bỏ qua kiểm thu tiền (lỗi cũ) | **Đã sửa** — `enroll` không nằm trong `MANUAL_LEAD_EVENTS` và không có trong enum zod | `packages/core/src/admissions/leadMachine.ts:67` |
| Nhập lịch phân ca từ Sheet chỉ là nhãn, không có thủ tục | **Có thật** — `importRoster` có chạy thử, bảo vệ ô sửa tay và ô từ đơn, ghi `roster_imports` | `packages/api/src/services/hr.ts:660-703`, `packages/api/src/routers/hr.ts:95-97` |
| Trang trong menu nhưng chưa nối API thật | **Không có** — rà 156 trang quản trị, chỉ `cham-cong/checkin/page.tsx` không gọi tRPC, và đó là **đúng** (trang bọc, panel con gọi API) | `apps/web/src/app/(admin)/cham-cong/checkin/page.tsx:1-27` |
| Nút bấm không có xử lý | **Không có** — mọi `<button>` không `onClick` đều nằm trong `<form>` có `onSubmit` hoặc `action` | rà toàn bộ `apps/web/src/**/*.tsx` |
| Thủ tục trả dữ liệu giả / `Math.random` | **Không có** trong đường nghiệp vụ; chỉ `packages/db/src/seed.ts` sinh dữ liệu mẫu | rà `"giả lập"`, `"mô phỏng"`, `"tạm thời"` toàn kho |
| `as any` | **Không có chỗ nào** trong toàn kho | rà `apps`, `packages`, `scripts` |
| `TODO` / `FIXME` rải rác | **Chỉ một** — và nó là `KT-01` | `packages/api/src/services/hrSessionEffects.ts:4` |
| Nhật ký thao tác có thể mất khi nghiệp vụ lỗi | **Không** — `writeAudit` nhận `tx`, nằm trong cùng transaction; bảng chặn `UPDATE`/`DELETE` bằng trigger | `packages/api/src/services/audit.ts:21`, `packages/db/sql/0001_constraints.sql:31-39` |
| Sổ cái tài chính sửa được | **Không** — trigger chặn, bắt buộc ghi bút toán điều chỉnh | `packages/db/sql/0001_constraints.sql:50-57` |
| Hoá đơn đã phát hành sửa được | **Không** — trigger khoá nội dung, số, ngày; cấm xoá | `packages/db/sql/0001_constraints.sql:184-205` |
| Trùng phòng / trùng giáo viên chỉ kiểm ở ứng dụng | **Có ràng buộc EXCLUDE ở CSDL** (`btree_gist`), khai `DEFERRABLE` để xếp lại cả lớp | `packages/db/sql/0001_constraints.sql:6-22` |
| Kiểm thử `packages/core` mỏng | **Dày** — 55 tệp; rà tự động chỉ `dates.ts` phủ < 50% (thành `KT-29`) | rà đối chiếu tên hàm xuất ↔ tên xuất hiện trong tệp test |
| Vai trò hết hạn phải có tác vụ nền đi gỡ | **Không cần** — lọc theo `valid_from`/`valid_to` ngay khi dựng ngữ cảnh, theo giờ Việt Nam | `packages/api/src/context.ts:110-117` |
| Tài khoản mẫu (`ALLOW_DEV_ACTOR`) có thể bật ở production | **Không** — `devActorAllowed` chặn cứng theo `NODE_ENV` | `packages/api/src/context.ts:90-93`, `packages/core/src/security/devActor.ts` |
| Route cron mở toang khi chưa đặt `CRON_SECRET` | **Không** — trả 503 trừ khi đang ở môi trường phát triển; so khớp không lệ thuộc thời gian | `apps/web/src/app/api/cron/outbox/route.ts:20-25` |
| Khoá lưu trữ tệp có thể vượt thư mục (path traversal) | **Không** — kiểm hai lớp: `isSafeObjectKey` rồi `path.resolve` phải nằm trong gốc | `packages/api/src/storage.ts:14-22` |
| Giải nén SCORM không chống bom nén | **Có chống** — chặn ZIP64, chặn tệp có mật khẩu, trần 500MB, trần tỉ lệ nén 200× | `packages/api/src/zip.ts:18-37` |
| Lớp Trial nhiều buổi chưa có | **Có đủ** — `trial_classes` + `trial_class_sessions` + `trial_class_enrollments` + `trial_attendance`, có nhánh vượt sĩ số cần quyền riêng | `packages/db/src/schema/admissions.ts`, `apps/web/src/app/(admin)/lop-trial/[id]/detail.tsx:341, 370` |
| Nhóm lớp ẩn sau cờ tính năng của bản gốc chưa làm | **Có** — `class_groups` + `classes.classGroupId` + trang `/class-groups` | `packages/db/src/schema/academics.ts`, `apps/web/src/app/(admin)/classes/[id]/workspace.tsx:193, 223` |
| Đánh giá & Khảo sát v2 chưa làm | **Có** — `eval_forms` / `eval_questions` / `eval_rounds` / `eval_responses` / `eval_answers`, NPS cũ chạy song song | `packages/db/src/schema/care.ts`, `apps/web/src/app/(admin)/khao-sat/page.tsx:23-28` |
| Trung tâm thông báo, trang tìm kiếm chưa có | **Có cả hai** — `/thong-bao`, `/search` | `apps/web/src/lib/admin-nav.ts` |
| Ảnh lớp thiếu tầng kho / thiếu mốc khôi phục 7 ngày | **Đủ cả hai tầng và đủ mốc** | `packages/core/src/media/consent.ts:8-19, 78-89` |
| Danh mục 38 loại thông báo của bản gốc thiếu | **Đủ và nhiều hơn** — 59 loại khai trong `NOTIFICATION_TYPES` | `packages/core/src/system/notifications.ts:58+` |
| 19 cờ chấm công của bản gốc thiếu | **Đủ 19 cờ, đúng nhãn tiếng Việt** | `packages/core/src/hr/rules.ts:243-258` |
| Ràng buộc tiền chỉ ở ứng dụng | **Có ở CSDL**: `total = subtotal - discount`, `amount > 0`, `refund <= proposed`, `matched ⇒ có order_id + payment_id` | `packages/db/sql/0001_constraints.sql:60-71` |
