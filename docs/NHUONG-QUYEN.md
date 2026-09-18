# Nhượng quyền — nhiều trung tâm độc lập trên một hệ thống

Tài liệu cho chủ chuỗi, Hội sở và bên nhận nhượng quyền. Màn hình tương ứng: **Hệ thống & Cấu hình → Nhượng quyền** (`/nhuong-quyen`).

Nguyên tắc gốc: **mỗi bên nhận nhượng quyền là một trung tâm (tenant) độc lập, dữ liệu KHÔNG lẫn sang nhau.**
Hội sở của chuỗi thấy số liệu tổng hợp để quản trị thương hiệu, nhưng **không tự động thấy dữ liệu cá nhân và chi tiết tài chính** của bên nhượng quyền — trừ khi chính trung tâm đó bật công tắc cho phép.

---

## 1. Mô hình dữ liệu

### 1.1 Hai bảng mới

| Bảng | Vai trò | Cột chính |
|---|---|---|
| `tenants` | Một trung tâm vận hành độc lập | `code` (IN HOA, không đổi), `name`, `type` (`OWNED` / `FRANCHISE`), `status` (`onboarding` / `active` / `suspended` / `closed`), `is_default`, `parent_tenant_id`, `provisioned_from_tenant_id`, pháp nhân + hợp đồng (`legal_name`, `tax_code`, `contract_no`, `contract_from`, `contract_to`) |
| `tenant_settings` | Tuỳ chọn quyền riêng tư của từng trung tâm | `ho_sees_pii`, `ho_sees_finance_detail`, `data_retention_years`, `allow_cross_center_transfer` |

`type`:

- **`OWNED` — chuỗi tự vận hành**: Hội sở nhìn xuyên suốt (mặc định mở hết). Tenant gốc `SATA` thuộc loại này.
- **`FRANCHISE` — nhượng quyền**: mặc định **đóng hết** (Hội sở không thấy PII, không thấy chi tiết tài chính, không chuyển học viên liên trung tâm).

Đúng **một** dòng có `is_default = true` (tenant gốc `SATA`) — mọi dữ liệu có trước khi bật nhượng quyền thuộc về đây, nên hệ thống một-tenant chạy y hệt trước đó.

### 1.2 Cột `tenant_id`

Mọi bảng hay được truy vấn trực tiếp đều có cột `tenant_id` riêng để lọc rẻ (một cột, một index), thay vì phải bắc cầu qua bản ghi cha:

`regions`, `centers`, `rooms`, `legal_entities`, `org_units`, `users`, `audit_log`, `students`, `teachers`, `parents`, `courses`, `course_packages`, `curricula`, `class_groups`, `classes`, `sessions`, `enrollments`, `attendance`, `session_media`, `leads`, `trial_classes`, `payment_methods`, `orders`, `payments`, `finance_ledger`, `commission_policies`, `commission_rules`, `einvoices`, `positions`, `staff`, `work_shifts`, `timesheet_periods`, `attendance_punches`, `parent_requests`, `notification_broadcasts`, `parent_notifications`, `user_notifications`, `care_tasks`, `outbox`, `notification_types`, `email_templates`, `user_groups`.

Bảng phụ thuộc bản ghi cha (vd `lessons` thuộc `curricula`, `order_items` thuộc `orders`, `commission_policy_shares` thuộc `commission_policies`) **suy ra tenant qua cha** — không nhân thêm cột.

### 1.3 Điền và kiểm tra ở tầng CSDL

`packages/db/sql/0005_nhuong_quyen.sql` (chạy sau `pnpm db:push`, idempotent):

1. Tạo tenant gốc `SATA` + dòng `tenant_settings` mở hết.
2. Trigger `fill_tenant_id` **BEFORE INSERT** trên mọi bảng có `tenant_id`: dòng nào chưa gắn tenant thì lấy theo cơ sở của chính dòng đó (`center_id` / `home_center_id` / `workplace_center_id`), không có thì về tenant mặc định. Nhờ vậy **mọi đường ghi cũ trong mã nguồn không cần sửa**.
3. Trigger riêng cho `audit_log`: lấy tenant theo **người thao tác**, vì nhật ký không gắn cơ sở.
4. Backfill toàn bộ dữ liệu đang có về `SATA`, tạo index `(tenant_id)` cho từng bảng.
5. Trigger `assert_center_tenant` (DEFERRABLE) trên các bảng hay bị ghi chéo (`leads`, `classes`, `orders`, `payments`, `staff`, `rooms`, `trial_classes`, `parent_requests`): dòng của một cơ sở phải cùng tenant với cơ sở đó.
6. Đổi khoá trùng của **danh mục dùng chung** sang "duy nhất TRONG một tenant": `courses(code, slug)`, `course_packages(code)`, `payment_methods(code)`, `notification_types(prefix)`, `email_templates(event_key)`, `user_groups(name)` — để nhân bản chép được nguyên mã sang trung tâm mới.
   Mã **cơ sở** vẫn duy nhất toàn hệ thống (mã học viên / mã lớp / mã đơn được sinh từ mã cơ sở).

