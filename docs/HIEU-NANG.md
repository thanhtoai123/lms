# Hiệu năng và độ tin cậy

Tài liệu cho người vận hành và lập trình viên bảo trì. Phần "vận hành hằng ngày" (sao lưu, sự cố,
go-live) nằm ở `docs/VAN-HANH.md`; tài liệu này nói riêng về **tốc độ** và **việc nền không được mất**.

Bối cảnh khi viết: dữ liệu mẫu ~300 lead, ~125 học viên, ~250 buổi học, ~1.500 lượt điểm danh.
Ở quy mô đó gần như không truy vấn nào "chậm". Mọi thay đổi dưới đây nhắm vào quy mô THẬT:
nhiều trung tâm, mỗi trung tâm nhiều cơ sở, dữ liệu tích luỹ nhiều năm.

Nguyên tắc xuyên suốt: **đếm và lọc trong SQL, không tải dòng về rồi đếm bằng JavaScript.**
Một truy vấn `count(*)` không trả dòng nào qua mạng; một `select … limit 20000` thì trả hai mươi
nghìn dòng chỉ để lấy một con số — và khi vượt trần thì con số đó còn SAI.

---

## 1. Truy vấn đã chữa — trước / sau

Cột "truy vấn" đếm số lượt chạm CSDL; cột "dòng kéo về" mới là thứ quyết định ở quy mô lớn.

### 1.1 Trang chủ `inbox.today` — 14 nhóm việc, chạy MỖI lần vào trang chủ

| Nhóm việc | Vị trí | Trước | Sau |
|---|---|---|---|
| Lead quá hạn liên hệ | `services/inbox.ts` — `leadSlaGroup` | 2 truy vấn, kéo **400 dòng** lead đang mở rồi gọi `computeSla` từng dòng trong JS; tổng lấy bằng `.length` nên **sai khi > 400 lead** | 3 truy vấn: chính sách + `count(*) filter(...)` + tải **25 dòng**. Phép so SLA nằm trong SQL |
| Buổi chưa điểm danh | `services/inbox.ts` — `sessionGroups("attendance")` | 1 truy vấn kéo **mọi buổi đang mở trong 45 ngày**, mỗi dòng kèm 2 truy vấn con đếm sĩ số; lọc trạng thái + đếm trong JS | 3 truy vấn: 2 `count(*)` nhẹ (không join phòng/GV, không truy vấn con) + tải **25 dòng** |
| Buổi chưa viết nhận xét | `services/inbox.ts` — `sessionGroups("note")` | như trên, **lặp lại y hệt lượt tải đó lần thứ hai** | như trên |
| Học bạ kỳ chưa viết | `services/inbox.ts` — `reportCardGroup` | kéo **200 dòng** (nối 5 bảng + `not exists`) để lấy `.length` | `countDueReportCards` = 1 `count(*)` + tải **25 dòng** |
| Ảnh lớp chờ duyệt | `services/inbox.ts` — `mediaGroup` | kéo **120 ảnh**, mỗi ảnh kéo thêm sĩ số lớp và đồng ý hình ảnh của từng HV | `countMedia` = 1 `count(*)` + tải **25 dòng** |
| Việc chăm sóc HV | `services/inbox.ts` — `careTaskGroup` | `listCareTasks` **KHÔNG có `limit`** — kéo mọi việc đang mở của toàn chuỗi, lọc "quá hạn / leo thang" trong JS | `careTaskInbox` = 1 `count(*)` + tải **25 dòng**, lọc trong SQL |
| Thông báo cần xác nhận | `services/inbox.ts` — `notificationGroup` | kéo **60 thông báo** rồi lọc `priority ≤ 2` trong JS (sai khi > 60 chưa đọc) | `urgentNotifications` = 1 `count(*)` + tải **25 dòng** |
| Phiếu thu chờ xác nhận | `services/inbox.ts` — `paymentGroup` | `total` lấy `.length` của **trang đầu 30 dòng** → kế toán có 500 phiếu chờ vẫn thấy "30" | `counts.recorded` / `counts.recordedOverdue` (đã là `count(*)` sẵn trong `listPayments`) |
| Hoàn tiền chờ duyệt | `services/inbox.ts` — `refundGroup` | `.length` của danh sách bị cắt ở 300 | `counts.pending` / `counts.pendingOverdue` |
| Đơn nghỉ / đơn công | `services/inbox.ts` — `staffRequestGroup` | `.length` của danh sách bị cắt ở 500 | `counts.pending` / `counts.overdue` |
| Yêu cầu phụ huynh | `services/inbox.ts` — `parentRequestGroup` | `.length` của danh sách bị cắt ở 300 | `counts.open` / `counts.overdue` |
| Học bù chờ xếp buổi | `services/inbox.ts` — `makeupGroup` | `.length` của danh sách bị cắt ở 300 | `counts.requested` / `counts.requestedOverdue` |
| Chứng chỉ chờ cấp | `services/inbox.ts` — `completionGroup` | `pendingCompletions` **KHÔNG có `limit`** — nối 6 bảng, kéo mọi đề xuất đang chờ | trần cứng 300; hộp việc chỉ xin 100 |

