# Phân tích khoảng trống nghiệp vụ — bản gốc (NGHIEP-VU-GOC.md) ↔ bản mới

Cập nhật 18/09/2026 — **đã triển khai 4 đợt (13A–13D)**, xem "Tình trạng sau 4 đợt" bên dưới. Nội dung rà gốc giữ nguyên để đối chiếu.

Cập nhật lần đầu 17/09/2026. Rà theo từng màn / luồng trong `docs/NGHIEP-VU-GOC.md` (nhóm A–D), đối chiếu **mã nguồn thật** của bản mới: trang (`page.tsx` + client component), input zod của router, hàm service, quy tắc thuần trong `packages/core`, schema Drizzle. Chỉ xét **hành vi nghiệp vụ nhân sự dùng hằng ngày**, không xét câu chữ / giao diện.

**Quy ước đường dẫn** (rút gọn trong bảng):
`web/…` = `apps/web/src/app/(admin)/…` · `cmp/…` = `apps/web/src/components/…` · `api/r/…` = `packages/api/src/routers/…` · `api/s/…` = `packages/api/src/services/…` · `core/…` = `packages/core/src/…` · `db/…` = `packages/db/src/schema/…`

**Đánh giá**: `OK` tương đương · `PARTIAL` có nhưng khác / thiếu (ghi rõ) · `MISSING` chưa có · `DIFF` = DIFFERENT-BY-DESIGN (bản mới cố ý khác và hợp lý hơn — ghi lý do). **Cỡ**: S ≤ 1 ngày · M 2–4 ngày · L ≥ 1 tuần.

**Tóm tắt**: 164 mục được rà — OK 48 · PARTIAL 64 · MISSING 41 · DIFF 11. Khoảng trống nặng nhất nằm ở: (1) nối **lead → đơn → chốt** (bản mới chốt được khi chưa thu đồng nào); (2) **đơn hàng / trả góp** (tối đa 4 đợt, không giảm giá theo dòng, không nhiều con một đơn); (3) **thao tác từng buổi học** (không có điều chỉnh / huỷ buổi có lý do); (4) **chấm công** (bản mới trừ công theo giờ quét — ngược nguyên tắc “công theo lịch, quét chỉ sinh cờ”), danh mục mã ca, QR quầy và 6/10 loại đơn từ.

Lỗi thực thi phát hiện khi rà (ghi thêm ở bảng):
- `api/s/leads.ts#convertLead` sinh mã học viên bằng `count(*)` học viên của cơ sở + 1, trong khi `api/s/students.ts#nextStudentCode` dùng `max(code)` → dễ **trùng mã (unique violation)** khi có học viên chuyển cơ sở / nhập từ hệ cũ ⇒ chốt lead lỗi 500.
- `api/s/classOps.ts#createClass` sinh số thứ tự mã lớp bằng `count(*)` lớp cùng cơ sở + khoá (mọi năm) → trùng với mã lớp nhập từ hệ cũ (`CS2.SATA3.26.004`) ⇒ tạo lớp lỗi.
- `api/r/academics.ts` cho gọi `sessions.transition` với `event: "reschedule"`: buổi chuyển trạng thái `rescheduled` nhưng **không sinh buổi thay thế** ⇒ lớp mất một buổi khỏi lộ trình.
- `api/r/admissions.ts#transition` cho phép `event: "enroll"` trực tiếp ⇒ lead sang “Đã đăng ký” mà không tạo học viên / ghi danh / không qua kiểm tra thu tiền.
- `api/s/leads.ts#transitionLead` đếm trần học thử bằng số activity `trial_booked`, mà `rescheduleTrial` cũng ghi `trial_booked` ⇒ đổi lịch học thử bị tính thêm một lượt.
- `api/s/admissionsAdmin.ts#distributePool` / `leads.ts#assignLead` đều `roundsReceived + 1` ⇒ giao tay và chế độ “Theo tỷ lệ chốt” vẫn tiêu lượt (bản gốc: không tiêu).


## Tình trạng sau 4 đợt (18/09/2026)

| Đợt | Nội dung | Tình trạng | Kiểm chứng trên máy |
|---|---|---|---|
| 13A | Tuyển sinh → chốt → thu: cửa chặn chốt khi chưa thu tiền, đơn gắn lead, sửa / xoá lead, lý do bắt buộc, khử trùng SĐT toàn cục + gộp con, sổ lượt chia, form chuyển đổi đầy đủ, chuyển lead có bàn giao, chốt hàng loạt lùi ngày, nhập lead từ file | Xong | Chốt khi chưa thu bị chặn; có tiền thì chốt được (chỉ còn chặn theo khoá tiên quyết — đúng thiết kế); trùng SĐT gộp thêm con, đếm nhập lại; xoá lead còn đơn bị chặn |
| 13B | Tài chính: 1–12 đợt + cọc, sửa kế hoạch sau khi tạo, dòng đơn theo học viên / hình thức coach / giảm theo dòng, sửa & điều chỉnh khoản thu, đối soát ngân hàng phân bổ theo con, hoàn tiền tự đề xuất, nhập giao dịch cũ, công nợ theo ghi danh | Xong | Kế hoạch 9 đợt + cọc lưu đúng tổng; kế hoạch lệch tổng và xoá đợt đã thu bị chặn; sửa khoản chờ, điều chỉnh khoản đã xác nhận sinh bút toán; công nợ theo ghi danh 80 dòng |
| 13C | Học vụ: điều chỉnh / huỷ từng buổi (giữ đủ tổng buổi), hồ sơ học viên đầy đủ + PII mã hoá, vòng đời học viên, chuyển lớp có duyệt, huỷ lớp dây chuyền, điều kiện hoàn tất buổi, lịch nhiều giai đoạn | Xong | Huỷ buổi kiểu "dời" giữ 24/24 buổi; sửa buổi đã qua bị chặn; bảo lưu → kết thúc → nghỉ hẳn (sinh đề xuất hoàn tiền) → kích hoạt lại; chuyển lớp tạo yêu cầu rồi duyệt sinh ghi danh mới mang buổi sang |
| 13D | Chấm công & đơn từ: công theo ca đã xếp + cờ rà, 10 loại đơn áp ngay khi duyệt, QR quầy bắt buộc, danh mục 22 mã ca + lưới tháng, vị trí → bộ vai trò có hạn hiệu lực | Xong | Bảng công tính theo ca (tổng 199 công / 15 người); chấm công không có mã QR hợp lệ bị chặn; duyệt đơn nghỉ phép ghi thẳng ô ca; gán vị trí sinh vai trò `source=position` có hiệu lực |

**Còn lại (ngoài 25 mục ưu tiên)**: nhập lead / giao dịch cũ đọc CSV hoặc dán từ Excel (chưa đọc trực tiếp .xlsx vì không thêm được thư viện); gói bán (`/course-packages`); tạo vai trò tuỳ chỉnh; trang chi tiết ghi danh riêng; một số tab trong trang lớp (ảnh lớp, SCORM, đánh giá); xuất CSV cho Audit Log; đồng bộ MISA.

---

## A. CRM & Lead