---

## 2. Quy tắc cách ly

Luật thuần nằm ở `packages/core/src/org/tenant.ts` (có test riêng), tầng dữ liệu áp ở `packages/api/src/services/tenantScope.ts`.

### 2.1 Ai thấy tenant nào — `tenantScope(actor, tenants)`

| Người dùng | Phạm vi dữ liệu |
|---|---|
| Hội sở của tenant `OWNED` (vai trò không gắn cơ sở) | **Mọi tenant `OWNED`** |
| SUPER_ADMIN của chuỗi (thuộc tenant `OWNED`) | Mọi tenant `OWNED` **+ tenant nhượng quyền** (số liệu tổng hợp; PII che theo cấu hình) |
| Người thuộc tenant `FRANCHISE` (kể cả SUPER_ADMIN của tenant đó) | **Chỉ tenant của mình** |
| Người gắn cơ sở của chuỗi (quản lý cơ sở, giáo vụ, kế toán cơ sở…) | Chỉ tenant của mình |

Tenant `closed` không nằm trong phạm vi đọc dữ liệu (vẫn hiện trong danh sách trung tâm).

### 2.2 Ba việc bắt buộc ở mọi service

1. **Truy vấn danh sách** → thêm `tenantCond(ctx, bảng)` vào `WHERE`.
2. **Nạp bản ghi theo id** → `assertTenant(ctx, row)` **trước khi** trả về hoặc ghi đè. Vi phạm ném lỗi tiếng Việt: *"… thuộc một trung tâm khác — dữ liệu giữa các trung tâm được cách ly, không truy cập chéo được"* (tRPC trả `FORBIDDEN`).
3. **Trả dữ liệu ra ngoài tenant** → `redact(ctx, row)` để che PII theo cấu hình của trung tâm sở hữu dòng đó.

Ngữ cảnh tRPC (`packages/api/src/context.ts`) nạp sẵn `ctx.tenantId`, `ctx.tenantIds` và `ctx.tenants` (kèm cấu hình quyền riêng tư) cho mỗi lượt gọi.

### 2.3 Che dữ liệu cá nhân

Dùng chung bộ che PII của nhật ký (`packages/core/src/system/pii.ts`), mở rộng thêm cách che "còn đối soát được, không liên hệ được":

| Loại | Che thành |
|---|---|
| Số điện thoại | `0912****78` (giữ đầu số, giữ đúng độ dài) |
| Email | `a***@gmail.com` (giữ nhà cung cấp) |
| Địa chỉ | `Hải Châu, Đà Nẵng` (chỉ còn quận / tỉnh; đoạn có chữ số bị bỏ) |
| Họ tên | `Nguyễn V. A.` (giữ họ) |
| CCCD / tài khoản ngân hàng / mã số thuế | `0***5` |
| Số liệu (doanh thu, số buổi, số học viên) | **giữ nguyên** |

### 2.4 Bảng "ai thấy gì"

`FR` = một trung tâm nhượng quyền; `HO` = Hội sở của chuỗi.

| Dữ liệu của FR | Người của FR | SUPER_ADMIN chuỗi (mặc định) | SUPER_ADMIN chuỗi khi FR bật công tắc |
|---|---|---|---|
| Danh sách trung tâm, trạng thái, hợp đồng | ✔ | ✔ | ✔ |
| Số cơ sở / học viên / lớp / lead / nhân sự | ✔ | ✔ | ✔ |
| Doanh thu 30 ngày, tổng công nợ | ✔ | ✔ | ✔ |
| Tên, SĐT, email, địa chỉ của phụ huynh / học viên | ✔ | **đã che** | ✔ (`hoSeesPii = true`) |
| Hồ sơ nhân sự, chấm công | ✔ | **đã che** | ✔ (`hoSeesPii = true`) |
| Từng phiếu thu / đơn hàng kèm tên học viên | ✔ | **không trả về** | ✔ (`hoSeesFinanceDetail = true`) |
| Nhật ký thao tác (audit log) | ✔ | ✖ (chỉ trong tenant) | ✖ |
| Chuyển học viên / lead sang trung tâm khác | theo công tắc | ✖ | ✔ (`allowCrossCenterTransfer = true` ở **cả hai** bên) |

Người của FR **không bao giờ** thấy dữ liệu của chuỗi hay của trung tâm nhượng quyền khác.

### 2.5 Bốn công tắc quyền riêng tư