> **Lưu ý về con số hiển thị.** Bảy nhóm ở trên trước đây trả `total` bị CẮT ở trần của danh sách
> (30 / 60 / 120 / 200 / 300 / 400 / 500). Nay `total` là `count(*)` thật. Với dữ liệu mẫu hiện
> tại hai cách cho cùng kết quả; ở quy mô thật con số mới lớn hơn và **đúng hơn**. Đây là thay
> đổi CÓ CHỦ Ý, không phải đổi nghiệp vụ — xem mục 6.

### 1.2 Dashboard quản trị `dashboard.adminOverview`

| Khối | Vị trí | Trước | Sau |
|---|---|---|---|
| Lead cần xử lý + Khách chờ chốt quá lâu | `services/dashboard.ts` | **1 truy vấn KHÔNG `limit`** kéo toàn bộ lead đang mở, rồi `computeSla` từng dòng trong JS chỉ để lấy 3 con số và 6 cái tên | 1 `count(*) filter (...)` cho cả ba con số + 2 truy vấn `limit 3` lấy tên xem trước |
| Buổi học chưa hoàn tất | `services/sessions.ts` — `overdueQueue` | `listSessions(from: "2000-01-01")` **KHÔNG `limit`**: mọi buổi chưa hoàn tất từ trước tới nay, mỗi dòng 2 truy vấn con đếm sĩ số; lọc `date < today` và đếm trong JS | `to = hôm qua` đẩy phép lọc xuống SQL; `total` = `count(*)`; chỉ tải đúng `limit` dòng |
| Học bạ kỳ chưa viết | `services/dashboard.ts` | kéo 500 dòng để lấy `.length` và 3 dòng xem trước | 1 `count(*)` + 1 truy vấn `limit 3` |

### 1.3 Danh sách Lead `leads.inbox`

| Vị trí | Trước | Sau |
|---|---|---|
| `services/leads.ts` — `leadInbox` | `select status, last_touch_at … limit 20_000` — **hai mươi nghìn dòng** rời CSDL mỗi lần mở màn hình, chỉ để đếm tổng / quá hạn / sắp tới hạn / phân bố trạng thái. Vượt 20.000 thì số hiển thị sai | **1 truy vấn `group by status`** với `count(*) filter (…)`: không dòng nào rời CSDL, số đúng ở mọi quy mô |
| `services/evaluations.ts` — `evalRoundDetail` | `select … limit 20_000` lấy đủ cột từng dòng trả lời (kèm phần trả lời chữ) chỉ để tính trung bình và đếm số sao | `group by (câu hỏi, số sao)` — nhiều nhất `số câu hỏi × 6` dòng (~240 thay vì 20.000); danh sách phẳng dựng lại trong bộ nhớ để `averageByCriteria` của core chạy y hệt cũ |

### 1.4 N+1 — vòng lặp gọi CSDL cho từng phần tử