| Mục | Bản gốc | Bản mới (file) | Đánh giá | Cỡ | Hướng sửa |
|---|---|---|---|---|---|
| Tập trạng thái lead | 10 trạng thái, thứ tự cột Kanban | `core/admissions/leadMachine.ts` `LEAD_STATUSES` 10 giá trị tương ứng (new…lost) | OK | – | – |
| Cách đổi trạng thái | Select chọn bất kỳ trạng thái | Máy trạng thái theo sự kiện (`leadTransition`), nhiều bước nhảy bị cấm (vd `new→consulting`, `deciding→trial_scheduled`, `trial_done→nurturing`, `lost→contacted`) | DIFF (có luật + SLA) nhưng thiếu cạnh | S | Bổ sung cạnh còn thiếu vào bảng `T` trong `leadMachine.ts`; giữ máy trạng thái |
| Lý do bắt buộc khi sang Đang nuôi dưỡng / Đã mất (3–500 ký tự) | Dialog bắt buộc cho cả 2 trạng thái | `lostReason` chỉ bắt buộc ở UI (`web/leads/[id]/detail.tsx#doEvent`), API `transition` để `optional`, max 200; `nurture` không cần lý do | PARTIAL | S | `LEAD_DROP_EVENTS=["nurture","lose"]` trong core; `leadTransition(from, event, {reason})` ném lỗi nếu thiếu / <3 / >500; zod `reason` bắt buộc có điều kiện; lưu `leads.drop_reason` |
| Chuyển sang Đã đăng ký chỉ qua chốt | Chỉ qua màn Chuyển đổi | `transition` nhận `event:"enroll"` (UI chặn, API không) | PARTIAL (lỗ hổng) | S | Bỏ `enroll` khỏi zod enum `api/r/admissions.ts#transition`; chỉ `convertLead` phát `enroll` |
| Kanban: đổi trạng thái + nút Phân công | Select trên thẻ + `autoAssignLeadAction` | `cmp/lead-kanban.tsx` chỉ hiển thị | PARTIAL | S | Thêm select trạng thái (dùng lại dialog lý do) + nút “Phân công” gọi `distributeOne` |
| Lọc / phân trang / xuất Excel danh sách lead | q, cơ sở, sale, nguồn, ngày nhận, trạng thái, sort | `api/s/leads.ts#leadInbox` + `web/leads/page.tsx` (Giai đoạn 12E) | OK | – | – |
| Cột “nhập lại N lần”, “Nhận lần đầu” | Có | Không có trường đếm | MISSING | S | `leads.reentry_count`, `leads.last_reentry_at` (xem mục khử trùng) |
| Sửa thông tin lead (`/leads/:id/edit`) | Tên, SĐT, email, tên/tuổi con, đơn vị, nguồn, ghi chú | Không có procedure `update` trong `leadsRouter` | MISSING | S | `updateLead(ctx,{leadId,parentName,phone,email,centerId,source,notes})`: chuẩn hoá SĐT, báo trùng nếu SĐT thuộc lead khác; audit before/after |
| Xoá lead | 2 bước xác nhận | Không có (có cột `deletedAt`) | MISSING | S | `deleteLead(ctx,{leadId,reason})` soft-delete, quyền `lead:delete` (quản lý) |
| Con của lead: thêm / sửa / xoá; trường ngày sinh, tuổi, giới tính, trường, khối, khoá, cơ sở quan tâm | Đủ | `addLeadChild` / `removeLeadChild`; không sửa; chỉ `birthYear, grade, school, course` (`db/admissions.ts#leadChildren`) | PARTIAL | S | Thêm `updateLeadChild`; cột `date_of_birth`, `gender`, `interested_center_id`; nút “Đưa vào danh sách con” cho `leads.childName` cũ |
| Ghi nhanh hoạt động: Gọi (người gọi, phút) / Nhắn (nền tảng) / Ghi chú / Email (người nhận, tiêu đề) | 4 tab + metadata | `addActivity` chỉ nhận `note`, `call`, `message`; không metadata | PARTIAL | S | Enum `lead_activity_type` thêm `email`; input `meta:{caller,durationMin,platform,to,subject}` lưu `leadActivities.meta` |
| Chuyển lead (cơ sở đích + sale nhận + **note bàn giao bắt buộc** + lý do; chặn tự bàn giao, chặn trùng nguồn) | `transferLead` | `api/s/admissionsAdmin.ts#transferCenter` chỉ đổi cơ sở, lý do ≥3; UI không cho chọn sale; không có bàn giao nội cơ sở kèm note | PARTIAL | S | Hợp nhất `transferLead(ctx,{leadId,toCenterId?,toUserId?,handoverNote(≥10),reason?})`: lỗi nếu `toUserId===assignedToId` hoặc (cơ sở, sale) đích trùng nguồn; activity `handover`; ghi `lead_transfers` |
| Chia lại lead theo cấu hình cơ sở | `chiaLaiLeadAction` | Chỉ `distributePool` cho lead chưa có sale | MISSING | S | `redistributeLead(ctx,{leadId,reason})` gọi `autoPickAssignee` bỏ qua sale hiện tại; `lead_transfers.kind="redistribute"` |
| Dùng chung lead cho CSKH cùng cơ sở | Công tắc share | `CENTER_SALES_CSM` có `lead:*` theo cơ sở (`core/policy/policy.ts`) → mọi CSKH cơ sở đã thấy | DIFF (phân quyền theo cơ sở thay cho cờ từng lead) | – | Giữ; chỉ cần nếu sau này thu hẹp CSKH về `lead:read_own` |
| Khối Thanh toán trên lead (Đã nộp / Tổng / Còn thiếu, link tạo đơn `?leadId=`) | Có | Không có; đơn hàng không gắn lead (`db/finance.ts#orders` không có `leadId`) | MISSING | M | Xem Đợt 1 – mục 1 |
| **Chặn chốt khi chưa ghi nhận thanh toán** | “Chưa đủ điều kiện chốt — cần ghi nhận thanh toán trước” | `convertLead` không kiểm tra; `paidAmount` chỉ là chữ trong activity | MISSING | M | Đợt 1 – mục 1 |
| Form chuyển đổi: PH (họ tên, email tuỳ chọn, SĐT, **CCCD 9/12 số, địa chỉ, tỉnh, phường**), nhiều học viên một lần, lớp đúng khoá + cơ sở, **học bổng toàn phần**, đồng ý ảnh NĐ13 | `/leads/:id/convert` | `convertInput` (`api/r/admissions.ts`): 1 con / lần, không CCCD/địa chỉ, không học bổng; lớp không lọc theo khoá quan tâm; `mediaConsent` OK | PARTIAL | M | Đợt 1 – mục 5 |
| Mã học viên khi chốt | Tự sinh `CS2-26-XXXXXX` | `convertLead` dùng `count+1` → dễ trùng (xem lỗi đầu tài liệu) | PARTIAL (lỗi) | S | Export và dùng `nextStudentCode` của `api/s/students.ts` |
| Tạo tài khoản PH chờ kích hoạt khi chốt | Có | `convertLead` đặt `accountStatus="pending_activation"`, emit `parent.account_pending` | OK | – | – |
| Lead đóng khi mọi con đã chốt | Lead → Đã đăng ký | `convertLead` đóng lead khi hết con chưa chốt | OK | – | – |
| Phiếu nhập nhanh (`/nhap-khach-hang`): không ô bắt buộc, nhiều bé, nguồn gợi ý, **link Facebook**, cơ sở/tự chia, kết quả “trùng số — đã thêm bé vào khách cũ” | Có | `web/nhap-khach-hang/form.tsx` bắt buộc tên + SĐT (hợp lý để khử trùng), không link FB; khi trùng chỉ ghi activity, **không thêm bé vào lead cũ**, chuyển thẳng sang trang lead | PARTIAL | S | Cột `leads.facebook_url`; khi trùng: gộp con (xem dòng dưới); form ở lại trang, hiện danh sách “Đã nhập trong phiên” |
| Phát hiện trùng theo SĐT chuẩn hoá | SĐT là căn cứ **duy nhất**, mọi lead | `normalizeVnPhone` OK (+84, khoảng trắng, thiếu 0); nhưng `createLead` chỉ so với lead **đang mở** và **chạm trong `dedupeDays` (30)** → lead đã mất / đã đăng ký / cũ hơn 30 ngày bị tạo trùng | PARTIAL | S | Đợt 1 – mục 3 |
| Import lead Excel (`/leads/import`): ≤5000 dòng, 3 nhóm Mới/Trùng/Lỗi, sửa tại chỗ, gộp trùng trong file, **không ghi đè — chỉ điền ô trống, giá trị khác ghi vào ghi chú, cột Đè**, không xoá dữ liệu, giữ trạng thái phễu, chia lại lead chưa chốt, mã CS cần quyền HO | Có | Không có | MISSING | L | Đợt 1 – mục 7 |
| Import danh sách ĐÃ ĐĂNG KÝ (nhiều sheet, xem thử bắt buộc, token `ĐãĐóng=`) | Có | Không có (chỉ `/chuyen-doi` nhập học viên / ghi danh theo mã cũ — `api/s/migration.ts`) | MISSING | M | Dùng chung bộ đọc của import lead, `status="enrolled"` + con; ghi token vào `leadChildren.notes` |
| Chốt hàng loạt: HV + tài khoản PH + ghi danh; **“Đã đóng” ⇒ ghi khoản thu lùi ngày**; gán lớp nhanh; tick đồng ý ảnh; lấy “đã đóng” từ file / học phí niêm yết | Có | `api/s/admissionsAdmin.ts#bulkConvert` + `web/leads/bulk-convert/table.tsx`: chốt từng dòng OK; `paidAmount` chỉ ghi chú; ứng viên chỉ lấy `trial_done/deciding/consulting/trial_in_progress` (không lấy lead đã “Đã đăng ký” từ import); không có công cụ hàng loạt | PARTIAL | M | Đợt 1 – mục 8 |
| Chế độ chia: Luân phiên đều lượt / Theo tỷ lệ chốt / Giao tay | Có | `DISTRIBUTION_MODES` + `pickAssigneeByMode` (có trọng số, làm trơn Laplace) | OK | – | – |
| Đếm lượt: chỉ lead chia **tự động** tiêu lượt; giao tay / tự nhập / import có sale **không** tiêu; chế độ tỷ lệ chốt không tiêu lượt | Có | Mọi đường gán đều `+1` (`assignLead`, `distributePool` mọi chế độ, `transferCenter`, `createLead` kể cả `assignedToId`) | PARTIAL (sai quy tắc) | S | Đợt 1 – mục 4 |
| Tắt người → đóng băng lượt; **bật lại → lượt = mức thấp nhất** của người đang nhận | Có | `upsertAssignee` chỉ đổi `isAvailable`, không chỉnh lượt ⇒ người nghỉ về bị dồn lead | MISSING | S | Đợt 1 – mục 4 |
| Đặt lại lượt toàn cơ sở = mức thấp nhất (không về 0) | Có | `resetRounds` đưa về 0 cho mọi người (tương đương về thứ tự nhưng mất số liệu) | PARTIAL | S | Đặt về `min` của người đang nhận |
| Chỉnh lượt tay có lý do; lịch sử thay đổi pool (ai bật/tắt/chỉnh, trước/sau, lý do) | Có | Không có (chỉ audit chung khi reset) | MISSING | S | `adjustRounds` + bảng `lead_pool_events` |
| Sổ chia lead (thời gian, lead, người nhập, chia cho, nguồn AUTO/SELF/MANAGER/IMPORT/AFFILIATE/DUPLICATE, tiêu lượt, lượt sau chia, xuất Excel) | Có | Chỉ activity `assignment` rải rác | MISSING | M | Bảng `lead_distribution_log` + tab “Sổ chia” |
| Bàn giao hàng loạt (lọc trạng thái, chiến dịch, chỉ lead chưa đóng, lý do, xem trước, chuyển cả task) | Có | `handoverLeads` + `web/ban-giao-lead/form.tsx` (preview/execute, chuyển task, `lead_transfers`, audit) | OK | – | – |
| Lead lâu ngày chưa chăm: lọc 7–730 ngày, **chọn nhiều → phân bổ lại kèm lý do** | Có | `staleLeads` + `web/lead-nguoi/page.tsx` chỉ xem | PARTIAL | S | `reassignLeads(ctx,{leadIds,toUserId,reason})` (dùng lại `handoverLeads` theo danh sách id) + checkbox trên trang |
| Báo cáo chuyển lead liên cơ sở theo tháng | Có | `transfersReport` + `web/leads/bao-cao-chuyen/page.tsx` | OK | – | – |
| Affiliate (mã giới thiệu, `?ref=`) | Có | `api/s/affiliates.ts`, `leads.referralCode` | OK | – | – |
| Lớp Trial: lớp trải nghiệm nhiều buổi riêng, tên tự đặt, thêm buổi, xếp HV học toàn bộ buổi, đổi lịch/huỷ buổi phải có lý do gửi GV, điểm danh, phiếu đánh giá PDF | Có | `api/s/trials.ts`: học thử **gắn vào buổi của lớp thường** (`trial_bookings`), đổi lịch / huỷ có lý do ≥5 và báo GV, ghi kết quả → cập nhật phễu, trần số buổi thử | DIFF (không cần duy trì lớp giả, GV dạy đúng lớp thật; chỗ trống tính chung) | – | Thiếu **phiếu đánh giá học thử (PDF)** — M, làm sau |
| Hoa hồng theo kỳ (duyệt, xuất) | Có | `api/s/commissions.ts` (tích luỹ khi đơn đủ tiền, duyệt / chi / thu hồi khi hoàn) | OK | – | – |
| Việc chăm sóc HV / cảnh báo rủi ro (vắng 2 buổi liên tiếp → task) | Có | `core/attendance/rules.ts#detectRisks`, `api/s/care.ts`, `api/s/schedule.ts#riskOverview` | OK | – | – |
| Sinh nhật: buổi chúc mừng = buổi học gần nhất trước ngày sinh nhật, báo trước 3 ngày (cấu hình) | Có | `api/s/care.ts#birthdays` chỉ liệt kê theo ngày sinh, gửi lời chúc | PARTIAL | S | Hàm core `celebrationSession(dob, sessions)` + cấu hình `birthdayLeadDays` + job tạo care task |
| CRM Dashboard (phễu, nguồn, hiệu suất sale) | Có | `crmSummary` + `web/crm` | OK | – | – |

## B. Học viên & Lớp