Đặt ngay trong panel chi tiết của thẻ trung tâm ở `/nhuong-quyen` (không có trang riêng).
**Chỉ quản trị của chính trung tâm đó** bật/tắt được — Hội sở chuỗi không tự mở quyền xem dữ liệu của bên nhượng quyền. Mỗi lần đổi bắt buộc nhập lý do và được ghi nhật ký.

| Công tắc | Mặc định `OWNED` | Mặc định `FRANCHISE` | Tắt thì sao |
|---|---|---|---|
| `hoSeesPii` — Hội sở chuỗi được xem dữ liệu cá nhân | bật | **tắt** | Mọi dữ liệu trả cho người ngoài tenant đều bị che (mục 2.3) |
| `hoSeesFinanceDetail` — Hội sở chuỗi được xem chi tiết tài chính | bật | **tắt** | Chỉ trả tổng hợp (doanh thu, công nợ); danh sách phiếu thu bỏ qua dòng của tenant đó, mở một đơn thì bị từ chối |
| `dataRetentionYears` — số năm giữ dữ liệu | 10 | 5 | Tham số cho quy trình xoá / ẩn danh định kỳ |
| `allowCrossCenterTransfer` — cho chuyển học viên / lead sang trung tâm khác | bật | **tắt** | Chặn chuyển lead và chuyển lớp sang cơ sở thuộc tenant khác (cả hai bên đều phải bật) |

---

## 3. Nhân bản một chạm — tạo trung tâm mới từ mô hình mẫu

Màn `/nhuong-quyen` → nút **“+ Tạo trung tâm nhượng quyền”** → panel một bước:
**chọn mô hình mẫu → tên / mã / địa chỉ → xem bảng kê → nhập lý do → Tạo.**

Dịch vụ: `packages/api/src/services/provisionTenant.ts`, hai bước:

1. `previewProvision` — bảng kê "sẽ tạo những gì, bao nhiêu bản ghi" (không ghi gì).
2. `provision` — ghi trong **một transaction**, bắt buộc lý do ≥ 10 ký tự, ghi audit ở cả tenant người thao tác lẫn tenant mới.

### 3.1 Sao chép (khung vận hành)

| Nhóm | Ghi chú |
|---|---|
| Khoá học | giữ nguyên mã, slug thêm hậu tố mã trung tâm |
| Gói học phí | giữ giá niêm yết / giá ưu đãi — **kiểm tra lại theo hợp đồng** |
| Chương trình học (giáo trình) + bài học | giữ thứ tự bài và mốc học bạ |
| Mã ca làm việc | chỉ mã dùng chung (không gắn cơ sở) |
| Chính sách hoa hồng | kèm mức chia theo vai và bảng bậc |
| Danh mục loại thông báo | |
| Phương thức thanh toán | **không chép** số tài khoản / mã QR / cấu hình cổng của chuỗi |
| Mẫu email / ZNS | |
| Nhóm quyền | chép nhóm và dòng quyền, **không chép thành viên** |
| Cấu hình vận hành | lấy mặc định toàn hệ thống của mô hình mẫu, áp cho cơ sở đầu tiên |

### 3.2 Tạo mới

Trung tâm (tenant) · tuỳ chọn quyền riêng tư · đơn vị tổ chức (gốc → văn phòng → cơ sở) · pháp nhân (khi khai mã số thuế) · cơ sở đầu tiên · phòng học mẫu · **tài khoản quản trị trung tâm ở trạng thái "chờ kích hoạt"**.

> Tài khoản quản trị **không có mật khẩu và hệ thống không sinh mật khẩu**. Người dùng tự kích hoạt qua luồng mời sẵn có (*Hệ thống → Tài khoản → Gửi liên kết đăng nhập*).

### 3.3 Không bao giờ sao chép

Lead · học viên · phụ huynh · nhân sự và chấm công · đơn hàng, phiếu thu, công nợ · lớp học và buổi học · ảnh lớp · nhật ký.
Trung tâm mới bắt đầu với **0 dữ liệu cá nhân**.

### 3.4 Sau khi tạo — việc phải làm tay

1. Gửi thư mời kích hoạt cho tài khoản quản trị trung tâm.
2. Khai số tài khoản ngân hàng / mã QR cho từng phương thức thanh toán.
3. Kiểm tra lại giá gói học phí theo hợp đồng nhượng quyền.
4. Tạo nhân sự, phân ca, mở lớp đầu tiên.
5. Đổi trạng thái trung tâm từ *Đang thiết lập* sang *Đang hoạt động*.

---

## 4. Checklist pháp lý & vận hành khi mở nhượng quyền

### 4.1 Pháp lý