| Vị trí | Trước | Sau |
|---|---|---|
| `services/media.ts` — `listMedia` | `for (const cid of classIds) await classRoster(db, cid)` → **1 truy vấn cho mỗi lớp** (duyệt 120 ảnh của 40 lớp = 40 truy vấn) | `classRosters()`: 1 truy vấn `inArray` → dựng `Map` |
| `services/engagement.ts` — `executeAction` (`notify_user`) | 1 truy vấn kiểm tra trùng **cho mỗi người nhận** (một rule bắn cho cả cơ sở = hàng chục truy vấn) | 1 truy vấn `inArray` → `Set` |
| `services/delivery.ts` — `dispatchParentMessages` | 1 truy vấn `count(*)` kiểm tra trần "mỗi phụ huynh mỗi ngày" **cho mỗi tin** — lô 100 tin = 100 truy vấn thừa **mỗi 10 giây** | 1 truy vấn `group by parent_id` cho cả lô, cộng dồn tại chỗ khi gửi thành công |
| `services/classOps.ts` — `cancelTrialsFor` | 1 `findFirst` lấy lead + 1 insert nhật ký **cho mỗi lượt học thử** | 1 truy vấn `inArray` lấy hết lead + 1 câu insert gộp |
| `services/cutover.ts` — `parallelReminders` | 1 truy vấn **cho mỗi cơ sở** đang chạy song song | 1 truy vấn `inArray` |
| `services/studentLifecycle.ts` — `remindPauseEnding` | 1 truy vấn kiểm tra trùng + 1 insert **cho mỗi đợt bảo lưu** | 1 truy vấn `inArray` + 1 câu insert gộp |
| `services/care.ts` — `sendSurvey` | `guardians.filter(...)` bên trong vòng lặp: 2.000 học viên × 2.000 người giám hộ = **4 triệu phép so trong JavaScript** | dựng `Map` một lần, tra O(1) |
| `services/finance.ts` — `debts` | `plans.filter(...)` cho **mỗi đơn** (5.000 đơn × mọi kỳ hạn), rồi `items.filter(...)` thêm 10+ lượt nữa để dựng bảng tuổi nợ và bảng theo cơ sở | 1 `Map` cho kỳ hạn + **một lượt duyệt** dựng cả hai bảng |

### 1.5 Worker — chạy mỗi 10 giây

| Vị trí | Trước | Sau |
|---|---|---|
| `services/engagement.ts` — `scanLeadSla` | **Quét cả bảng lead** (không `limit`) mỗi nhịp rồi lọc bằng `computeSla` trong JS. Tệ hơn: cửa sổ "quá hạn ≡ 0..5 phút (mod 60)" rộng 6 phút, nên **một lead bị phát tới ~36 sự kiện mỗi giờ** — ngập outbox, phụ huynh bị nhắc nhiều lần | 1 truy vấn lọc thẳng trong SQL, tối đa 500 dòng/nhịp, kèm điều kiện "1 giờ qua đã phát cho lead này chưa" → đúng như câu chú thích vốn đã ghi: **mỗi lead tối đa 1 sự kiện/giờ** |

### 1.6 Trần cứng mới cho các danh sách trước đây không giới hạn

| Thủ tục | Trước | Sau |
|---|---|---|
| `sessions.listSessions` | không `limit` | mặc định 1.000, trần 2.000 |
| `engagement.listCareTasks` | không `limit` | trần 500 |
| `reportCards.pendingCompletions` | không `limit` | mặc định 300, trần 500 |
| `classOps.pendingApprovals` | không `limit` | mặc định 300, trần 500 |
| `studentLifecycle.remindPauseEnding` | không `limit` | 2.000/lượt (chạy hằng ngày, chống trùng bằng `dedupeKey` nên phần dư xử lý ở lượt sau) |
| `media.listMedia` | `limit` do client gửi, không trần | mặc định 120, trần 300 |
| `makeup.listMakeup` / `finance.listRefunds` / `care.listParentRequests` | 300 cố định | mặc định 300, trần 500, chỉnh được |
| `hrRequests.listRequests` | 500 cố định | trần 500, chỉnh được |