| Mục | Bản gốc | Bản mới (file) | Đánh giá | Cỡ | Hướng sửa |
|---|---|---|---|---|---|
| Trạng thái học viên | ACTIVE/PAUSED/GRADUATED chọn tay; INACTIVE qua nút | `students.status` 6 giá trị **suy tự động** từ ghi danh (`api/s/enrollments.ts#syncStudentStatus`) | DIFF (không lệch giữa HV và ghi danh) — nhưng `students.update` vẫn cho sửa `status` tay | S | Bỏ `status` khỏi `studentFields` của `update` (chỉ đổi qua vòng đời) |
| Danh sách HV: lọc tên/mã/PH/SĐT PH, trạng thái, cơ sở, **khối lớp** | Có | `listStudents` thiếu lọc `grade`; tìm theo tên PH không có | PARTIAL | S | Thêm `grade`, `ilike` tên PH vào `listStudents` |
| Hồ sơ HV — trường: SĐT HV, email HV, **mã HV nhập tay**, ảnh | Có | `studentFields` (`api/r/students.ts`) không có phone/email/code; `avatarKey` có cột nhưng form không có | MISSING | M | Đợt 3 – mục 17 |
| Hồ sơ HV — PH chính (quan hệ Mẹ/Bố/Ông/Bà), email, **CCCD PH**, **PH thứ hai** | Có | `guardians[]` (tối đa 3) OK khi tạo, `addGuardian` sau; quan hệ chỉ mother/father/guardian/parent; `parent_private.nationalIdEnc` có bảng nhưng không có luồng ghi | PARTIAL | S | Thêm quan hệ ông/bà; ghi CCCD vào `parent_private` (mã hoá) từ form HV / chuyển đổi / đơn |
| Hồ sơ HV — **địa chỉ** (số nhà, phường, quận, tỉnh) | Có | Không có | MISSING | S | Bảng `student_private(student_id, address, ward, district, city)` |
| Hồ sơ HV — **ngày đăng ký lần đầu**, **đơn vị mong muốn** | Có | Không có | MISSING | S | `students.first_enrolled_on` (tự điền từ ghi danh đầu nếu trống), `students.preferred_center_id` |
| Hồ sơ HV — **nhóm máu**, **dị ứng (danh sách)**, lưu ý sức khoẻ | Có | Chỉ `healthNotes` tự do | PARTIAL | S | `students.blood_type` enum (A_POS…UNKNOWN), `students.allergies jsonb string[]` |
| Vòng đời: **Bảo lưu** (tất cả lớp hoặc 1 lớp, lý do *, ngày trở lại **tuỳ chọn**) | Có | Bảo lưu **từng ghi danh** (`transitionEnrollment` pause) — bắt buộc ngày học lại, tối đa `maxPauseMonths` (3) | PARTIAL | M | Đợt 3 – mục 18 |
| Vòng đời: **Kết thúc bảo lưu** (resume mọi lớp đang bảo lưu) | Có | `resume` từng ghi danh; không tự nhắc khi đến hạn | PARTIAL | S | Đợt 3 – mục 18 |
| Vòng đời: **Nghỉ học hẳn** (INACTIVE, kết thúc bảo lưu, mọi ghi danh chưa xong → WITHDREW) | Có | Phải rút từng ghi danh | MISSING | S | Đợt 3 – mục 18 |
| Vòng đời: **Kích hoạt lại** | Có | Không có (chỉ gián tiếp khi ghi danh mới) | MISSING | S | Đợt 3 – mục 18 |
| Lịch sử bảo lưu (đợt đang chạy “từ → dự kiến trở lại”) | Có | `enrollment_events` lưu pause/resume; không có danh sách đợt | PARTIAL | S | Bảng `student_pauses` |
| Tài khoản PH (cấp, gửi lại mã, mã tại quầy, gắn/gỡ con) | Có | `api/s/parentAccounts.ts` (mã tại quầy băm SHA-256, khoá TK), cấp tự động khi chốt | PARTIAL (thiếu gắn/gỡ con từ hồ sơ, gửi ZNS hàng loạt — đã ghi ở DOI-SANH) | S | Ngoài phạm vi ưu tiên |
| Tiến độ học tập / lịch sử học tập trên hồ sơ | Có | `getStudent` trả ghi danh + đã học/còn lại + chuyên cần + sự kiện | OK | – | – |
| Hồ sơ năng lực robotics (10 kỹ năng × 4 mức) | Có | Không thấy trong hồ sơ HV (học bạ năng lực theo tiêu chí khoá ở `api/s/reportCards.ts`) | PARTIAL | S | Ngoài ưu tiên; có thể dùng tiêu chí học bạ |
| Import HV (upsert theo mã, ngày 2 định dạng, nhóm máu, dị ứng, centerSlug) | Có | `api/s/migration.ts#importStudents` (giữ mã cũ nếu chưa trùng, ghép theo tên + SĐT PH, xem trước) | DIFF (an toàn hơn cho chuyển đổi) — thiếu cột nhóm máu / dị ứng / địa chỉ | S | Thêm cột khi có trường ở mục 17 |
| Trạng thái ghi danh | 9 trạng thái (PENDING, CONFIRMED, STUDYING, ACTIVE, PAUSED, COMPLETED, WITHDREW, TRANSFERRED, CANCELLED) + ma trận | 5 trạng thái (`trial, active, paused, completed, withdrawn`) + `enrollment_events` (transfer_out/in) — `core/enrollment/lifecycle.ts` | DIFF (bớt trạng thái trung gian, lịch sử qua sự kiện) | – | Thiếu trạng thái **Huỷ (tạo nhầm)** — xem dòng dưới |
| Huỷ ghi danh tạo nhầm | `→ CANCELLED` | Không có (chỉ “Nghỉ học” → tính vào báo cáo nghỉ) | MISSING | S | Sự kiện `cancel` chỉ khi chưa có điểm danh / đơn đã thu; `endReason="cancelled"` |
| Lý do khi đổi trạng thái ghi danh (≥5 ký tự, mọi lần đổi) | Có | Bắt buộc cho pause/withdraw/transfer nhưng chỉ kiểm tra khác rỗng; activate/resume/complete không cần | PARTIAL | S | Dùng `requireReason(reason, 5)` cho `EVENTS_REQUIRING_REASON`; cân nhắc bắt buộc với `complete` |
| Kiểm tra lớp đầy khi vào trạng thái học | `CLASS_FULL` | `createEnrollment` kiểm tra (tính cả paused); `classes.ts#enrollStudent` kiểm tra khác (không tính paused, không chặn trùng, không ghi sự kiện) | PARTIAL | S | Cho `classes.enroll` gọi thẳng `createEnrollment` |
| Trang chi tiết ghi danh (`/enrollments/:id/edit`: mốc thời gian, audit, đổi trạng thái, chuyển lớp) | Có | Nằm trong hồ sơ HV (`web/students/[id]/actions.tsx#EnrollmentCard`) | PARTIAL | S | Trang riêng dùng lại `EnrollmentCard` + `enrollment_events` |
| Chuyển lớp: **cùng khoá**, **không vượt tiến độ**, hết chỗ → **waitlist**, **yêu cầu → quản lý duyệt/từ chối** | Có | `transferEnrollment` chuyển **ngay**; khác khoá chỉ cảnh báo; không kiểm tra tiến độ; lớp đầy → lỗi; không có yêu cầu/duyệt; mang sang số buổi còn lại (tốt hơn) | PARTIAL | M | Đợt 3 – mục 21 |
| Sắp hết khoá (≤5 buổi) | Có | `nearingEnd` (ngưỡng cấu hình, mặc định 4; có cờ đã tái tục) | OK | – | – |
| Hoàn thành khoá & chứng chỉ (đề xuất GV, hàng loạt theo lớp) | Có | `db/academics.ts#courseCompletions`, `api/s/reportCards.ts` | OK | – | – |
| Học bạ năng lực (tiêu chí theo khoá, nộp duyệt, phát hành) | Có | `reportCards` / `competencyCriteria` | OK | – | – |
| Trạng thái lớp | PLANNED, RECRUITING, PENDING_APPROVAL, ACTIVE, COMPLETED, CANCELLED | `draft → pending_approval → recruiting → running → finished / cancelled` (`core/classes/lifecycle.ts`) | DIFF (thêm bước “bắt đầu” có kiểm tra sĩ số tối thiểu) | – | – |
| Duyệt lớp → **tự sinh buổi** (bỏ ngày nghỉ, số buổi chuẩn của khoá) | Có | `transitionClass` approve → `generateSessionsFor` (kiểm tra trùng phòng/GV, readiness) | OK | – | – |
| Form lớp: tên *, mã, khoá *, cơ sở *, trạng thái, mô tả, **giáo trình ACTIVE bắt buộc**, phòng *, GV chính *, trợ giảng ≠ GV chính, khai giảng *, bế giảng, min (mặc định 5) / max (mặc định 20) | Có | `classes.create`: phòng / GV / giáo trình không bắt buộc (tự lấy giáo trình active khi sinh buổi), min mặc định 1, max mặc định 12 (trần 30); kiểm tra GV được dạy khoá | PARTIAL | S | Mặc định min 5 / max 20 qua cấu hình vận hành; bắt buộc phòng + GV khi “Gửi duyệt” (đã có với GV) |
| **Quy ước tên lớp** `sata3.14h-CN.CS2-P302` (gợi ý, sửa được) | Có | Nhập tự do (`web/classes/new/form.tsx`) | MISSING | S | `core/codes.ts#suggestClassName({courseCode, slots, roomCode, centerCode})`; nút “Dùng tên gợi ý” |
| **Mã lớp** `CS2.SATA3.26.004` (tuỳ chọn nhập tay, duy nhất) | Có | Tự sinh, seq = `count` lớp cùng cơ sở + khoá **mọi năm** → lệch quy ước năm, trùng mã nhập từ hệ cũ; không nhập tay | PARTIAL (lỗi) | S | Seq = `max(parseClassCode(code).seq)` theo (cơ sở, khoá, năm) trong advisory lock; cho nhập tay có kiểm tra `parseClassCode` + unique |
| **Kế hoạch lịch nhiều giai đoạn** (từ ngày – đến ngày – thứ – giờ – ghi chú; giai đoạn cuối mở) | Có, cả khi lớp nháp | `class_schedules` có `effectiveFrom/To` (dữ liệu hỗ trợ), nhưng `saveDraftSchedule` chỉ lưu **một** giai đoạn từ ngày khai giảng; giai đoạn sau chỉ tạo được bằng “Áp lịch mới” sau khi mở lớp; không nhập ghi chú | PARTIAL | M | Đợt 3 – mục 23 |
| Áp lịch mới cho buổi đã sinh: buổi trước ngày áp dụng giữ nguyên; buổi **đã có dữ liệu** (điểm danh, nhận xét, bài tập, ảnh, hoàn tất, huỷ) giữ nguyên; tổng buổi không đổi; xem trước + cảnh báo trùng | Có | `planScheduleChange` / `applyScheduleChange`: xem trước, trùng phòng/GV, giữ tổng buổi, lý do bắt buộc, báo GV/PH; **chỉ bảo vệ buổi có điểm danh** (không xét nhận xét, bài tập, ảnh); học thử chỉ cảnh báo | PARTIAL | S | `existingForPlan` thêm `hasContent` (sessionNote, studentRemark, assignments, session_media); `planReflow` loại buổi `hasContent` |
| “Xếp lại buổi theo lịch” (neo lại cả dãy từ khai giảng) + trang Kiểm tra lịch toàn hệ thống | Có | `scheduleCheck` phát hiện lệch từng lớp; **không có thao tác sửa**, không có trang tổng | PARTIAL | M | Đợt 3 – mục 23 |
| **Huỷ lớp dây chuyền**: rút mọi ghi danh còn học, huỷ buổi tương lai, **tạo yêu cầu hoàn tiền** | Có | `transitionClass` cancel **chặn** khi còn ghi danh; chỉ huỷ buổi `scheduled` | MISSING | M | Đợt 3 – mục 20 |
| Tab Chương trình (kế hoạch buổi theo giáo trình, sửa tiêu đề/ghi chú buổi, áp version mới) | Có | Buổi mang `lessonId` + `topic`; không sửa kế hoạch từng buổi / đổi version | PARTIAL | M | Ngoài top 25 |
| **Điều chỉnh từng buổi** (ngày / GV / phòng) | `adjustSessionAction` | Không có service/UI (chỉ đổi GV cho mọi buổi tương lai qua `updateClassInfo`) | MISSING | M | Đợt 3 – mục 19 |
| **Huỷ từng buổi** (lý do ≥5, không xoá, “buổi bù xử lý theo lịch”) | `cancelSessionAction` | `sessions.transition` event `cancel` — lý do **không bắt buộc**, không báo PH, không bù buổi; không có nút ở trang lớp; event `reschedule` làm mất buổi | MISSING (lỗi) | M | Đợt 3 – mục 19 |
| Thêm buổi ngoài lộ trình (coach 1-1/1-2/1-4, bù, vượt, bổ sung) | Có (`SessionCategory`) | `addExtraSession` (đánh số 1001+ không xô lệch lộ trình, kiểm tra trùng) | OK (tốt hơn) | – | Thiếu loại Workshop / Sự kiện / Hỗ trợ vận hành — S |
| Điểm danh: Có mặt / Vắng / Muộn / Phép; lý do PH xin vắng; trạng thái bù | Có | `present, late, absent_excused, absent_unexcused, makeup`; `recordAttendance` không nhận `note` (lý do vắng) — chỉ `correctAttendance` có | PARTIAL | S | Thêm `note` (lý do PH xin vắng) vào input `recordAttendance` + ô nhập khi chọn vắng |
| Sửa điểm danh hồi tố có lý do + nhật ký | Không nêu rõ | `api/s/schedule.ts#correctAttendance` | OK | – | – |
| Học bù: buổi vắng → gợi ý buổi cùng khoá / cùng bài / còn chỗ / không vượt tiến độ → xếp → đã bù / huỷ | Có | `api/s/makeup.ts` (`pendingAbsences`, `candidatesFor` cùng khoá + cùng số buổi, còn chỗ; duyệt/từ chối có lý do; hoàn tất ghi điểm danh `makeup`) | OK | – | – |
| **Hoàn tất buổi**: điểm danh đủ \*, xác nhận bài đã dạy \*, **nhận xét từng HS có mặt** \*, ảnh trong kho (trang /attendance), checklist 9 mục | Có | `transition` complete: điểm danh đủ + **một nhận xét chung** (≥10) + checklist bắt buộc “thu dọn”, “bàn giao HV”; không bắt nhận xét từng HS, không xác nhận bài, không ảnh | PARTIAL | M | Đợt 3 – mục 22 |
| Tổng quan /attendance theo lớp (sĩ số, buổi đã dạy, chưa chốt) | Có | `web/attendance/page.tsx` chọn lớp → lưới; `overdueQueue` riêng | PARTIAL | S | (đã có trong DOI-SANH #3) |
| Học sinh lớp: **danh sách đủ điều kiện** (đúng khoá + đúng cơ sở + chưa ở lớp active), thêm chọn / thêm toàn bộ; **sale phụ trách của ghi danh**; chuyển / gỡ / nghỉ hẳn | Có | Không có trang `/classes/:id/students`; ghi danh từng em ở `/enrollments/new`; không có sale theo ghi danh | MISSING | M | `eligibleStudents(ctx,{classId})` + `bulkEnroll(ctx,{classId, studentIds, packageSessions})`; cột `enrollments.sale_user_id` (dùng cho hoa hồng) |
| Giờ buổi học hiển thị giờ VN | Lỗi hiện hữu (UTC) | Lưu `date` + `time` giờ địa phương | OK | – | – |
| Phòng học (mã, tên, sức chứa, trạng thái Hoạt động/**Bảo trì**/Tạm ngừng, thiết bị) | Có | `org.upsertRoom`: chỉ `isActive`, không thiết bị | PARTIAL | S | `rooms.status` enum + `equipment jsonb` |
| Ưu đãi khoá (giảm tiền / % / học bổng / chương trình, hiệu lực) | Có | Không có | MISSING | M | Bảng `course_discounts`; dùng làm “khoản giảm gợi ý” ở dòng đơn (Đợt 2 – mục 10) |
| Gói khoá học để bán | Có | Không có (DOI-SANH #11) | MISSING | L | Ngoài top 25 |

## C. Tài chính

| Mục | Bản gốc | Bản mới (file) | Đánh giá | Cỡ | Hướng sửa |
|---|---|---|---|---|---|
| Loại đơn | COURSE, PACKAGE, EXAM, PRODUCT, COMBO | `course, product, exam, other` (`core/finance/rules.ts`) | OK (đủ cho tạo tay) | – | – |
| Trạng thái đơn lưu & chuyển tay (DRAFT→PENDING→CONFIRMED→COMPLETED; huỷ; chống ghi đè `updatedAt`) | Có | Trạng thái **suy từ tiền đã xác nhận** (`deriveOrderStatus`), huỷ có lý do + chặn khi đã có tiền (`canCancelOrder`) | DIFF (không có trạng thái “người quyết” dễ lệch với tiền) | – | Thiếu **Nháp** — S (cờ `orders.is_draft`, không sinh ledger) |
| **Trạng thái hiển thị suy từ tiền (kể cả khoản chờ)**: Chưa đóng / Đang đóng (+ chờ KT) / Đủ — chờ đối soát / Đủ — đã đối soát / Đơn 0đ / Thu vượt; badge trả góp | Có | Trạng thái tính **chỉ từ khoản đã xác nhận**; danh sách có số `confirmed`/`pending` nhưng không có badge tổng hợp | PARTIAL | S | Đợt 2 – mục 11 |
| **Một đơn nhiều dòng, nhiều con** (mỗi dòng: học viên / con của lead, khoá, số buổi mua 1–500, SL, đơn giá) | Có | Nhiều dòng OK nhưng đơn gắn **một** `studentId` / `enrollmentId`; dòng không có học viên; **một ghi danh chỉ một đơn mở** | PARTIAL | L | Đợt 2 – mục 10 |
| **Hình thức lớp**: nhóm / Coach 1-1 ×2 / 1-2 ×1,8 / 1-4 ×1,5 | Có | Không có | MISSING | S | Đợt 2 – mục 10 |
| **Giảm giá theo dòng** (số tiền / % ≤ trần 50%, lý do, cộng dồn, không vượt thành tiền) | Có | Một giảm giá **cấp đơn** (`discountType/Value`), % tới 100, lý do = ghi chú nội bộ | PARTIAL | M | Đợt 2 – mục 10 |
| Gói cam kết 5 buổi không bán coach / lẻ (SR.QD.219 Đ3/5) | Server từ chối | Không có | MISSING | S | `courses.fixed_package boolean`; `priceLine` báo lỗi nếu coach hoặc số buổi ≠ gói |
| Giá theo số buổi | Mặc định tổng buổi khoá, sửa khi mua lẻ | `packagePrice` tỷ lệ theo buổi | OK | – | – |
| Khách: tên, SĐT (tra lead trùng / hồ sơ HV cùng SĐT), email, CCCD, địa chỉ, tỉnh, phường | Có | `createOrder.customer` đủ trường; CCCD tách `order_private` + che + xem có lý do (tốt hơn); **không tra lead / HV theo SĐT** | PARTIAL | S | `customerLookup(ctx,{phone})` trả lead / học viên trùng SĐT cho form |
| Phương thức TT lọc theo cơ sở & loại đơn | Có | `createOrder` kiểm tra cơ sở + `allowFor` | OK | – | – |
| **Kế hoạch thanh toán**: 1 lần / 2–4 học phần / **N đợt 1–12**, **thu cọc trước**, tổng phải khớp, nhắc trước (mặc định 14) | Có | `validateInstallmentPlan` **1–4 đợt**, không có cọc; nhắc mặc định theo cấu hình (3) | PARTIAL | S | Đợt 2 – mục 9 |
| **Sửa kế hoạch thanh toán sau khi tạo** (đợt đã thu giữ nguyên, lệch tổng báo lỗi) | Có | Không có procedure | MISSING | M | Đợt 2 – mục 9 |
| **Công nợ theo con / đợt riêng cho con** | Có | Không có | MISSING | M | Đợt 2 – mục 10 (cột `order_installments.student_id`) |
| Phiếu thu & QR **theo từng đợt** (dùng lại QR còn hiệu lực, nội dung CK khớp đúng đợt) | Có | `getOrder.qr` một QR cho số còn thiếu của đợt kế, nội dung = mã đơn | PARTIAL | S | Memo có hậu tố đợt (`SATA DH26000012 D2`); `extractOrderRef` đọc thêm số đợt để rót đúng đợt |
| Đổi phương thức TT của đơn; gửi email đơn | Có | Không có | MISSING | S | `updateOrderPaymentMethod(ctx,{orderId, methodId, reason})`; `sendOrderEmail` dùng `queueEmail` |
| Người mua trên hoá đơn (MST, đơn vị, email nhận) | Có | `api/s/einvoice.ts#updateDraft` (HĐĐT đầy đủ hơn) | OK | – | – |
| Lịch sử trạng thái đơn | Có | `order_events` + sổ cái bất biến `finance_ledger` | OK (tốt hơn) | – | – |
| **Hai bước thu**: Sale ghi nhận → Kế toán xác nhận / từ chối / điều chỉnh | Có | `recordPayment` → `decidePayment` (lý do ≥5 khi từ chối/điều chỉnh, **người ghi không tự xác nhận**, sinh số phiếu, email phiếu thu) | OK (tốt hơn) | – | – |
| Ghi nhận khoản: đơn, số tiền, phương thức, ngày, **Enrollment ID**, **link chứng từ**, ghi chú | Có | Không có enrollment / chứng từ; chặn ngày thu > 90 ngày trước | PARTIAL | S | Cột `payments.enrollment_id`, `payments.evidence_url` (https) |
| **Sửa khoản đang chờ** (`updatePendingPaymentAction`) | Có | Không có (chỉ từ chối rồi ghi lại) | MISSING | S | Đợt 2 – mục 12 |
| **Điều chỉnh khoản đã xác nhận** sinh bút toán chênh lệch (`expectedUpdatedAt`) | Có | Chỉ điều chỉnh **trước** khi xác nhận | PARTIAL | S | Đợt 2 – mục 12 |
| Xác nhận hàng loạt lượt backfill (xem thử, gắn ghi danh cho khoản bị bỏ) | Có | Không có (nhập cũ ghi thẳng “đã xác nhận”) | MISSING | S | Đợt 2 – mục 14 (`bulkConfirmBatch`) |
| Che CCCD / địa chỉ, xem đầy đủ phải có lý do + log | Có | `maskIdNumber`, `revealCustomerPrivate` (chỉ kế toán, lý do, audit `PII_REVEAL`) | OK | – | – |
| Cột sổ khoản thu: nguồn HV (kênh lead), sale, tên PH, địa chỉ | Có | `listPayments` thiếu nguồn lead / sale | PARTIAL | S | Join `orders.lead_id → leads.source/assignedToId` (sau Đợt 1 – mục 1) |
| **Công nợ theo ghi danh**: chip Chưa chốt học phí / Đủ tiền — chờ KT / Còn thiếu / Chưa đóng đồng nào / Thu vượt / Đã đóng đủ; “Thiếu — PH đang thấy” vs “Thiếu thật”; tuổi nợ 1–7 / 8–30 / >30 | Có | `debts` theo **đơn** chưa đủ, bucket 1–30 / 31–60 / 61–90 / >90; `missingTuition` riêng | PARTIAL | M | Đợt 2 – mục 15 |
| **Sửa học phí hợp đồng** của ghi danh | Có | Không có | MISSING | S | Đợt 2 – mục 15 (`updateEnrollmentFee`) |
| Thiếu học phí: chưa có đơn / đã thu một phần | Có | `missingTuition` (+ giá dự kiến theo gói) | OK | – | – |
| **Ghi học phí cũ** (giảm giá + lý do, tiền đã thu → tạo đơn đã xác nhận + khoản backfill; ghi thêm) | Có | Không có hộp thoại; chỉ qua nhập CSV giao dịch cũ | MISSING | S | `backfillTuition(ctx,{enrollmentId, discount?, discountReason?, paidAmount, paidAt, note})` dùng lại `createOrder` + `payments.source="backfill"` |
| **Nhập giao dịch cũ**: khớp theo **SĐT PH + họ tên** (mã hai hệ khác nhau); đọc xlsx trong trình duyệt (CCCD không rời máy); Sẽ ghi / Đã có tiền — bỏ qua / Cần chọn / Không tìm thấy; **gán sale bắt buộc**; mỗi em một đơn, mỗi đợt một khoản giữ ngày đóng, **chờ kế toán** | Có | `api/s/bank.ts#previewLegacy/importLegacy`: CSV; khớp theo **mã đơn** hoặc **mã HV hệ mới + mã lớp** (không dùng `legacy_refs`, không SĐT + tên); chống trùng theo **số phiếu cũ**; ghi **đã xác nhận ngay**; không gán sale | PARTIAL | M | Đợt 2 – mục 14 |
| Biến động số dư: webhook + rót vào phiếu thu, Cần xử lý / Đã khớp / Bỏ qua | Có | `ingestBankTx` / `matchBankTx` (`decideBankMatch`: khớp mã đơn trong nội dung, tài khoản thuộc cơ sở, xác nhận luôn khoản sale đã ghi cùng số tiền), nhập sao kê CSV (tốt hơn) | OK | – | – |
| Gắn giao dịch vào đơn (tìm đơn, rót) | Có | `matchCandidates` / `matchManually` (lý do khi cần kiểm tra) | OK | – | – |
| **Phân bổ một giao dịch cho từng con** (Khớp đủ / Thừa / Thiếu, tạo đợt tại chỗ) | Có | Không có (một giao dịch = một khoản thu, `bank_tx_payment_unique`) | MISSING | L | Đợt 2 – mục 13 |
| Bỏ qua (không phải học phí) | Có | `ignoreBankTx` (lý do ≥5) | OK | – | – |
| **Gỡ gắn** giao dịch đã khớp | Có | Không có | MISSING | M | Đợt 2 – mục 13 |
| Tiền thừa chưa xử lý (không tự hoàn, không tự trừ đơn khác) | Có | Tiền vượt → `needs_review` và **chặn** rót; không có danh sách tiền thừa | PARTIAL | S | Đợt 2 – mục 13 (`bank_transactions.surplus_amount`) |
| Hoàn tiền: đề xuất = Σ đã thu − buổi đã học × đơn giá | Có | `refundProposal` (+ trừ đã hoàn, làm tròn nghìn, phân bổ giảm giá) | OK | – | – |
| Duyệt / từ chối / chi hoàn | Có | `decideRefund` / `payRefund` (người đề xuất không tự duyệt, người duyệt không tự chi, chi chuyển khoản cần mã GD, thu hồi hoa hồng) | OK (tốt hơn) | – | – |
| **Đề xuất hoàn tự sinh theo vòng đời** (rút học / chuyển lớp / huỷ lớp) + “tạo đề xuất cho ca chưa có” | Có | Tạo tay từng ghi danh (`requestRefund`); không sinh khi rút / chuyển / huỷ lớp | PARTIAL | M | Đợt 2 – mục 16 |
| Phương thức TT theo cơ sở / dùng chung, loại, cho phép (khoá/gói/thi/SP), TK nhận (BIN 6 số, số TK, chủ TK) | Có | `upsertPaymentMethod` (chỉ HO tạo dùng chung, kiểm tra BIN) | OK | – | Thiếu loại COD / Ví, logo — không ảnh hưởng vận hành |
| Cấu hình vận hành: lưu phải ghi lý do → audit | Có | `saveOpsGroup` có `reason` | OK | – | – |

## D. Nhân sự & Giáo viên

| Mục | Bản gốc | Bản mới (file) | Đánh giá | Cỡ | Hướng sửa |
|---|---|---|---|---|---|
| Hồ sơ GV: ngạch, loại HĐ, trạng thái, giới thiệu, **khoá dạy được** | Có | `api/s/teachers.ts#upsertTeacher` (không cho bỏ khoá đang dạy; `assertTeacherQualified` khi phân lớp) | OK (tốt hơn) | – | – |
| Lớp đang phụ trách + **gán / gỡ lớp từ hồ sơ GV** | Có | Chỉ hiển thị; gán ở trang lớp | PARTIAL | S | Nút gán lớp gọi `updateClassInfo` (vai GV chính / trợ giảng) |
| Lịch dạy tuần + **phát hiện xung đột giờ** | Có (cảnh báo) | Ràng buộc EXCLUDE trùng GV / phòng ở DB (`db/sql/0001_constraints.sql`) — xung đột không thể tồn tại | DIFF (chặn từ gốc) | – | – |
| Tải giảng dạy / tuần, số buổi đã dạy theo tháng | Có | `getTeacher.weeks`, `taughtByMonth`, mức tải theo định mức | OK | – | – |
| Đánh giá GV: điểm PH trung bình; dự giờ 1–5 + nhận xét bắt buộc | Có | `addEvaluation` (không tự đánh giá, buổi phải của GV); **thiếu điểm PH TB** trên hồ sơ | PARTIAL | S | Lấy TB `care_feedback.teacherRating` của lớp GV phụ trách vào `getTeacher` |
| Danh sách nhân sự: lọc tên/SĐT/email/mã, phòng ban, cơ sở, trạng thái | Có | `listStaff` | OK | – | – |
| Hồ sơ NS: **mã NV nhập tay (gợi ý SR.NV.NNN)**, chức danh, phòng ban, ngày vào, trạng thái, **Miễn tính công**, **NV Hội sở**, **quản lý trực tiếp**, CCCD, địa chỉ, **liên hệ khẩn cấp**, lương (**bậc 1–9, mức 1–5**, lương BHXH), môn dạy, chứng chỉ | Có | `upsertStaff`: mã tự sinh `NV0001`; không có miễn công, HO, quản lý, liên hệ khẩn cấp, bậc/mức; lương cơ bản + phụ cấp (chỉ người có `staff:salary`) | PARTIAL | M | Cột `staff.manager_staff_id`, `staff.timesheet_exempt`, `staff.is_ho`, `staff_private.emergency_contact`, `salary_grade`, `salary_level`, `insurance_salary`; mã nhập tay (mặc định gợi ý) |
| Trạng thái công việc (đang làm / tạm nghỉ / đã nghỉ / cho nghỉ) | Có | `probation, active, on_leave, resigned` + khi nghỉ: kết thúc vị trí, gỡ ca tương lai, huỷ đơn chờ | OK (tốt hơn) | – | Thiếu phân biệt “cho nghỉ” — S |
| Import nhân viên (upsert, ô trống giữ nguyên) | Có | Không có | MISSING | M | Ngoài top 25 |
| Vị trí: kiểu Chính / Kiêm nhiệm / Uỷ quyền, hiệu lực, **đúng một Chính** | Có | `staff_positions` + `validatePosition` (một Chính không chồng thời gian; uỷ quyền ≤90 ngày) | OK | – | – |
| **Quyền gắn vào vị trí** (bộ vai trò của vị trí; người rời → vị trí giữ quyền); cây báo cáo; **hết hạn → quyền tự tắt** | Có | Vị trí chỉ là chức danh; quyền nằm ở `user_roles` gán trực tiếp, không có hiệu lực / hết hạn | MISSING | L | Đợt 4 – mục 25 |
| **Điều động tác nghiệp** (mở phạm vi dữ liệu cơ sở khác trong khoảng thời gian, không đổi vai) | Có | Không có | MISSING | M | Đợt 4 – mục 25 |
| **Nguyên tắc tính công: theo lịch đã xếp; lượt quét chỉ sinh cờ, không tự trừ công** | Có | `core/hr/rules.ts#computeDay` **trừ công** theo phút muộn/sớm (0,5 hoặc 0), không quét = vắng 0 công, không có ca = 0 | DIFF ngược nguyên tắc ⇒ xử lý như PARTIAL | M | Đợt 4 – mục 24 |
| Cờ chấm công (không lượt, thiếu ra, ra không vào, thiếu sáng/chiều, muộn, sớm, thiếu giờ, sát giờ, ngoài vùng, thiếu GPS, sai nơi làm, ngoài lịch, bấm trùng, vượt trần, ngày lễ, GPS kém) + **kết luận rà** (có lý do / gỡ / ghi đè / vắng có lý do) | Có | Chỉ `DayStatus` (late, early, missing_in/out, absent…); chấm ngoài vùng bị **từ chối**; không có kết luận rà | PARTIAL | M | Đợt 4 – mục 24 |
| Ghi đè công có lý do, lưu vết; không tự chỉnh công mình | Có | `overrideDay` (0 / 0,5 / 1 / 1,5; lý do ≥5; chặn tự chỉnh; báo người được chỉnh) | OK | – | – |
| Đánh dấu vắng có lý do; **sửa giờ quét tay** (giữ lượt thật) | Có | Không có (chỉ qua đơn quên chấm công) | MISSING | S | `markExcusedAbsence`, `addManualPunch(ctx,{staffId,date,kind,time,reason})` → `attendance_punches.source="manual"` |
| **Mã QR cố định tại quầy** (đời khoá), chấm công phải quét mã, mở từ menu không chấm được; màn hình trình chiếu | Có | `hr.punch` chấm từ ứng dụng bằng GPS, **không cần QR**; không có màn hình QR | MISSING | M | Đợt 4 – mục 22 |
| **Kiểm định vị theo bán kính** (mặc định 100m) | Có | `checkGeofence` (bán kính 30–2000, mặc định 150; sai số GPS >200m bị từ chối; cơ sở chưa khai toạ độ → cho qua có ghi chú) | OK | – | Chỉnh mặc định 100m — S |
| Điểm chấm công (nhiều điểm / cơ sở, bật/tắt kiểm định vị) | Có | Toạ độ gắn thẳng `centers` (một điểm) | PARTIAL | S | Bảng `checkin_points` (Đợt 4 – mục 22) |
| **Danh mục mã ca**: nhiều đoạn (ca gãy), nghỉ giữa giờ có/không tính công, giờ KH, **công 0,5/1/1,5**, loại (có giờ / chỉ nơi làm / linh động / nghỉ X,P), nơi làm, phạm vi dùng chung chỉ HO sửa, sửa mã không đổi lịch cũ | Có | `work_shifts`: một đoạn giờ + phút nghỉ, **mỗi ca = 1 công**, không loại / nơi làm / mã nghỉ; dùng chung chỉ HO tạo OK; ca đã dùng không cho đổi giờ (tương đương “sửa không đổi lịch cũ”) | PARTIAL | M | Đợt 4 – mục 23 |
| **Lưới phân ca tháng**, sinh lưới từ **khung ca tuần**, import Google Sheet (tự nhớ ánh xạ tên, idempotent), ô sửa tay / ô từ đơn **được giữ** khi sinh lại, ca chịu công ở khối khác | Có | Lưới **tuần** (`roster`, `assignShifts`), “chép tuần” (`copyWeek`, có/không ghi đè); không phân biệt nguồn ô; không khung tuần; không import | PARTIAL | M | Đợt 4 – mục 23 |
| Lịch ca của tôi: tổng hợp tháng tạm tính, ngày có vấn đề, nút nộp đơn chỉnh công | Có | `myAttendance` + `web/cham-cong/lich-ca/self.tsx` (phép năm còn lại theo tỷ lệ — tốt hơn) | OK | – | – |
| **Chốt kỳ** đóng băng công, **chỉ HO mở lại** | Có | `lockPeriod` (snapshot) / `unlockPeriod` (chỉ HO/SA, lý do); `assertOpen` chặn sửa ca / chỉnh công / đơn trong kỳ khoá | OK | – | – |
| Việc dang dở trước chốt (cờ chưa rà, ngày không quét, đơn chờ — duyệt sau chốt không vào kỳ) | Cảnh báo | `lockCheck`: đơn chờ là **chặn** (không cho chốt), thiếu quét là cảnh báo | DIFF (chặt hơn: không để đơn treo ngoài kỳ) | – | – |
| **Công chuẩn** kỳ (0–31, bước 0,5, mặc định = ngày tháng − nghỉ tuần − lễ, ghi chú) | Có | Không có | MISSING | S | `timesheet_periods.standard_units`, `standard_note`; hàm `defaultStandardUnits(period, weeklyOff, holidays)` |
| Cột “Buổi dạy ở cơ sở” / màn Công dạy (buổi lớp hoàn thành do người đó dạy) | Có | Không có trong bảng công (báo cáo GV ở `api/s/reports.ts#teacherReport`) | PARTIAL | S | Thêm `taughtSessions` vào `timesheet()` qua `staff.teacherId` |
| Xuất Excel bảng công tạm | Có | Có CSV ở một số trang; `timesheet` chưa có | PARTIAL | S | `CsvButton` trên `web/cham-cong` |
| **10 loại đơn** (Đổi lớp dạy, Dạy thay, Nghỉ buổi dạy, Đổi ca, OT, Muộn/Sớm, Chỉnh công, Nghỉ phép, Làm từ xa, Công tác) | Có | 4 loại: `leave, late_early, overtime, missing_punch` | PARTIAL (thiếu 6) | L | Đợt 4 – mục 21 |
| 8 loại nghỉ phép | Có | 4 loại (`annual, sick, unpaid, other_paid`) | PARTIAL | S | Đợt 4 – mục 21 |
| **Duyệt là áp ngay lên lịch & công**; áp không được → đơn quay lại Chờ duyệt kèm lý do | Có | Nghỉ / muộn-sớm / OT được **tính lúc đọc** (tương đương áp); quên chấm công → thêm lượt quét; không có loại nào đổi lịch ca / buổi dạy nên không có “áp thất bại” | PARTIAL | M | Đợt 4 – mục 21 |
| **Từ chối bắt buộc lý do** | Có | `decideRequest` (`reasonOf` ≥5) | OK | – | – |
| Không tự duyệt đơn mình | – | `requestTransition` chặn | OK | – | – |
| **Cờ Nộp muộn** (nộp sát ngày áp dụng, vẫn gửi được); KPI chờ >2 ngày | Có | Không có cờ; đơn lùi quá **7 ngày bị chặn**; `hrQueues` đếm quá 48h | PARTIAL | S | Đợt 4 – mục 21 |
| **Cơ sở nhận đơn** = cơ sở chịu công ngày đó (người HO tự chọn) | Có | `createRequest` luôn dùng `staff.centerId` | PARTIAL | S | Đợt 4 – mục 21 |
| Tuyển dụng (JD, trạng thái) | Có | `api/s/recruit.ts` | OK | – | – |
| Đánh giá & khảo sát (form builder, đợt) | Có | `api/s/care.ts#upsertSurvey/sendSurvey` | OK | – | – |

---

## Kế hoạch triển khai ưu tiên (25 mục, 4 đợt)

Thứ tự ưu tiên theo **tác động vận hành hằng ngày** (1 = cao nhất). Mỗi đợt gom các mục chạm cùng nhóm file để review / test một lần.

| Hạng | Mục | Đợt | Cỡ |
|---|---|---|---|
| 1 | Chặn chốt khi chưa ghi nhận thanh toán + đơn gắn lead | 1 | M |
| 2 | Tính công theo lịch, quét chỉ sinh cờ + kết luận rà | 4 | M |
| 3 | Điều chỉnh / huỷ từng buổi học (lý do, báo GV/PH, giữ đủ tổng buổi) + sửa lỗi `reschedule` | 3 | M |
| 4 | Sửa / xoá lead, lý do bắt buộc khi nuôi dưỡng / mất, Kanban đổi trạng thái, chặn `enroll` qua API | 1 | S |
| 5 | Trả góp 1–12 đợt + cọc + sửa kế hoạch sau khi tạo | 2 | M |
| 6 | Dòng đơn: nhiều con một đơn, hình thức coach, giảm giá theo dòng | 2 | L |
| 7 | Khử trùng theo SĐT toàn cục, gộp con, đếm nhập lại | 1 | S |
| 8 | Lượt chia đúng quy tắc + sổ chia lead + lịch sử pool | 1 | M |
| 9 | Khoản thu: sửa khoản chờ, điều chỉnh sau xác nhận, gắn ghi danh / chứng từ; trạng thái hiển thị suy từ tiền | 2 | S |
| 10 | Hồ sơ học viên đủ trường | 3 | M |
| 11 | Vòng đời học viên (bảo lưu tất cả lớp, nghỉ hẳn, kích hoạt lại, nhắc hết bảo lưu) | 3 | M |
| 12 | Form chuyển đổi đầy đủ (CCCD/địa chỉ PH, nhiều con, học bổng) + sửa mã HV | 1 | M |
| 13 | Biến động số dư: gỡ gắn, phân bổ theo con, tiền thừa | 2 | L |
| 14 | 10 loại đơn từ + áp khi duyệt + nộp muộn + cơ sở nhận đơn | 4 | L |
| 15 | QR quầy + điểm chấm công + màn hình QR | 4 | M |
| 16 | Chuyển lớp có yêu cầu / duyệt, cùng khoá, tiến độ, danh sách chờ | 3 | M |
| 17 | Chuyển lead có note bàn giao + chia lại lead + phân bổ lead nguội hàng loạt | 1 | S |
| 18 | Huỷ lớp dây chuyền | 3 | M |
| 19 | Hoàn tiền tự đề xuất theo vòng đời | 2 | M |
| 20 | Danh mục mã ca đầy đủ + lưới tháng + khung tuần | 4 | M |
| 21 | Chốt hàng loạt ghi khoản thu lùi ngày | 1 | M |
| 22 | Import lead Excel theo quy tắc gộp | 1 | L |
| 23 | Nhập giao dịch cũ khớp SĐT + họ tên, chờ kế toán, gán sale | 2 | M |
| 24 | Công nợ theo ghi danh + sửa học phí hợp đồng | 2 | M |
| 25 | Hoàn tất buổi: nhận xét từng HS, xác nhận bài, ảnh (cấu hình) · Lịch nhiều giai đoạn + xếp lại cả dãy + bảo vệ buổi có dữ liệu · Vị trí → vai trò | 3/4 | M–L |

Thứ tự thực hiện đề xuất: **Đợt 1 → Đợt 2 → Đợt 3 → Đợt 4** (Đợt 4 có thể chạy song song vì tách biệt file). Mục 2 (công theo lịch) nên kéo lên sớm nếu kỳ lương gần nhất dùng hệ mới.

### Đợt 1 — Tuyển sinh → Chốt → Thu (mục 1, 4, 7, 8, 12, 17, 21, 22)

File chạm: `db/admissions.ts`, `db/finance.ts`, `core/admissions/leadMachine.ts` (+ file mới `core/admissions/intake.ts`), `api/s/leads.ts`, `api/s/admissionsAdmin.ts`, `api/s/finance.ts#createOrder`, `api/r/admissions.ts`, `web/leads/**`, `web/nhap-khach-hang/form.tsx`, `web/quan-ly-chia-lead/board.tsx`, `web/lead-nguoi/page.tsx`, `cmp/lead-kanban.tsx`.

**1. Chặn chốt khi chưa ghi nhận thanh toán + đơn gắn lead** (M)
- Schema: `orders.lead_id uuid null → leads.id` (+ index); `order_items.lead_child_id uuid null`, `order_items.student_id uuid null`, `order_items.enrollment_id uuid null` (dùng chung với mục 6).
- Core (`core/admissions/intake.ts`): `conversionGate(p: { orders: number; total: number; recorded: number; confirmed: number }): string | null` → trả “Chưa đủ điều kiện chốt — cần ghi nhận thanh toán trước” khi `orders = 0` hoặc `recorded + confirmed = 0` và `total > 0`; đơn 0đ (học bổng) cho qua. Có test.
- Service: `leadPaymentSummary(db, leadId)` → `{ orders[], total, recorded, confirmed, outstanding }`; `getLead` trả thêm `payment`. `createOrder(input.leadId?)`: kiểm tra `lead.centerId === input.centerId` (khoá cơ sở theo khách), điền khách từ lead; `orderDraftFromLead(ctx, leadId)` gợi ý dòng theo từng con + khoá quan tâm. `convertLead`: gọi `conversionGate` trước transaction; sau khi tạo ghi danh: `update order_items set student_id, enrollment_id where lead_child_id = child.id`, `orders.parent_id/student_id` khi đơn một con; audit.
- Router: bỏ `"enroll"` khỏi enum `leads.transition`; thêm `finance.orderDraftFromLead`.
- UI: khối “Thanh toán” trên `web/leads/[id]/detail.tsx` (Đã nộp / Tổng / Còn thiếu, link `/orders/new?leadId=`), nút “Ghi danh” disabled + cảnh báo khi gate lỗi; `web/orders/new/form.tsx` đọc `leadId`.

**4. Sửa / xoá lead, lý do bắt buộc, Kanban** (S)
- Core: `LEAD_DROP_EVENTS = ["nurture","lose"] as const`; `leadTransition(from, event, opts?: { reason?: string })` ném `LeadTransitionError` khi event thuộc drop mà lý do <3 hoặc >500. Bổ sung cạnh: `new→consult`, `contacted→await_decision`, `nurturing→await_decision`, `trial_done→nurture`, `lost→contact`.
- Schema: `leads.drop_reason text`, `leads.dropped_at timestamptz` (giữ `lost_reason` để tương thích, ghi cả hai khi `lose`).
- Service: `transitionLead` truyền `reason`; `updateLead(ctx, { leadId, parentName, phone, email, centerId, source, notes, facebookUrl })` (đổi SĐT → chuẩn hoá, `CONFLICT` nếu thuộc lead khác kèm id để gộp); `deleteLead(ctx, { leadId, reason })` (soft, quyền `lead:delete`); `updateLeadChild(ctx, { leadId, childId, ...fields })`.
- Router: `transition.reason: z.string().trim().max(500).optional()` (bắt buộc kiểm ở core); `update`, `delete`, `updateChild`.
- UI: trang `/leads/[id]/edit`; dialog lý do dùng chung cho select trạng thái ở chi tiết và Kanban; nút “Phân công” trên thẻ chưa có sale.

**7. Khử trùng theo SĐT toàn cục + gộp con** (S)
- Schema: `leads.reentry_count int default 0`, `leads.last_reentry_at timestamptz`, `leads.facebook_url text`.
- Core: `mergeIntake(existing, incoming): { patch; childrenToAdd; noteAppend }` — chỉ điền ô trống, con mới so theo tên chuẩn hoá (bỏ dấu, thường), giá trị khác ghi vào ghi chú kèm ngày.
- Service: `createLead` tìm `leads` theo `phone_normalized` **mọi trạng thái** chưa xoá (ưu tiên lead mở, rồi mới nhất); khi trùng: áp `mergeIntake`, thêm `lead_children`, `reentry_count+1`, activity + dòng sổ chia nguồn `duplicate`; **không đổi trạng thái phễu**; trả `{ lead, duplicated: true, childrenAdded }`. `admissions_settings.dedupe_days` đổi nghĩa thành “0 = mãi mãi” (mặc định 0).
- UI: phiếu nhập nhanh ở lại trang, bảng “Đã nhập trong phiên” (`đã tạo` / `trùng số — đã thêm bé vào khách cũ` / `trùng số — không tạo mới`); cột “· nhập lại N lần” ở danh sách.

**8. Lượt chia + sổ chia + lịch sử pool** (M)
- Schema: `lead_distribution_log(id, lead_id, center_id, assigned_to_id, actor_id, source enum('auto','self','manager','import','affiliate','duplicate'), consumed_round bool, rounds_after int, created_at)`; `lead_pool_events(id, center_id, user_id, action enum('enable','disable','adjust','reset','add','remove'), before jsonb, after jsonb, reason text, actor_id, created_at)`.
- Service (`admissionsAdmin.ts`): helper duy nhất `recordAssignment(tx, { leadId, centerId, toUserId, source, mode })` — `consume = source === "auto" && mode === "round_robin"`; chỉ khi `consume` mới `roundsReceived + 1`; luôn ghi log với `rounds_after`. Thay mọi chỗ `+1` hiện tại (`createLead`, `assignLead`, `distributePool`, `transferCenter`). `upsertAssignee`: khi `isAvailable` false→true đặt `roundsReceived = min(roundsReceived)` của người đang nhận cùng cơ sở; ghi `lead_pool_events`. `resetRounds` → về `min`. Mới: `adjustRounds(ctx, { userId, centerId, rounds, reason })`, `distributionLog(ctx, { centerId, from, to, saleId?, source?, consumed? , page })`, `poolHistory(ctx, { centerId, page })`.
- UI: tab “Sổ chia lead” + xuất CSV; ô lượt sửa được kèm lý do; cảnh báo chế độ không tiêu lượt; link “Lịch sử thay đổi pool”.

**12. Form chuyển đổi đầy đủ + mã HV** (M)
- Router `convertInput`: `parent?: { email?, idNumber? (/^\d{9}$|^\d{12}$/), address?, province?, ward? }`, `items: { childId, classId, packageSessions, scholarshipFull?: boolean, scholarshipReason? }[]` (1–10), `mediaConsent`.
- Service: `convertLead` lặp `items` trong một transaction; ghi `parent_private` (mã hoá bằng helper PII hiện dùng cho `national_id_enc`); lọc lớp: `classes.courseId === child.interestedCourseId` và `centerId === lead.centerId` (cảnh báo nếu khác, cần quyền quản lý); học bổng → dòng đơn 0đ lý do bắt buộc (qua gate); mã HV dùng `nextStudentCode` (export từ `api/s/students.ts`).
- UI: trang `/leads/[id]/convert` thay khung “Ghi danh” trong chi tiết.

**17. Chuyển lead / chia lại / lead nguội** (S)
- Service: `transferLead(ctx, { leadId, toCenterId?, toUserId?, handoverNote (≥10), reason? })` (thay `transferCenter`): lỗi “Sale nhận phải khác sale đang phụ trách…”, “Cơ sở và sale đích trùng nguồn…”; activity `handover` (thêm vào enum). `redistributeLead(ctx, { leadId, reason })`. `reassignLeads(ctx, { leadIds ≤200, toUserId, reason })` → trả `{ done, skipped }` (bỏ lead đã chốt).
- UI: panel chuyển lead có select sale theo cơ sở đích + textarea note bắt buộc; nút “Chia lại lead”; checkbox + form phân bổ ở `/lead-nguoi`.

**21. Chốt hàng loạt ghi khoản thu lùi ngày** (M)
- Service: `bulkConvertCandidates` thêm lead `enrolled` còn con chưa chốt (từ import đã đăng ký); `bulkConvert` item `paidAmount>0` → trong cùng transaction: `createOrder` (giá niêm yết theo gói, `leadId`), `payments` `status="recorded"`, `source="backfill"`, `paidAt ≤ hôm nay`; không có số tiền → không tạo đơn (lead vẫn chốt được qua quyền “chốt không tiền” dành cho luồng nhập liệu ban đầu, ghi rõ vào audit — đúng như bản gốc “hệ thống cố ý không bịa khoản thu”).
- Core: `parseNoteTokens(notes) → { paid?: number; dueDate2?: string }` đọc `ĐãĐóng=`, `HạnĐợt2=`.
- UI: gán lớp nhanh (cùng khoá & cơ sở), tick tất cả, đồng ý ảnh tất cả, điền “đã đóng” theo file / theo học phí niêm yết.

**22. Import lead Excel** (L)
- Client đọc `.xlsx` (SheetJS UMD) → JSON ≤5000 dòng, cột cố định; server không nhận file.
- Core: `validateLeadRow(row, refs)`, `groupImport(rows, existingByPhone) → { new[], dup[], error[] }` (trùng trong file: gộp theo SĐT), dùng `mergeIntake(existing, incoming, { overwrite })`: không bao giờ xoá; `overwrite` → giá trị cũ vào ghi chú; ghi chú file nối thêm.
- Service: `previewLeadImport(ctx, { rows })`, `commitLeadImport(ctx, { rows, overwrite: number[], note })` → batch `import_batches(kind="leads")`; cơ sở trống → cơ sở của người nhập; mã CS khác cần quyền toàn hệ thống; cột sale (email / mã NV) → `recordAssignment(source="import")` không tiêu lượt; lead chưa chốt không có sale → chia tự động; giữ trạng thái phễu.
- UI: `/leads/import` 3 nhóm, lọc theo tình trạng, sửa / xoá dòng tại chỗ, cột “Đè” (từng dòng + cả nhóm), nút “Nhập N dòng”; `/leads/import/registered` dùng lại với `status="enrolled"`.

### Đợt 2 — Tài chính hằng ngày (mục 5, 6, 9, 13, 19, 23, 24)

File chạm: `db/finance.ts`, `core/finance/rules.ts`, `core/finance/bank.ts`, `api/s/finance.ts`, `api/s/bank.ts`, `api/s/enrollments.ts` (hook hoàn tiền), `api/r/finance.ts`, `web/orders/**`, `web/payments/page.tsx`, `web/bien-dong-so-du/**`, `web/cong-no/page.tsx`, `web/nhap-giao-dich-cu/**`, `web/thieu-hoc-phi/page.tsx`.

**5. Trả góp 1–12 đợt + cọc + sửa kế hoạch** (M)
- Schema: `order_installments.kind text not null default 'installment' check (kind in ('deposit','installment'))`, `student_id uuid null`, `created_by`, `updated_at`; bỏ unique `(order_id, seq)` → unique `(order_id, seq) where cancelled_at is null` + cột `cancelled_at`.
- Core: `validateInstallmentPlan(total, plan, { maxInstallments = 12 })` (cọc tối đa 1, đứng đầu; ngày tăng dần; tổng khớp); `buildModulePlan(total, modules: 1|2|3|4, firstDue, intervalDays = 30)`; `buildMonthlyPlan(total, n ≤ 12, firstDue)`; `replanInstallments(current: InstallmentState[], next) → errors` — đợt `paid > 0` phải giữ nguyên số tiền ≥ đã thu.
- Service: `replaceInstallmentPlan(ctx, { orderId, plan, reason, expectedUpdatedAt })` (khoá `order:`; huỷ mềm đợt chưa thu, chèn đợt mới; `order_events` “plan_changed”); `createOrder` nếu kế hoạch lỗi vẫn tạo đơn và trả `planError` (như bản gốc).
- Router: `installments.count` max 12, `plan` max 13, `plan[].kind`.
- UI: editor kế hoạch ở `web/orders/[id]` (“Tổng các phiếu phải bằng X — đang lệch Y”, “Đợt n chưa thu — chọn ngày hẹn đóng”), ô “Thu cọc trước”, nút 1 lần / 2 / 3 / 4 học phần / N đợt.

**6. Dòng đơn: nhiều con, coach, giảm theo dòng** (L)
- Schema `order_items`: `student_id`, `lead_child_id`, `enrollment_id`, `class_format text default 'group'`, `format_multiplier numeric(3,2) default 1`, `discount_amount bigint default 0`, `net_amount bigint`; bảng `order_item_discounts(id, order_item_id, kind 'amount'|'percent', value, amount, reason not null, created_by, created_at)`; `courses.fixed_package boolean default false`; cấu hình vận hành `maxLineDiscountPercent` (mặc định 50).
- Core: `COACH_MULTIPLIER = { group: 1, coach_1_1: 2, coach_1_2: 1.8, coach_1_4: 1.5 }`; `priceLine({ unitPrice, quantity, discounts[], maxPercent, fixedPackage, format, sessions, courseSessions }) → { gross, discount, net, errors }` (cộng dồn, không vượt thành tiền, % trong 1..max, gói cố định cấm coach / lẻ); `priceOrder(lines)` = Σ net (giảm cấp đơn giữ cho dữ liệu cũ).
- Service: `createOrder` nhận `items[].{ studentId?, leadChildId?, enrollmentId?, format, discounts[] }`; kiểm tra **mỗi ghi danh chỉ một dòng đơn mở** (thay cho “mỗi ghi danh một đơn”); `refundContext` / `missingTuition` / `debts` lấy giá trị gói từ **dòng** của ghi danh thay vì `orders.enrollmentId`; hoa hồng giữ theo đơn.
- UI: dòng đơn có chọn học viên (gợi ý con của lead “chưa có hồ sơ học viên”), hình thức lớp + “Áp số này vào Đơn giá”, “Thêm khoản giảm”; trang đơn hiển thị “−528.000đ (5%) · lý do” và khối **Công nợ theo con** (Σ net dòng − phân bổ thu theo `payments.order_item_id`, xem mục 13).

**9. Khoản thu + trạng thái hiển thị** (S)
- Schema `payments`: `enrollment_id`, `order_item_id`, `evidence_url`, `version int default 1`; bảng `payment_adjustments(id, payment_id, before_amount, after_amount, reason, actor_id, created_at)`.
- Core: `orderDisplayState({ status, total, confirmed, pending }) → { key: 'zero'|'unpaid'|'paying'|'paid_pending'|'paid_confirmed'|'overpaid'|'cancelled'|'refunded'; pendingNote: boolean; installmentsLabel }` — “đã thu” = confirmed + pending (tiền đã về là đã về); công nợ phụ huynh vẫn theo confirmed.
- Service: `updatePendingPayment(ctx, { paymentId, amount, paidAt, paymentMethodId, note, evidenceUrl, version })` (người ghi hoặc kế toán; chỉ `recorded`); `adjustConfirmedPayment(ctx, { paymentId, newAmount, reason, version })` (kế toán, `finance_ledger` `adjustment` = chênh lệch, cập nhật `amount`, ghi `payment_adjustments`, `recomputeOrderStatus`); `recordPayment` nhận `enrollmentId`, `evidenceUrl`; lỗi `STALE_WRITE` khi `version` lệch.
- UI: badge + tooltip “Trạng thái suy từ tiền đã thu…” ở danh sách / chi tiết đơn; nút Sửa (khoản chờ), Điều chỉnh (khoản đã xác nhận, “Sẽ sinh bút toán +/−X”).

**13. Biến động số dư: gỡ gắn, phân bổ theo con, tiền thừa** (L)
- Schema: `PAYMENT_STATUSES` thêm `voided`; `payments.voided_at`, `void_reason`; bảng `bank_tx_allocations(bank_tx_id, payment_id, amount, primary key(bank_tx_id, payment_id))` thay cho `bank_transactions.payment_id` (giữ cột cũ đọc-chỉ, migrate); `bank_transactions.surplus_amount bigint default 0`.
- Core: `planAllocation(amount, lines: { orderItemId, outstanding }[], requested: {orderItemId, amount}[]) → { allocations, surplus, errors }`.
- Service: `allocateBankTx(ctx, { id, orderId, allocations: { orderItemId, amount }[], note })` — tạo N khoản `confirmed` (source sepay/statement, `order_item_id`), phần dư → `surplus_amount` (không tự hoàn, không tự trừ đơn khác); `createInstallmentForChild(ctx, { orderId, orderItemId, amount, dueDate? })`; `unlinkBankTx(ctx, { id, reason })` — khoản do giao dịch tạo → `voided` + ledger đảo dấu; khoản sale đã ghi được xác nhận qua khớp → trả về `recorded` (huỷ số phiếu, ghi chú); giao dịch → `unmatched`; `recomputeOrderStatus`; điều chỉnh hoa hồng nếu đơn tụt khỏi “đủ tiền”. `surplusList(ctx)` cho khối “Tiền thừa chưa xử lý”.
- UI: `web/bien-dong-so-du/actions.tsx`: bảng “X đ cho từng con” (Khớp đủ / Đang thừa / Còn thiếu), “Ghi phân bổ”, “Tạo đợt tại chỗ”, “Gỡ gắn → Xác nhận gỡ”, khối tiền thừa.

**19. Hoàn tiền tự đề xuất theo vòng đời** (M)
- Service (`finance.ts`): `proposeRefundIfPaid(tx, { enrollmentId, reason, trigger: 'withdraw'|'transfer'|'class_cancel', actorId })` — dùng `refundContext`; `refundable > 0` và chưa có đề xuất mở → chèn `refunds` `pending` (`amount = proposedAmount`), thông báo quản lý. Gọi trong `transitionEnrollment` (withdraw), `transferEnrollment` (chỉ khi khác khoá / chênh học phí — số buổi còn lại đã mang sang thì không hoàn) và huỷ lớp (mục 18). `refundContext` đi theo chuỗi `enrollments.transferred_from_id` để tìm dòng đơn gốc.
- Schema: `refunds.trigger text`, `refunds.auto boolean default false`.
- UI `/hoan-tien`: cột nguồn đề xuất; khối “Tạo đề xuất cho ca chưa có” liệt kê ghi danh đã rút / huỷ còn tiền mà chưa có đề xuất (`refundGaps(ctx)`).

**23. Nhập giao dịch cũ theo SĐT + họ tên** (M)
- Client đọc xlsx (nhiều sheet tháng / cơ sở), chỉ gửi `{ name, phone, amount, paidAt, note, sheet, courseText }`.
- Core `core/finance/bank.ts`: `normalizeName(s)` (bỏ dấu, gộp khoảng trắng), `matchLegacyStudent(row, candidates) → { kind: 'one'|'many'|'none', ids }`.
- Service: `resolveLegacy` khớp theo thứ tự: mã đơn → `legacy_refs(kind='student')` → `parents.phone = normalizeVnPhone(phone)` + `normalizeName(student.fullName)`; trạng thái dòng `will_write | already_paid | needs_choice | not_found`; `already_paid` khi ghi danh đã có khoản (recorded/confirmed) ≥ số tiền dòng (chống cộng đôi) — `forceLines` để vẫn ghi; `importLegacy(ctx, { rows, choices: Record<line, enrollmentId>, saleUserId (bắt buộc), note })` → mỗi em một đơn (sale = `orders.created_by` / `sale_user_id`), mỗi đợt một khoản **`recorded`** giữ ngày đóng, `source="backfill"`; `bulkConfirmBatch(ctx, { batchId })` cho kế toán xác nhận cả lượt (xem thử: sẽ xác nhận / bỏ qua kèm lý do, gắn ghi danh cho khoản thiếu).
- UI: `web/nhap-giao-dich-cu/importer.tsx` bước đối chiếu + chọn tay + gán sale; khối “Học phí nhập từ file” ở `/payments`.

**24. Công nợ theo ghi danh + sửa học phí** (M)
- Core: `enrollmentDebtChip({ hasFee, total, confirmed, recorded }) → 'no_fee'|'paid_pending'|'short'|'zero'|'overpaid'|'paid'`; `agingBucketBy(days, edges = [7, 30])` (cấu hình vận hành `debtAgingEdges`).
- Service: `enrollmentDebts(ctx, { centerId?, chip?, q? })` → mỗi ghi danh: phải đóng (net dòng), đã thu (confirmed + recorded), kế toán xác nhận, **thiếu PH đang thấy** = total − confirmed, **thiếu thật** = total − (confirmed + recorded), chip; KPI tổng nợ theo ghi danh + tuổi nợ theo đợt có hạn. `updateEnrollmentFee(ctx, { enrollmentId, newTotal, reason })` → sửa `net_amount` dòng + `orders.total`, ledger `adjustment`, chặn `newTotal < confirmed`. `backfillTuition` (xem bảng C).
- UI: chip kèm số & tổng tiền, cảnh báo “N em chưa chốt học phí…”, dialog “Sửa học phí hợp đồng”, link “Xác nhận X” → `/payments`.

### Đợt 3 — Học vụ: học viên, lớp, buổi (mục 3, 10, 11, 16, 18, 25a, 25b)

File chạm: `db/people.ts`, `db/academics.ts`, `core/enrollment/lifecycle.ts`, `core/sessions/stateMachine.ts`, `core/scheduling/replan.ts`, `core/classes/lifecycle.ts`, `core/codes.ts`, `api/s/students.ts`, `api/s/enrollments.ts`, `api/s/sessions.ts`, `api/s/classOps.ts`, `api/s/classes.ts`, `api/r/students.ts`, `api/r/academics.ts`, `cmp/student-form.tsx`, `web/students/**`, `web/classes/**`, `web/chuyen-lop/**`, `apps/web/src/app/teacher/sessions/[id]`.

**3. Điều chỉnh / huỷ từng buổi** (M)
- Core: `CANCELLED_SEQUENCE_BASE = 5000`; `planCancelShift({ sessions, cancelledId, rules, holidays, today }) → { archiveSeq, replacement: SlotSnapshot, moves: ReplanChange[] }` — buổi huỷ chuyển sang dải lưu trữ để giữ unique `(class_id, sequence_no)`, các buổi chính thức sau đó (chưa có dữ liệu) dời lên một nhịp theo lịch, buổi cuối được sinh thêm ⇒ **giữ đủ tổng buổi**, bài học đi theo số buổi.
- Service (`sessions.ts` hoặc `classOps.ts`): `adjustSession(ctx, { sessionId, date?, startTime?, endTime?, teacherId?, roomId?, reason (≥5), notifyParents? })` — chỉ `scheduled`, không lùi về quá khứ, kiểm tra trùng (`conflictsWith`), GV đủ điều kiện, giữ id (không mất học thử / học bù), `sessions.rescheduled_from_date`; `cancelSession(ctx, { sessionId, reason (≥5), mode: 'shift' | 'none', notifyParents })` — `status="cancelled"`, áp `planCancelShift` khi `shift`, huỷ / báo học thử, báo GV + PH, `class_events`.
- Router: thêm `sessions.adjust`, `sessions.cancel`; bỏ `cancel` và `reschedule` khỏi `sessions.transition`.
- UI: trong trang lớp, danh sách buổi có “Điều chỉnh” (Ngày · GV · Phòng, mặc định “— Giữ nguyên —”) và “Huỷ” (lý do ≥5, lựa chọn “dời các buổi sau để đủ tổng buổi”).

**10. Hồ sơ học viên đủ trường** (M)
- Schema `students`: `phone`, `email`, `blood_type` enum (`A_POS…UNKNOWN`), `allergies jsonb default '[]'`, `preferred_center_id`, `first_enrolled_on date`; bảng `student_private(student_id pk, address, ward, district, city, updated_by, updated_at)`; `student_guardians.relation` thêm `grandfather`, `grandmother`.
- Service: `createStudent` / `updateStudent` nhận các trường mới + `code?` (nhập tay: regex `^[A-Z0-9.\-]{3,30}$`, unique, quyền `student:update`; trống → `nextStudentCode`); `parentNationalId` → `parent_private` (mã hoá); `first_enrolled_on` tự điền ở `createEnrollment` nếu trống; bỏ `status` khỏi input `update`.
- UI `cmp/student-form.tsx`: nhóm Học viên (SĐT, email, mã, ảnh), Phụ huynh (quan hệ, CCCD, khối PH thứ hai), Địa chỉ, Thông tin Sata Robo (ngày đăng ký đầu, đơn vị mong muốn), Sức khoẻ (nhóm máu, danh sách dị ứng “Thêm mục / Xoá mục”); lọc `grade` ở danh sách.

**11. Vòng đời học viên** (M)
- Schema: `student_pauses(id, student_id, enrollment_ids jsonb, from_date, expected_return date null, ended_at, reason, end_note, created_by, created_at)`; `enrollments.pause_until` cho phép null.
- Core: `validatePause(from, until | null, policy)` — `until` null hợp lệ (nhắc theo `maxPauseMonths`); `studentLifecycle` gồm `reserve`, `endReserve`, `withdraw`, `reactivate` với lý do bắt buộc (trừ `endReserve`).
- Service (`students.ts` / `enrollments.ts`): `reserveStudent(ctx, { studentId, enrollmentId?: string | null, reason, from?, expectedReturn? })` (null = mọi ghi danh đang học), `endStudentReserve(ctx, { studentId, note? })` (resume các ghi danh trong đợt), `withdrawStudent(ctx, { studentId, reason })` (kết thúc đợt bảo lưu, mọi ghi danh mở → withdrawn + `proposeRefundIfPaid`, huỷ học bù đang chờ), `reactivateStudent(ctx, { studentId, reason })`. Job hằng ngày `remindPauseEnding(db)` tạo care task trước `expected_return` 3 ngày / khi quá `maxPauseMonths`.
- UI: khối “Lifecycle học viên” trên hồ sơ (Bảo lưu, Kết thúc bảo lưu, ❌ Nghỉ học hẳn, Kích hoạt) + “Lịch sử bảo lưu”.

**16. Chuyển lớp có duyệt / cùng khoá / tiến độ / waitlist** (M)
- Schema: `class_transfer_requests(id, enrollment_id, from_class_id, to_class_id null, to_center_id null, status enum('pending','approved','rejected','waitlisted','cancelled'), reason, waitlist_rank int, decided_by, decided_at, decision_note, created_by, created_at)`.
- Core `planTransfer`: khác khoá → **lỗi** (trừ khi `waiverReason` của quản lý); `target.lessonsDone > source.consumed + tolerance` → lỗi “vượt tiến độ”; lớp đầy → `waitlist: true` thay vì lỗi; trả `startSequenceNo` gợi ý = buổi chưa học kế tiếp của lớp đích.
- Service: `listEligibleClasses(ctx, { enrollmentId, toCenterId? })` (“x bài · còn N chỗ”); `createTransferRequest(ctx, { enrollmentId, toClassId, reason })` → `pending` hoặc `waitlisted`; `approveTransfer(ctx, { requestId, note? })` → gọi `transferEnrollment` (quyền `class:approve`); `rejectTransfer(ctx, { requestId, reason })`; hook khi lớp có chỗ trống (withdraw / transfer out) → thông báo yêu cầu waitlist đứng đầu. `students.transfer` trực tiếp chỉ cho người có quyền duyệt.
- UI `web/chuyen-lop/wizard.tsx`: 4 bước (cơ sở nguồn → HV → lớp hiện tại → cơ sở đích) + “Tìm lớp đích phù hợp” + bảng “Yêu cầu đang chờ” (Duyệt / Từ chối).

**18. Huỷ lớp dây chuyền** (M)
- Service `classOps.ts`: `previewCancelClass(ctx, classId)` → số ghi danh mở, số buổi tương lai, số học thử, tổng tiền đã thu; `transitionClass` event `cancel` với lớp `recruiting`/`running` (quyền `class:approve`, lý do ≥5): trong một transaction — mọi ghi danh mở → withdrawn (`endReason="Huỷ lớp: …"`) + `proposeRefundIfPaid(trigger='class_cancel')`; buổi `scheduled` có `date ≥ hôm nay` → cancelled; học thử booked → cancelled + báo sale; thông báo GV + PH; `class_events`. Bỏ precondition “còn học viên”.
- UI: nút “Hủy lớp…” trong trang lớp hiển thị bản xem trước, cảnh báo “Không thể hoàn tác”.

**25a. Hoàn tất buổi** (M)
- Schema `sessions`: `lesson_confirmed_at`, `lesson_confirmed_by`; cấu hình vận hành `sessionRequireStudentRemarks` (mặc định bật), `sessionRequireMedia` (mặc định tắt, bật theo cơ sở).
- Core: `completionBlockers({ attendanceComplete, lessonConfirmed, presentWithoutRemark, mediaCount, requireMedia, requireRemarks, checklistMissing }) → string[]` thay guard `hasSessionNote` trong `transition(...)`.
- Service: `getSessionDetail` trả `completionBlockers`; `confirmLesson(ctx, { sessionId, lessonId? })`; `transitionSession` complete dùng `completionBlockers` (đếm `attendance.student_remark` của HS present/late, `session_media` của buổi).
- UI app giáo viên: checklist 9 bước như bản gốc (tự tick “Điểm danh xong”, “Nhận xét từng HS có mặt”), nút “Lưu tiến trình” trước “Hoàn tất buổi”.

**25b. Lịch nhiều giai đoạn + xếp lại cả dãy + mã/tên lớp** (M)
- Core: `ScheduleProposalPhase = { from, to | null, slots: WeeklySlot[], note? }`; `validatePhases(phases, startDate)` (liên tiếp, không chồng, giai đoạn đầu bắt đầu đúng khai giảng, chỉ giai đoạn cuối mở); `ExistingSession.hasContent` và `planReflow` loại buổi `hasContent`; `planReanchor({ sessions, rules, startDate, holidays })` — dời mọi buổi chính thức **chưa có dữ liệu** (kể cả quá khứ đang neo sai) về đúng dãy, không tạo / xoá buổi; `suggestClassName`, `nextClassSeq(codes, center, course, year)`.
- Service: `saveDraftPhases(ctx, { classId, phases, reason? })` (thay `saveDraftSchedule`, ghi `class_schedules.note`); `existingForPlan` tính `hasContent` (session_note, student_remark, assignments, session_media, completed); `reanchorPreview` / `reanchorApply(ctx, { classId, reason })` → kết quả “dời y · giữ z buổi đã có dữ liệu”; `scheduleDriftAll(ctx, { centerId? })` cho trang `/classes/kiem-tra-lich`; `createClass` dùng `nextClassSeq` + cho nhập mã tay.
- UI: editor giai đoạn (từ / đến / chip thứ + giờ từng thứ / ghi chú) cho cả lớp nháp; nút “Xếp lại buổi theo lịch”; trang kiểm tra lịch toàn hệ thống; “Dùng tên gợi ý”.

### Đợt 4 — Chấm công & đơn từ & phân quyền theo vị trí (mục 2, 14, 15, 20, 25c)

File chạm: `db/hr.ts`, `db/org.ts`, `db/identity.ts`, `core/hr/rules.ts`, `core/qr/encode.ts`, `core/policy/policy.ts`, `api/s/hr.ts`, `api/context.ts` (dựng actor), `api/r/hr.ts`, `web/cham-cong/**`, `web/don-tu/**`, `web/nhan-su/**`.

**2. Công theo lịch, quét chỉ sinh cờ** (M)
- Core: viết lại `computeDay` → `DayResult { units, flags: DayFlag[], plannedMin, workedMin, lateMin, earlyMin, … }`. Quy tắc: không có ca → 0 (cờ `off_schedule_punch` nếu có quét); ca loại `location_only` / `flexible` → `units = shift.units` bất kể quét; ca `timed`: có ≥1 lượt quét → `units = shift.units` (muộn / sớm / thiếu giờ / thiếu lượt chỉ là cờ), không lượt nào → 0 + cờ `no_punch` (đúng mô tả “công đang tính 0” ở màn chốt kỳ); ca nghỉ X / P → 0 (+ phép có lương tính riêng); ghi đè luôn thắng. `DayFlag` = `no_punch | missing_out | out_without_in | missing_am | missing_pm | late | early | short_hours | near_time | off_schedule_punch | double_punch | punch_cap | holiday_work | weak_gps | manual_request`.
- Schema: `timesheet_flag_reviews(staff_id, date, flag, conclusion enum('acknowledged','dismissed'), note, reviewed_by, reviewed_at, primary key(staff_id,date,flag))`; `timesheet_overrides.kind enum('units','excused_absence') default 'units'`.
- Service: `buildDays` trả `flags` + `reviews`; `reviewFlag(ctx, { staffId, date, flag, conclusion, note })`; `markExcusedAbsence(ctx, { staffId, date, reason })`; `addManualPunch(ctx, { staffId, date, kind, time, reason })`; KPI ngày (có ca, đã quét, cờ cần rà, đã ghi đè); `lockCheck` thêm “N ngày còn cờ chưa rà” (cảnh báo).
- UI `web/cham-cong`: bộ lọc `loc` (có cờ / chưa quét / đã ghi đè), dải ngày đỏ theo số người có cờ, panel chi tiết (lượt quét + nguồn, ghi đè công + lý do, vắng có lý do, sửa giờ tay, kết luận cờ).

**14. 10 loại đơn + áp khi duyệt** (L)
- Core: `REQUEST_KINDS = ['class_change','sub_teach','class_off','shift_swap','overtime','late_early','timesheet_fix','leave','remote','business_trip']` (map `missing_punch → timesheet_fix` khi migrate); `REQUEST_GROUPS`; `LEAVE_TYPES` 8 giá trị (`annual, unpaid, marriage, child_marriage, funeral, sick_insurance, maternity, compensatory`, cờ có lương); `validateRequest` theo loại (bảng trường riêng như bản gốc: lớp + ngày buổi dạy, người dạy thay, mã ca mới của tôi / người nhận, từ – đến giờ, hình thức muộn/sớm + giờ, giờ vào/ra đề nghị, loại nghỉ + người làm thay, nơi đến); `isLateSubmission(kind, dateFrom, submittedAt, noticeDays)`; bỏ chặn cứng 7 ngày → chặn khi kỳ công đã khoá.
- Schema `staff_requests`: `class_id`, `session_id`, `target_staff_id`, `new_shift_id`, `target_new_shift_id`, `destination`, `receiving_center_id`, `late_submission boolean`, `apply_error text`, `applied_at`; `shift_assignments.origin enum('template','manual','request','import')`, `request_id`.
- Service: `applyApprovedRequest(tx, request)` theo loại — `shift_swap` đổi ô ca của hai người (`origin='request'`); `class_off` → `cancelSession` (Đợt 3 mục 3); `sub_teach` / `class_change` → `adjustSession` đổi GV (kiểm tra trùng, GV đủ điều kiện); `leave` → ô ca = mã P (hoặc X theo loại); `remote` / `business_trip` → ô ca mã LD / NG; `timesheet_fix` → lượt quét `source='request'` (như hiện tại). `decideRequest` approve chạy áp trong **savepoint**: lỗi → đơn giữ `pending`, lưu `apply_error`, thông báo người duyệt (không bao giờ “đã duyệt” mà lịch chưa đổi). `createRequest`: `receiving_center_id` = cơ sở của ô ca ngày đó, người HO tự chọn (bắt buộc), còn lại cơ sở nhà; cờ `late_submission`.
- UI: form “Tạo đơn mới” theo nhóm (Liên quan lớp học chỉ hiện khi là GV có lớp); `/don-tu` KPI Chờ duyệt / Nộp muộn / Chờ > 2 ngày / Áp thất bại, cột “Thay đổi” xem trước (`S → CG`, giờ quét).

**15. QR quầy + điểm chấm công + màn hình QR** (M)
- Schema: `checkin_points(id, center_id, name, lat, lng, radius_m default 100, geofence_enabled bool default true, key_version int default 1, is_active, created_at)`.
- Core: dùng `core/qr/encode.ts` — `checkinQrPayload(pointId, keyVersion)` ký HMAC (secret môi trường), `verifyCheckinQr(token) → { pointId, keyVersion } | null`.
- Service: `punch(ctx, { qrToken, kind, lat, lng, accuracy })` — bắt buộc `qrToken` hợp lệ và đúng `key_version`; geofence theo điểm; lượt không có token bị từ chối (“Mở từ menu thì không chấm được — phải quét mã”); `rotateCheckinKey(ctx, { pointId, reason })`; `todayPunches(ctx, { centerId })`.
- UI: `/cham-cong/checkin?t=` (trang mở từ camera), `/cham-cong/man-hinh` (chọn cơ sở → trình chiếu toàn màn hình, không menu, giữ mã cuối khi rớt mạng; khối điểm chấm công + lượt chấm hôm nay), `/cham-cong/diem-cham` quản lý điểm.

**20. Danh mục mã ca + lưới tháng + khung tuần** (M)
- Schema `work_shifts`: `kind enum('timed','location_only','flexible','off','leave')`, `units numeric(2,1) default 1`, `segments jsonb` (`[{ start, end, paidBreak? }]`, giữ `start_time/end_time` làm bao ngoài), `planned_minutes int`, `workplace enum('home_center','center','assigned','any','flexible','offsite')`, `workplace_center_id`, `punch_required bool`; bảng `weekly_templates(staff_id, weekday, shift_id, center_id, effective_from, effective_to)`, `roster_name_maps(center_id, sheet_name, staff_id)`, `roster_imports(id, center_id, period, actor_id, created_cells, cancelled_cells, kept_manual, template_cells, created_at)`.
- Core: `validateShift` cho nhiều đoạn (không chồng, đoạn nghỉ có/không tính công, `planned_minutes` tự tính); seed danh mục mã ca bản gốc (CG, CS, CCT, CGD, D1/D2, HC, 12/21, 2C, S/C/T 0,5 công, SC/ST, CT, SCT 1,5 công, LD, LDGV, NG, X, P).
- Service: `rosterMonth(ctx, { centerId, period })` (tóm tắt ô đã xếp / sửa tay / từ đơn, cột Công đếm trừ X,P; cột Nghỉ đếm X,P; ca chịu công ở khối khác chỉ đọc); `generateFromTemplate(ctx, { centerId, period })` và `importRosterSheet(ctx, { centerId, period, tabs, nameMap })` đều **bỏ qua ô `origin in ('manual','request')`**, idempotent (chỉ ghi phần khác), bỏ qua hàng thuộc cơ sở không có quyền; `assignShifts` đặt `origin='manual'` + lý do + thông báo ngay.
- UI: `/cham-cong/phan-ca` lưới tháng (ký hiệu T / Đ / N), “Sinh lưới từ khung”, `/cham-cong/phan-ca/import` wizard 3 bước; `/cham-cong/danh-muc-ca` bảng mã ca (tab Đang dùng / Đã ngưng).

**25c. Vị trí → bộ vai trò, hết hạn tự tắt, điều động** (L)
- Schema: `positions(id, name, center_id null, reports_to_position_id null, is_manager bool, roles jsonb Role[], is_active)`; `staff_positions.position_id uuid null` (giữ `title` làm nhãn); `user_roles` thêm `source enum('manual','position')`, `valid_from date`, `valid_to date null`, `staff_position_id uuid null`; `staff_deployments(id, staff_id, center_id, from_date, to_date, reason, note, created_by)`.
- Service: `upsertPosition(ctx, …)`; `addPosition` nhận `positionId` và **sinh** `user_roles(source='position')` theo `roles` của vị trí với hiệu lực của phân công; `endPosition` / nghỉ việc đóng `valid_to`; `addDeployment` / `endDeployment`.
- Phân quyền: nơi dựng `Actor` (`api/context.ts`) chỉ lấy `user_roles` có `valid_from ≤ hôm nay ≤ valid_to` ⇒ hết hạn là mất quyền ở lần truy cập kế tiếp; `visibleCenterIds` cộng thêm cơ sở của `staff_deployments` đang hiệu lực (chỉ mở phạm vi dữ liệu, không thêm vai). Cây “báo cáo cho” chỉ dùng cho luồng duyệt (người duyệt đơn / hoàn tiền mặc định = vị trí quản lý cấp trên).
- UI `/nhan-su/vi-tri`: thêm vị trí (đơn vị trực thuộc, báo cáo cho, là quản lý, chip bộ vai trò), phân công người (Chính / Kiêm nhiệm / Uỷ quyền, hiệu lực, ghi chú số quyết định), bảng “Đang hiệu lực” + “Xem cả lịch sử”, khối “Điều động tác nghiệp”.

### Ghi chú kiểm thử cho từng đợt
- Mọi quy tắc mới đặt trong `packages/core` kèm test (`*.test.ts` cạnh file): `conversionGate`, `mergeIntake`, `recordAssignment` (tiêu lượt), `validateInstallmentPlan` 12 đợt + cọc, `priceLine`, `orderDisplayState`, `planAllocation`, `planCancelShift`, `planReanchor`, `validatePhases`, `planTransfer` (tiến độ / waitlist), `computeDay` (công theo lịch), `validateRequest` 10 loại, `isLateSubmission`, `verifyCheckinQr`.
- Migration dữ liệu: `orders.enrollment_id/student_id` → `order_items.enrollment_id/student_id`; `bank_transactions.payment_id` → `bank_tx_allocations`; `staff_requests.kind='missing_punch'` → `timesheet_fix`; `work_shifts` cũ → `kind='timed'`, `units=1`, một đoạn; `user_roles` cũ → `source='manual'`, `valid_from = created_at`.