- [ ] Hợp đồng nhượng quyền ký trước khi tạo tenant; số hợp đồng và thời hạn nhập vào hồ sơ trung tâm.
- [ ] Đăng ký hoạt động nhượng quyền thương mại theo quy định (Luật Thương mại) — bên nhượng quyền chịu trách nhiệm.
- [ ] Pháp nhân của bên nhận nhượng quyền có mã số thuế riêng; hoá đơn điện tử phát hành trên pháp nhân đó.
- [ ] Giấy phép hoạt động giáo dục / trung tâm kỹ năng của cơ sở mới (theo địa phương) trước ngày khai giảng.
- [ ] **Bảo vệ dữ liệu cá nhân (Luật BVDLCN 2025 / NĐ 356):**
  - [ ] Ghi rõ trong hợp đồng ai là **bên kiểm soát dữ liệu** với dữ liệu phụ huynh / học viên của trung tâm nhượng quyền.
  - [ ] Nếu Hội sở chuỗi cần xem dữ liệu cá nhân, phải có **thoả thuận xử lý dữ liệu** và trung tâm mới bật `hoSeesPii` — mặc định là **tắt**.
  - [ ] Thời gian giữ dữ liệu (`dataRetentionYears`) khớp với cam kết trong thông báo xử lý dữ liệu gửi phụ huynh.
  - [ ] Quy trình tiếp nhận yêu cầu của chủ thể dữ liệu (xem / sửa / xoá) chạy trong từng tenant (`/compliance`).
- [ ] Thoả thuận về thương hiệu, giáo trình, tài liệu: được dùng trong phạm vi hợp đồng, không phát tán ra ngoài.
- [ ] Điều khoản chấm dứt: dữ liệu học viên xử lý thế nào khi hết hợp đồng (chuyển giao / xoá / ẩn danh) và trong bao lâu.

### 4.2 Vận hành

- [ ] Chọn mô hình mẫu đúng (thường là tenant gốc `SATA`).
- [ ] Mã trung tâm và mã cơ sở thống nhất với cách đặt mã của chuỗi, không trùng.
- [ ] Rà lại bảng kê trước khi bấm Tạo; nhập lý do đủ rõ để đọc lại sau 6 tháng.
- [ ] Sau khi tạo: khai tài khoản ngân hàng, kiểm tra giá gói, tạo nhân sự, phân ca, mở lớp.
- [ ] Đào tạo vận hành cho quản trị trung tâm mới (`/huong-dan`), nhất là: chia lead, điểm danh, thu học phí, chốt công.
- [ ] Thống nhất bộ chỉ số Hội sở theo dõi hằng tháng (số học viên, doanh thu, công nợ) — đây là phần **luôn** chia sẻ.
- [ ] Hẹn lịch rà soát công tắc quyền riêng tư mỗi quý; mọi thay đổi đều có trong nhật ký.
- [ ] Khi đóng một trung tâm: chuyển trạng thái sang *Tạm ngừng* → *Đã đóng*; dữ liệu giữ theo `dataRetentionYears` rồi xoá / ẩn danh.

---

## 5. Kiểm thử nhanh sau khi triển khai

1. Đăng nhập bằng tài khoản của chuỗi → `/nhuong-quyen` hiện đủ thẻ trung tâm; thẻ nhượng quyền có nhãn **"Dữ liệu cá nhân đã che"**.
2. Mở `/leads` và `/students`: lead / học viên của trung tâm nhượng quyền hiện SĐT dạng `0912****78`, họ tên rút gọn.
3. Mở `/payments`: không có dòng nào của trung tâm nhượng quyền (chỉ tổng hợp trên thẻ).
4. Đăng nhập bằng quản trị của trung tâm nhượng quyền: chỉ thấy dữ liệu của mình; `/audit-log` không có dòng của chuỗi.
5. Thử chuyển một lead sang cơ sở của tenant khác → bị chặn kèm lý do tiếng Việt.
6. Bật `hoSeesPii` ở trung tâm nhượng quyền → người của chuỗi thấy dữ liệu đầy đủ; nhật ký ghi lại ai bật, lúc nào, vì sao.

---

## 6. Chỗ còn phải làm tay (đã biết)

- Bộ nhớ đệm danh mục loại thông báo (`notificationCatalog`) khoá theo `prefix`, chưa tách theo tenant — nếu hai tenant đặt cấu hình đẩy khác nhau cho cùng một loại, bản nạp trước thắng cho tới khi hết 60 giây đệm.
- Các truy vấn danh sách ít dùng (báo cáo chuyên sâu, màn đối soát go-live, kho / học cụ, tuyển dụng, marketing) **chưa** gắn `tenantCond`; hiện chúng vẫn an toàn vì lọc theo cơ sở, nhưng khi mở nhiều tenant nên bổ sung dần theo đúng ba bước ở mục 2.2.
- RLS trong Postgres chưa bật cho `tenant_id` (phòng thủ cuối); nguồn sự thật vẫn là tầng service.
- Chưa có màn "chuyển giao dữ liệu khi kết thúc hợp đồng" — hiện làm bằng tay theo mục 4.1.