Trần được cắt bằng `clampPageSize(requested, mặc_định, trần)` trong `@satarobo/core` — client gửi
`pageSize: 1000000` cũng chỉ nhận về đúng trần.

### 1.7 Xuất dữ liệu — đọc theo lô

`leads.exportLeads` và `students.exportStudents` trước đây chạy **một câu `limit 10_000`**.
Với học viên, mỗi dòng còn kéo theo 3 truy vấn con (phụ huynh, SĐT, lớp) — tức 30.000 phép tra
cứu trong MỘT câu lệnh, rất dễ chạm `statement_timeout` khi dữ liệu lớn.

Nay: `count(*)` trước, rồi đọc từng lô 1.000 dòng bằng `limit`/`offset`. Thứ tự sắp xếp có thêm
khoá phụ `id` (`order by created_at desc, id desc`) để hai lô liền nhau **không trùng và không sót**
dòng khi `created_at` bằng nhau — đây là lỗi kinh điển của phân trang theo `offset`.

---

## 2. Chỉ mục — `packages/db/sql/0007_chi_muc_hieu_nang.sql`

32 chỉ mục, tất cả `CREATE INDEX IF NOT EXISTS` nên chạy lại bao nhiêu lần cũng được.
Mỗi chỉ mục trong tệp có chú thích tiếng Việt nói rõ nó phục vụ truy vấn nào ở `tệp:hàm`.

**Ba quy tắc đã áp dụng:**

1. **Chỉ mục tổ hợp đúng thứ tự cột**: cột lọc bằng `=` trước → cột lọc theo khoảng → cột sắp xếp.
   Sai thứ tự thì Postgres chỉ dùng được phần đầu của chỉ mục.
2. **Chỉ mục một phần** (`WHERE …`) cho các bộ lọc trạng thái phổ biến. Buổi đã `completed`,
   phiếu thu đã `confirmed`, việc outbox đã xử lý… chiếm gần hết bảng theo thời gian nhưng
   **không nằm trong chỉ mục**, nên chỉ mục luôn nhỏ dù bảng phình to bao nhiêu.
3. **Bao cột của truy vấn con tương quan** để Postgres đọc được index-only.

| Bảng | Chỉ mục | Phục vụ |
|---|---|---|
| `leads` | `leads_open_center_touch_idx` (một phần: đang mở, chưa xoá) | `inbox.leadSlaGroup`, `dashboard`, `scanLeadSla` — lọc theo cơ sở, sắp theo `last_touch_at` |
| `leads` | `leads_open_assignee_touch_idx` | nhánh "lead của chính tôi" |
| `leads` | `leads_center_created_idx` | `leadInbox` khi xem mọi trạng thái (sắp theo ngày nhận) |
| `leads` | `leads_converted_idx` | phễu lead theo tuần trên dashboard |
| `lead_tasks` | `lead_tasks_open_assignee_idx`, `lead_tasks_open_lead_idx` | `myLeadTasks`; cột `openTasks` của danh sách lead |
| `sessions` | `sessions_open_date_idx` (một phần: chưa hoàn tất) | `overdueQueue`, `sessionGroups`, `countSessions` |
| `sessions` | `sessions_class_date_idx`, `sessions_room_date_idx`, `sessions_lesson_idx` | lịch lớp, lịch phòng (kiểm tra trùng), buổi là mốc học bạ |
| `enrollments` | `enrollments_class_status_seq_idx` | truy vấn con đếm sĩ số chạy cho **từng dòng** danh sách buổi — thêm `start_sequence_no` để so ngay trong chỉ mục |
| `enrollments` | `enrollments_student_open_idx` | lớp đang học của một học viên |
| `session_media` | `session_media_pending_idx` | hàng đợi duyệt ảnh |
| `report_cards` | `report_cards_review_idx` | hàng đợi duyệt học bạ |
| `course_completions` | `completions_proposed_idx` | đề xuất hoàn thành khoá chờ duyệt |
| `lessons` | `lessons_milestone_idx` | mốc học bạ của giáo trình |
| `makeup_requests` | 4 chỉ mục | **bảng này trước nay không có chỉ mục nào ngoài khoá chính**, trong khi `listMakeup` nối nó với ghi danh và hai bảng buổi học |
| `attendance` | `attendance_makeup_idx` | cột "đã học bù chưa" (truy vấn con tương quan) |
| `payments` | `payments_recorded_open_idx`, `payments_order_confirmed_idx` | phiếu thu chờ kế toán; tổng đã thu của một đơn |
| `refunds` | `refunds_open_idx` | hoàn tiền chờ duyệt / chờ chi |
| `user_notifications` | `user_notif_unread_idx`, `user_notif_dup_idx` | thông báo chưa đọc theo mức ưu tiên; chống tạo trùng |
| `parent_notifications` | `parent_notif_queued_idx`, `parent_notif_sent_today_idx` | hàng đợi ZNS/SMS; trần "mỗi phụ huynh mỗi ngày" |
| `students` | `students_center_created_idx` | danh sách / xuất học viên |
| `student_guardians` | `sg_student_primary_idx` | tra người giám hộ chính — truy vấn con chạy cho **từng** học viên |
| `staff_requests` | `staff_requests_pending_idx` | đơn chờ duyệt |
| `audit_log` | `audit_entity_created_idx` | nhật ký của một bản ghi theo thời gian (bảng lớn nhanh nhất hệ) |
| `outbox` | 5 chỉ mục (ở `0006`) | đường đọc của worker, hàng đợi chết, chống phát trùng SLA |

**Cách chạy:** `pnpm db:apply-sql` (áp mọi tệp trong `packages/db/sql` theo thứ tự tên).

> Trên CSDL đang chạy thật có dữ liệu lớn, nên tạo chỉ mục bằng `CREATE INDEX CONCURRENTLY`
> để không khoá bảng. Tệp `0007` dùng `CREATE INDEX` thường vì `CONCURRENTLY` **không chạy được
> trong transaction**, mà `apply-sql` chạy cả tệp trong một lượt. Nếu cơ sở dữ liệu đã lớn:
> chép từng câu ra, thêm `CONCURRENTLY`, chạy tay ngoài giờ cao điểm.

---

## 3. Chạy worker

```bash
pnpm worker          # vòng lặp, mỗi 10 giây (đổi bằng WORKER_INTERVAL_MS)
```

Không chạy được tiến trình thường trú (Vercel…) thì gọi `GET /api/cron/outbox` mỗi phút kèm
`Authorization: Bearer $CRON_SECRET`.

**Chạy nhiều worker song song là an toàn.** Trước đây không: hai worker (hoặc worker + cron) cùng
đọc `processed_at is null` sẽ xử lý trùng một sự kiện và gửi hai lần cho phụ huynh. Nay việc được
nhận bằng `select … for update skip locked` trong một transaction ngắn, worker khác **bỏ qua** dòng
đang bị giữ thay vì xếp hàng chờ.

### Thử lại có giãn cách

Logic thuần nằm ở `packages/core/src/reliability/retry.ts` (có test), CSDL giữ trạng thái ở
ba cột mới của `outbox` (`0006_outbox_do_tin_cay.sql`):

| Cột | Ý nghĩa |
|---|---|
| `attempts` | số lần đã thử và hỏng |
| `next_attempt_at` | sớm nhất được thử lại; dòng mới = ngay lập tức |
| `dead_letter_at` | khác `null` = đã vào hàng đợi chết, worker thôi đọc |
| `last_attempt_at` | lần chạy gần nhất (để thấy dòng nào đang kẹt) |
| `last_error` | lý do hỏng, cắt còn 500 ký tự, một dòng |

Giãn cách: `30s · 2^(n-1)`, trần 15 phút → **30s → 1p → 2p → 4p → 8p → 15p…**
Trước đây một nhà cung cấp đang sập bị gọi lại sau đúng 10 giây, liên tục.

Hỏng đủ **5 lần** → `dead_letter_at` được đặt, worker thôi đọc và ghi một dòng `console.error`.
Việc trong hàng đợi chết KHÔNG tự lành: phải có người xem `last_error`, sửa nguyên nhân, rồi đẩy lại.

- **Thấy ở đâu**: `/van-hanh` → Hàng đợi & cảnh báo → dòng "Outbox trong hàng đợi chết"
  (và danh mục go-live đỏ khi số này khác 0). Chi tiết 20 dòng gần nhất kèm `last_error`:
  thủ tục `engagement.outboxStats` (quyền `automation:read`).
- **Đẩy lại**: thủ tục `engagement.retryDeadLetter` (quyền `automation:update`) — không truyền
  `ids` thì đẩy lại tất cả. Chưa có nút bấm trên giao diện; gọi qua tRPC hoặc thêm nút sau.
- **Hoặc bằng SQL**, khi cần xử lý thủ công:
  ```sql
  UPDATE outbox SET dead_letter_at = NULL, attempts = 0, next_attempt_at = now(), last_error = NULL
   WHERE processed_at IS NULL AND dead_letter_at IS NOT NULL;
  ```

Khi nhận một lô, `next_attempt_at` được đẩy ra 5 phút ("thời gian tàng hình"): nếu tiến trình chết
giữa chừng thì lô đó **tự quay lại hàng đợi** sau 5 phút chứ không kẹt vĩnh viễn.

---

## 4. Hai endpoint kiểm tra sức khoẻ

Hai câu hỏi khác nhau, không được trộn:

| | `GET /api/health` | `GET /api/ready` |
|---|---|---|
| Câu hỏi | Tiến trình còn sống không? | Nhận lưu lượng được không? |
| Chạm CSDL | **Không** | Có |
| Trả về | `{"status":"ok","uptimeSec":…}` | `{"status":"ready"\|"not_ready","checks":{"database":"up"\|"down","outbox":"ok"\|"backlog"\|"unknown"},"outboxPending":…,"outboxOldestSec":…}` |
| Mã HTTP | luôn `200` khi web còn chạy | `200` sẵn sàng · `503` chưa |
| Ai dùng | Docker / systemd / Kubernetes quyết định **khởi động lại** | Bộ cân bằng tải, dịch vụ giám sát (UptimeRobot, BetterStack…) |

**Vì sao phải tách.** Trước đây `/api/health` chạm CSDL và trả 503 khi Postgres hỏng. Bộ điều phối
đọc endpoint đó sẽ giết và khởi động lại **toàn bộ cụm web** vòng quanh trong khi chẳng tiến trình
nào hỏng — sự cố CSDL biến thành sự cố toàn hệ. Nay câu hỏi "khởi động lại?" và câu hỏi "có nhận
lưu lượng?" do hai endpoint khác nhau trả lời.

`/api/ready` báo `backlog` khi việc nền chờ quá `READY_OUTBOX_BACKLOG` (mặc định 1.000 việc) hoặc
việc chờ lâu nhất quá `READY_OUTBOX_AGE_SEC` (mặc định 900 giây). Đây là cách phát hiện **worker
chết trong im lặng**: giao diện vẫn xanh nhưng thông báo cho phụ huynh, email phiếu thu và ZNS
đều không đi.

**Cả hai không cần đăng nhập và không tiết lộ gì**: không tên máy, không phiên bản, không biến môi
trường, không câu SQL, không tên bảng / cột, và không bao giờ trả nguyên văn thông điệp lỗi của
Postgres (thông điệp đó kèm cả câu truy vấn và tên mọi cột). Chi tiết vận hành xem ở `/van-hanh`
— trang đó có đăng nhập.

---

## 5. Đo hiệu năng

### Log thủ tục chậm

Mọi thủ tục tRPC được đo. Chạy lâu hơn ngưỡng thì ghi **một dòng**:

```
slow-procedure path=inbox.today ms=2413 queries=96 ok=true
```

- Ngưỡng: `SLOW_PROCEDURE_MS`, mặc định `1000`. Đặt `0` để ghi mọi thủ tục khi cần soi.
- `queries` là số truy vấn CSDL của đúng lượt gọi đó — đây là con số phân biệt
  **"một truy vấn nặng"** (ms cao, queries thấp) với **"N+1"** (queries cao bất thường).
- Dòng log **không có dữ liệu cá nhân**: không tham số đầu vào, không id, không tên người, không
  SĐT. Tên thủ tục phải đúng dạng `router.procedure`, sai dạng thì ghi `unknown` (chứ không cắt
  bớt ký tự — cắt bớt vẫn để lọt phần số của một SĐT bị nhét vào).

Cài đặt: `packages/db/src/metrics.ts` (đếm qua `AsyncLocalStorage` + logger của drizzle),
`packages/api/src/trpc.ts` (middleware `measure`), `packages/core/src/reliability/retry.ts`
(`shouldLogSlow`, `slowProcedureLog` — thuần, có test).

Muốn xem nguyên văn câu SQL ở máy dev: `DRIZZLE_LOG=1`. **Không bật ở máy thật** — câu SQL có
chứa giá trị tham số.

### Giới hạn kết nối và thời gian chờ

Đặt ở một chỗ duy nhất: `packages/db/src/index.ts` → `poolOptionsFromEnv()`.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DB_POOL_MAX` | 10 | Kết nối **mỗi tiến trình**. Postgres mặc định chỉ có 100 kết nối, nên `(số tiến trình web + worker) × DB_POOL_MAX` phải nhỏ hơn con số đó |
| `DB_STATEMENT_TIMEOUT_MS` | 15.000 | Truy vấn chạy quá lâu bị Postgres huỷ. Trước đây một truy vấn tải cả bảng có thể treo vô hạn và làm **cạn pool** |
| `DB_IDLE_TX_TIMEOUT_MS` | 30.000 | Transaction bị bỏ quên không giữ khoá mãi |
| `DB_CONNECT_TIMEOUT_SEC` | 10 | Mất mạng thì báo lỗi nhanh thay vì treo người dùng |
| `DB_IDLE_TIMEOUT_SEC` | 30 | Đóng kết nối rỗi |

Worker tự nới riêng `statement_timeout` lên 60 giây và dùng pool nhỏ (4 kết nối): nó chạy tuần tự
và có việc quét / ẩn danh hoá lâu hơn một màn hình web, nhưng không nên giữ nhiều kết nối.

### Đo khi dữ liệu lớn

1. **Sinh dữ liệu giống thật.** Nhân bản dữ liệu mẫu lên 100–1.000 lần (nhiều trung tâm, nhiều năm
   buổi học và điểm danh). Đo trên 300 lead thì mọi thứ đều nhanh — không kết luận được gì.

2. **Bật log mọi thủ tục** rồi đi một vòng các màn hình chính:
   ```bash
   SLOW_PROCEDURE_MS=0 pnpm dev
   ```
   Ghi lại `ms` và `queries` của: `inbox.today`, `dashboard.*`, `leads.inbox`, `students.list`,
   `academics.sessions.list`, `finance.payments`. **`queries` tăng theo số dòng hiển thị là dấu
   hiệu N+1** — đó mới là thứ phải chữa, không phải `ms`.

3. **Xem kế hoạch thực thi** của truy vấn chậm nhất:
   ```sql
   EXPLAIN (ANALYZE, BUFFERS) <câu truy vấn>;
   ```
   Cần tìm: `Seq Scan` trên bảng lớn (thiếu chỉ mục), `Rows Removed by Filter` cao (chỉ mục sai
   thứ tự cột), `Sort` với `external merge Disk` (thiếu chỉ mục cho `ORDER BY`).

4. **Kiểm tra chỉ mục có được dùng không.** Chỉ mục MỘT PHẦN chỉ được dùng khi Postgres chứng minh
   được điều kiện truy vấn bao hàm điều kiện của chỉ mục:
   ```sql
   SELECT relname, indexrelname, idx_scan, idx_tup_read
     FROM pg_stat_user_indexes ORDER BY idx_scan ASC LIMIT 40;
   ```
   `idx_scan = 0` sau một tuần chạy thật nghĩa là chỉ mục đó vô dụng — xoá đi (chỉ mục thừa làm
   chậm mọi lần ghi).

5. **Tìm truy vấn tốn nhất toàn hệ** (bật `pg_stat_statements` trước):
   ```sql
   SELECT calls, round(mean_exec_time::numeric, 1) AS ms_tb,
          round(total_exec_time::numeric) AS ms_tong, rows, query
     FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
   ```
   Sắp theo `total_exec_time` chứ không phải `mean_exec_time`: một truy vấn 20 ms chạy 100.000 lần
   tốn hơn nhiều một truy vấn 2 giây chạy 10 lần.

6. **Theo dõi tồn đọng việc nền** bằng `/api/ready` (`outboxPending`, `outboxOldestSec`) hoặc
   `engagement.outboxStats` (thêm `ready` = việc đã tới hạn mà chưa ai chạy — con số này tăng đều
   nghĩa là worker chạy không kịp, phải tăng `batch` hoặc chạy thêm worker).

7. **Chạy `ANALYZE`** sau khi nạp khối dữ liệu lớn — kế hoạch thực thi dựa trên thống kê, thống kê
   cũ thì Postgres chọn sai kế hoạch dù chỉ mục đã đủ.

---

## 6. Thay đổi hình dạng dữ liệu trả về

Không thủ tục nào đổi **kiểu** dữ liệu trả về; mọi thay đổi đều là **thêm trường mới** hoặc
**sửa một con số vốn đã sai**. Không phải sửa nơi gọi nào trong `apps/web`.

**Trường mới (thêm, không bỏ):**

| Thủ tục | Trường mới |
|---|---|
| `finance.payments` | `counts.recordedOverdue` |
| `finance.refunds` | `counts.pendingOverdue` |
| `schedule.makeups` | `counts.requestedOverdue` |
| `engagement.outboxStats` | `ready`, `oldestPendingSec`; mỗi dòng hàng đợi chết thêm `attempts`, `deadLetterAt` |
| `engagement.retryDeadLetter` | **thủ tục mới** |
| `worker` / `/api/cron/outbox` | `deadLettered` trong kết quả `processOutbox` |

**Tham số đầu vào mới (đều tuỳ chọn, bỏ trống thì giữ nguyên hành vi cũ):**
`limit` cho `academics.sessions.list`, `engagement.careTasks`, và ở tầng service cho
`listMedia`, `listMakeup`, `listRefunds`, `listRequests`, `listParentRequests`, `pendingCompletions`,
`pendingApprovals`.

**Con số đã sửa cho đúng** (cùng giá trị với dữ liệu hiện tại, khác ở quy mô lớn): `total` của bảy
nhóm trong `inbox.today` trước đây bị cắt ở trần của danh sách, nay là `count(*)` thật — chi tiết
ở mục 1.1.

**`GET /api/health` đổi vai** từ dò-sẵn-sàng sang dò-sống (xem mục 4). Trường `version` và mảng
`checks` chuyển sang `/api/ready` và trang `/van-hanh`. Ai đang giám sát `/api/health` để phát
hiện sự cố CSDL phải **chuyển sang `/api/ready`**.

---

## 7. Test

Logic thuần có test trong `packages/core` (không cần CSDL):

```bash
node --experimental-transform-types --import /tmp/reg.mjs --test "packages/core/src/**/*.test.ts"
```

`packages/core/src/reliability/retry.test.ts` — 12 test phủ:
tính giãn cách thử lại (gấp đôi, trần, không tràn số), mốc thử lại kế tiếp, ngưỡng hàng đợi chết,
cắt gọn thông điệp lỗi, cắt `pageSize` về trần cứng, chia lô khi xuất dữ liệu (tổng các lô đúng
bằng tổng số dòng), đọc dư một dòng để biết còn trang sau, cắt ngưỡng ghi log, và
**dòng log không để lọt SĐT**.

Toàn bộ: **403 test xanh**.
