# Nghiệp vụ gốc — khảo sát admin.satarobo.vn (bản đang chạy)

> Khảo sát **chỉ đọc** ngày 17/09/2026 trên production `https://admin.satarobo.vn` (Next.js App Router, server actions).
> Mục tiêu: mô tả chức năng đủ chi tiết để bản viết lại khớp hành vi. Dữ liệu cá nhân đã được thay bằng placeholder (`<tên HV>`, `<SĐT>`, `<danh sách sale>`…).
> Ký hiệu: **REQ** = bắt buộc; `ACTION` = tên server action thấy trong bundle JS (gợi ý tên use-case backend); `:id` = cuid.
> Cơ sở hiện có: `CS1 - 211 Nguyễn Hữu Thọ` (slug `co-so-nguyen-huu-tho`, mã `CS1`), `CS2 - 114 Hoàng Diệu` (`co-so-hoang-dieu`, `CS2`), `Hội sở` (`hoi-so`, mã `HO`). Khu vực: `Khối Đà Nẵng`, `Chưa gắn khu vực`.
> Khoá học (khoá quan tâm): `Combo — Full Lộ Trình Luyện Thi`, `Sata1 — Robosim Master`, `Sata2 — Đấu trường Robot`, `Sata3 — Ươm Mầm Tài Năng`, `Sata4 — Bứt Phá Giới Hạn`, `Sata5 — Khơi Nguồn Sáng Tạo`, `Sata6 — Chinh Phục Đấu Trường`, `Sata7 — Kiến Tạo Tương Lai`, `Sata8 — Vé Vàng Chung Kết`. Nhóm khoá trong dropdown con: `Khoá luyện thi RoboSim`, `Khoá lập trình Robot`, `Khác`.

---

## A. CRM & Lead

### Enum dùng chung — trạng thái lead (`LeadStatus`, thứ tự = cột Kanban)

| Mã | Nhãn | Màu badge |
|---|---|---|
| `MOI` | Mới | sky |
| `DA_LIEN_HE` | Đã liên hệ | blue |
| `DANG_TU_VAN` | Đang tư vấn | indigo |
| `DA_HEN_HOC_THU` | Đã hẹn học thử | violet |
| `DANG_HOC_THU` | Đang học thử | violet-đậm |
| `DA_HOC_THU` | Đã học thử | purple |
| `CHO_QUYET_DINH` | Chờ quyết định | orange |
| `DA_DANG_KY` | Đã đăng ký | emerald |
| `DANG_NUOI_DUONG` | Đang nuôi dưỡng | yellow |
| `DA_MAT` | Đã mất | red |

- `LEAD_DROP_STATUSES = [DANG_NUOI_DUONG, DA_MAT]`: chuyển sang 2 trạng thái này **bắt buộc nhập lý do** (dialog “Chuyển sang "<trạng thái>"”, mô tả: *Lead rời phễu ở bước này. Ghi lý do để báo cáo biết vì sao mất, không chỉ biết mất ở bậc nào.*; textarea “Lý do *”, 3–500 ký tự, placeholder “VD: học phí cao hơn dự tính, đã chọn trung tâm khác, chưa sắp được lịch…”). Các trạng thái khác đổi ngay (`updateLeadStatus(leadId, status, reason?)`), toast “Đã đổi trạng thái”.
- Quyền `canChangeStatus`: không có quyền thì chỉ hiện badge.
- Loại hoạt động lead (`LeadActivityType`): `CALL` Gọi điện, `MESSAGE` Nhắn tin, `NOTE` Ghi chú, `EMAIL` Email, `STATUS_CHANGE` Đổi trạng thái, `HANDOVER` Bàn giao. Nền tảng nhắn tin: `SMS`, `Zalo`, `Messenger`.
- Trạng thái học thử của con (`trialStatus`): `NONE` Chưa học thử, `SCHEDULED` Đã hẹn học thử, `IN_PROGRESS` Đang học thử, `ATTENDED` Đã học thử.
- Nguồn phân lead (sổ chia): `AUTO` Máy chia, `SELF` Sale tự nhập, `MANAGER` Quản lý giao, `IMPORT` Nhập Excel, `AFFILIATE` Mã giới thiệu, `DUPLICATE` Nhập lại (trùng).
- Chế độ chia lead theo cơ sở: `ROUND_ROBIN` Luân phiên đều lượt, `CLOSE_RATE` Theo tỷ lệ chốt, `MANUAL` Quản lý giao tay.

### /crm — CRM Dashboard
- Mục đích: “Phễu chuyển đổi lead & hiệu suất đội sale.” Link “Mở Kanban Leads →” (`/leads?view=kanban`).
- KPI: Lead tháng này · Đang xử lý · Chốt tháng này · Tỉ lệ chuyển đổi (%).
- Khối “Phễu chuyển đổi”: Lead mới → Đã liên hệ → Học thử → Chờ quyết định → Đã chốt, mỗi bậc có số lượng + % so với bậc trước.
- Khối “Lead theo nguồn” (biểu đồ), “Hiệu suất đội sale” (bảng: Nhân viên | Lead được giao | Đã chốt | Tỉ lệ chốt), “Chi tiết theo trạng thái” (đếm theo từng `LeadStatus`).

### /leads — Danh sách Lead (Bảng / Kanban)
- Header: “Tổng N lead”; nút/đường dẫn: `Bảng` (`?view=table`), `Kanban` (`?view=kanban`), `Tải file mẫu` (`/api/admin/templates/leads`), `Import Excel` (`/leads/import`), `Chốt hàng loạt` (`/leads/bulk-convert`), `+ Thêm lead` (→ `/nhap-khach-hang`), `Làm mới` (“Nạp lại danh sách để thấy lead mới, không cần F5”).
- Tab nhanh: `Tất cả`, `Đã đăng ký <n>` (`status=DA_DANG_KY`).
- Bộ lọc (GET form, nút `Lọc`, `Xoá lọc`): `q` Tìm (Tên / SĐT / tên con) · `centerId` Cơ sở (Tất cả + cơ sở) · `assignedToId` Sale (Tất cả + `<danh sách sale>`) · `source` Nguồn (text, vd: sata1, sale-form, quatang) · `dateFrom`/`dateTo` (ngày nhận lead) · `status` (select “Tất cả trạng thái” + 10 trạng thái, đặt cạnh nút Xuất Excel) · `view` (hidden) · `sort` (vd `moi_nhat`) · `page`.
- Xuất Excel: `/api/admin/leads/export` (theo bộ lọc).
- **Bảng** — cột: Phụ huynh / học sinh (tên PH + “Con: <tên con> · N tuổi”) | Số điện thoại | Khóa quan tâm | Trạng thái | Cơ sở | Sale phụ trách | Ngày nhận lead (sort được; tooltip “Nhận lần đầu: …”, badge “· nhập lại N lần” khi lead bị nhập trùng) | Hành động.
  - Dòng hiển thị thêm nguồn dưới tên khoá (vd “Quản Lý Trung Tâm”, “legacy-sheet”, “quatang”).
  - Hành động dòng: `Xoá` (2 bước: bấm → “Xác nhận?” → `deleteLead`), title “Xoá <tên PH>”. Click tên → `/leads/:id`.
  - `Cột hiển thị`: popover bật/tắt & sắp thứ tự cột (Ẩn cột / Hiện cột / Đưa cột lên trước / xuống sau) — lưu phía client.
  - Phân trang: “Hiển thị” 10/20/50/100; điều hướng Trang đầu/Trang trước/…
- **Kanban** — “Tổng N lead (hiển thị 500 mới nhất)”; 10 cột theo `LeadStatus`, mỗi cột có số đếm; “Mỗi cột” 5/10/20/50/100 thẻ (còn thẻ thì báo “…thẻ nữa — tăng … ở dưới để xem thêm”).
  - Thẻ: tên PH, SĐT (tel:), “Nguồn: …”, “Sale: …” (hoặc “Chưa phân công”), ngày nhận (dd-MM), link “Xem chi tiết lead”, select đổi trạng thái (áp quy tắc lý do rời phễu), nút `Phân công` cho lead chưa có sale (`autoAssignLeadAction`, round-robin; toast “Đã phân công lead (round-robin)” / “Không phân công được”).

### /leads/:id — Chi tiết lead
Header: tên PH, SĐT, **select trạng thái** (LeadStatusSelect), nút `Sửa` (→ `/leads/:id/edit`), select **“Gán cho…”** (gán tay cho sale cùng cơ sở — `assignLeadToSaleAction`, toast “Đã gán lead”), nút `Chuyển lead`, nút `Chia lại lead` (`chiaLaiLeadAction` — chia lại theo cấu hình cơ sở, toast “Đã chia lại lead theo cấu hình cơ sở”), công tắc **“Dùng chung cho CSKH cùng cơ sở”** (`toggleLeadShareAction`; khi bật: “Đang dùng chung từ <ngày>”, toast “Đã bật dùng chung — CSKH cùng cơ sở xem được lead này”).

Sections:
1. **Thông tin khách hàng**: Tên con · Tuổi · Khoá quan tâm · Cơ sở · Nguồn · Sale phụ trách · Ngày nhận lead · Lần nhập gần nhất · Ghi chú · Nhân viên nhập (tên · mã NV dạng `CS2.NV.002`).
2. **Con của phụ huynh (N)** — nút `Thêm con`; dòng “Thông tin con (cũ): <tên>” + nút `Đưa vào danh sách con` (chuyển trường tên con legacy trên lead thành bản ghi con). Mỗi con: tên, badge trạng thái học thử, khoá · cơ sở, “Đã học thử (dd/m/yyyy) · x/y buổi · <lớp trial>”, nút `Sửa`, `Xoá` (`addLeadChild`/`updateLeadChild`/`deleteLeadChild`).
   - Form con: Họ tên con * · Ngày sinh (date) · Tuổi (number 3–18) · Giới tính (Nam/Nữ/Khác) · Trường (`schoolName`) · Lớp/khối (`gradeLevel`) · Khoá quan tâm (nhóm theo loại khoá) · Cơ sở quan tâm · Ghi chú. Lỗi: “Nhập họ tên con”. Toast “Đã thêm con”/“Đã lưu thông tin con”.
3. **Xếp con vào lớp trải nghiệm** — mỗi con một select lớp trial đang mở cùng cơ sở (hiển thị “<tên lớp> (sĩ số)”), nút `Xếp vào lớp` / `Sửa lớp` (`enrollLeadChildLopTrialAction{trialClassId, leadChildId, allowOverride}`). Mô tả hiện tại: “<con> đang học thử lớp X · học toàn bộ buổi của lớp” hoặc “xếp riêng Buổi n · ngày giờ”. Nếu lớp đầy và user có quyền vượt sĩ số → confirm “…Bạn có quyền vượt sĩ số — vẫn xếp?”. Không có lớp: “Chưa có lớp trải nghiệm đang mở (cùng cơ sở). Tạo lớp ở mục "Lớp Trial"”. Lỗi “Chọn lớp trải nghiệm trước”.
4. **Thanh toán** — Đã nộp · Tổng phải thu · Còn thiếu; nếu chưa có đơn: “Chưa có đơn hàng”; cảnh báo **“Chưa đủ điều kiện chốt — cần ghi nhận thanh toán trước”**; link `+ Tạo đơn hàng cho lead này` (`/orders/new?leadId=:id`), link `Chuyển đổi` (`/leads/:id/convert`).
5. **Ghi nhanh hoạt động** — tab `Gọi điện` (Người gọi · Thời lượng (phút, ≥0) · Nội dung trao đổi) / `Nhắn tin` (Nền tảng: SMS/Zalo/Messenger · Nội dung tin nhắn) / `Ghi chú` (Ghi chú…) / `Email` (Người nhận (email) · Tiêu đề · Nội dung email); nút `Ghi hoạt động` (`addLeadActivity`; lỗi “Nhập nội dung hoạt động”). Metadata lưu: caller, durationMin, notes, platform, to, subject.
6. **Lịch sử tương tác của Lead (N)** — timeline: loại · người · thời gian (HH:mm dd-MM) · nội dung (vd “Đã học thử → Chờ quyết định”; ghi chú hệ thống “Gán theo mã nhân viên trên phiếu (CS2.NV.002).”).

**Chuyển lead (panel inline — `transferLead`)**: Cơ sở đích (— Giữ nguyên / chưa rõ — | Hội sở | CS1 | CS2) · Sale nhận (— Chọn sale —, lọc theo cơ sở đích) · **Note bàn giao — đã tư vấn gì cho KH \*** (textarea, bắt buộc; placeholder “Tóm tắt nội dung đã tư vấn để sale mới không hỏi lại…”) · Lý do chuyển (tuỳ chọn). Nút `Chuyển lead`/`Huỷ`.
Validation: “Bắt buộc ghi đã tư vấn gì cho khách”; “Sale nhận phải khác sale đang phụ trách — không thể bàn giao cho chính mình.”; “Cơ sở và sale đích trùng nguồn — chọn cơ sở khác hoặc sale khác để bàn giao.” Ghi activity `HANDOVER`; chuyển liên cơ sở xuất hiện ở `/leads/bao-cao-chuyen`.

### /leads/:id/edit — Sửa thông tin lead
Trường: Tên phụ huynh * · SĐT * (placeholder 09xxxxxxxx) · Email · Tên con · Tuổi con (3–18) · Đơn vị (`Chưa xác định (tự chia đều theo cơ sở)` | CS1 | CS2) · Khoá quan tâm (**disabled** — “Lấy theo khoá quan tâm của con — sửa ở khối "Con của phụ huynh" bên dưới.”) · Nguồn (placeholder “Sự kiện, walk-in…”) · Ghi chú. Nút `Lưu thay đổi`. Bên dưới lặp khối “Con của phụ huynh”.

### /leads/:id/convert — Chuyển đổi lead → học viên
- Header “<PH> · <SĐT> · Trạng thái: …”; khối Thanh toán (như trên, chặn chốt khi chưa ghi nhận thanh toán).
- **Phụ huynh**: Họ tên * · Email (không bắt buộc; “Bỏ trống nếu phụ huynh không dùng email”) · SĐT * (tài khoản đăng nhập) · CCCD / CMND (9 hoặc 12 chữ số) · Địa chỉ · Tỉnh / Thành · Phường / Xã.
- **Học viên 1 (từ lead)** (lặp theo con; nút `Thêm học viên`): Tên học viên * · Ngày sinh · Lớp đăng ký * (chỉ lớp đúng khoá quan tâm & cơ sở; nhãn `<mã lớp> · <tên lớp> · <khoá> (<học phí>đ)`) · checkbox “Miễn phí học bổng toàn phần — học phí của em này về 0đ. Giá lớp X đ.”
- Checkbox đồng ý: “Phụ huynh đồng ý cho trung tâm sử dụng hình ảnh/video của học viên trong lớp cho mục đích lưu trữ & truyền thông (NĐ 13/2023). Người tick & thời điểm sẽ được ghi nhật ký.”
- Nút `Xác nhận chuyển đổi` / `Hủy`. Kết quả: tạo học viên + tài khoản PH (đăng nhập bằng SĐT) + ghi danh lớp; lead → `DA_DANG_KY`.
- Mã lớp dạng `CS2.SATA3.26.004`, tên lớp dạng `sata3.14h-CN.CS2-P302` (khoá.giờ-thứ.cơsở-phòng).

### /nhap-khach-hang — Nhập khách hàng (phiếu nhanh cho sale)
- Mô tả: “Nhập nhanh khách thu được từ quảng cáo, sự kiện, hoặc tư vấn trực tiếp. Hệ thống tự kiểm tra trùng số điện thoại và tự giao cho tư vấn viên theo cơ sở.”
- Trường (**không ô nào bắt buộc** — “điền được tới đâu lưu tới đó. Mã nhân viên hệ thống tự lấy từ tài khoản bạn đang đăng nhập.”): Tên phụ huynh · SĐT phụ huynh · Con của phụ huynh: lặp “Tên bé thứ n” + “Khoá quan tâm của bé thứ n” (`+ Thêm con`, `Bỏ bé thứ n`) · Nguồn (combobox gợi ý hoặc tự gõ) · Link Facebook (facebook.com/… hoặc m.me/…) · Cơ sở phụ huynh chọn (— Để hệ thống tự chia — | CS1 | CS2) · Ghi chú.
- Nút `Lưu và nhập phiếu tiếp` (`createInternalLeadAction`). Kết quả mỗi phiếu hiển thị ở “Đã nhập trong phiên này”: `đã tạo` / `trùng số — đã thêm bé vào khách cũ` / `trùng số — không tạo mới` (“Số này đã có trong hệ thống — không tạo khách mới.”).

### /leads/import — Nhập lead từ Excel
- Quy tắc (trang hướng dẫn):
  - SĐT là căn cứ **duy nhất** để phát hiện trùng; mọi cách ghi (có khoảng trắng, +84, thiếu số 0 đầu) chuẩn hoá về một số. SĐT bắt buộc & hợp lệ (09xx / +84).
  - File .xlsx/.xls ≤ 10MB, ≤ 5000 dòng (“File quá lớn (N dòng). Tối đa 5000.”).
  - **Cột cố định**: Tên phụ huynh | SĐT | Email | Tên con | Tuổi con | Cơ sở (mã CS, để trống) | Khoá quan tâm | Nguồn | Ghi chú | Sale phụ trách (email hoặc mã NV, để trống).
  - Chia file thành **3 nhóm** trước khi ghi: `Mới` (“sẽ được ghi vào hệ thống”), `Trùng`, `Lỗi` (“sẽ KHÔNG được ghi. Bấm Sửa để chữa ngay tại đây”). Có lọc dòng theo tình trạng, sửa/xoá dòng ngay trên trang; trùng trong nội bộ file: “Trùng <SĐT> với dòng n trong file — hai dòng sẽ gộp làm một khi nhập”.
  - Trùng SĐT với CRM: mặc định **không ghi đè** — chỉ điền ô đang trống; con mới được thêm vào lead cũ; giá trị khác nhau được ghi vào ghi chú kèm ngày. Tick cột **Đè** (từng dòng hoặc cả nhóm ở header) để lấy dữ liệu file thay dữ liệu cũ; giá trị cũ ghi vào ghi chú. Ô trống trong file **không bao giờ xoá** dữ liệu. Ghi chú file được nối thêm.
  - Trạng thái phễu giữ nguyên. Lead chưa chốt được chia lại cho tư vấn viên mới; lead đã chốt/đã ghi danh giữ người phụ trách.
  - Cơ sở: quản lý cơ sở để trống → về cơ sở của mình; điền mã (CS1) khi nhập hộ cơ sở khác — cần quyền HO/Super Admin.
  - Khoá quan tâm theo danh sách trong file mẫu; Tuổi con số nguyên 3–18 hoặc trống.
  - Nút cuối: `Nhập N dòng`.

### /leads/import/registered — Import danh sách ĐÃ ĐĂNG KÝ
- File Excel gốc của Sale (nhiều sheet theo tháng), .xlsx/.xls ≤ 15MB.
- Mỗi SĐT = 1 lead trạng thái **Đã đăng ký**; mỗi dòng học viên = 1 con. Trùng SĐT (trong file hoặc với CRM) → gộp: giữ record cũ, bổ sung field trống, thêm ghi chú. **Bắt buộc xem thử trước khi ghi**: nút `Xem thử (không ghi)` → `Xác nhận ghi vào hệ thống`. Ghi chú con lưu các token như `ĐãĐóng=<số>`, `HạnĐợt2=<yyyy-mm-dd>` (được màn Chốt hàng loạt đọc lại).

### /leads/bulk-convert — Chốt hàng loạt (lead đã đăng ký)
- Hướng dẫn: mỗi lead được chốt tạo **học viên + tài khoản phụ huynh** (đăng nhập bằng SĐT, chờ kích hoạt tại `/kich-hoat`) + **ghi danh** vào lớp đã chọn. Nhập “Đã đóng” nếu khách đã nộp học phí trước — hệ thống ghi nhận khoản thu **lùi ngày** để công nợ đúng; bỏ trống nếu chưa rõ.
- Lọc: Cơ sở · Tìm (tên PH / SĐT / tên HV) · checkbox “Ẩn lead đã chốt xong” (mặc định bật).
- Công cụ hàng loạt: “Gán lớp nhanh (HV chưa gán, cùng khoá & cơ sở)” select lớp + `Áp dụng`; `Tick tất cả đang hiển thị`; `Bỏ tick`; `Đồng ý ảnh: tick tất cả`; `Điền "đã đóng" theo file Excel (lead đã tick)` (đọc token `ĐãĐóng=`); `Điền "đã đóng" = học phí niêm yết (lead đã tick)`; nút chính `Chốt N lead` (`bulkConvertLeadsAction`).
- Bảng: ☐ | Phụ huynh (tên, SĐT · cơ sở, “Đăng ký: yyyy-mm-dd”) | Học viên | Lớp (select lớp cùng khoá & cơ sở, kèm học phí) | Ảnh: đồng ý (checkbox) | Đã đóng (đ) · ngày (số tiền, placeholder “Bỏ trống nếu chưa rõ”; ngày ≤ hôm nay, mặc định hôm nay) | Kết quả (“· Đã chốt: …”).
- Rỗng: “Chưa có lead "Đã đăng ký" nào — import file Excel ở màn Import khách đã đăng ký trước.” Link `Tài khoản phụ huynh` (`/students/tai-khoan`).

### /quan-ly-chia-lead — Quản lý chia lead (tab `pool` mặc định, `so-chia`)
- Mô tả: “Ai đang nhận lead tự động, và vòng chia đã chia cho ai.” Chọn Khu vực → Cơ sở (`?co_so=<slug>`).
- Quy tắc (hướng dẫn): Tắt một người → thôi nhận lead mới, lead đang giữ nguyên, **bộ đếm lượt đóng băng** (không xoá). Bật lại → lượt được đặt về **mức thấp nhất** của những người đang nhận (không bị dồn lead bù).
- **Tab Cấu hình pool**: select **Chế độ chia** (`setCenterAssignModeAction`): Luân phiên đều lượt (“Chia theo sổ lượt — ai ít lượt nhất nhận trước.”) / Theo tỷ lệ chốt / Quản lý giao tay; cảnh báo cho chế độ không tiêu lượt: “⚠️ Chế độ này KHÔNG tiêu lượt của sổ — cột Lượt đã nhận bên dưới sẽ đứng yên trong khi lead vẫn được chia.”
  - Bảng: Sale (tên + email) | Nhận lead (toggle `Đang nhận`/`Tạm nghỉ` — `batNhanLeadAction`/`tatNhanLeadAction`; bật lại: “Lượt sẽ được đặt lại về X để không nhận dồn lead.”) | Lượt đã nhận (chỉnh tay — `chinhLuotAction`, có lý do) | Tổng lead đang giữ | Lần chia gần nhất (“Chưa từng được chia”) | Ghi chú | (thao tác). Thêm sale vào pool: `themSaleVaoPoolAction`.
  - Nút `Đặt lại lượt toàn cơ sở` (`datLaiLuotAction`): “Mọi người đang nhận lead sẽ về mức X — mức THẤP NHẤT hiện tại, không phải 0. Số lead mỗi người đã nhận vẫn giữ nguyên.”
  - Chú thích: “Lượt đã nhận chỉ đếm lead do hệ thống chia tự động. Lead do quản lý giao tay, lead sale tự nhập và lead import từ Excel có sẵn tên sale thì không tiêu lượt…”.
  - Link `Lịch sử thay đổi pool`.
- **Tab Sổ chia lead**: lọc GET `tu`/`den` (mặc định 30 ngày) · `sale` · `nguon` (AUTO/SELF/MANAGER/IMPORT/AFFILIATE/DUPLICATE) · `tieu_luot` (co/khong). Bảng: Thời gian | Lead | SĐT | Cơ sở | Người nhập | Chia cho | Nguồn | Tiêu lượt | Lượt sau khi chia. Xuất Excel `/api/admin/crm/so-chia-lead-export`. Phân trang ← Trước / Sau →.

### /quan-ly-chia-lead/lich-su — Lịch sử thay đổi pool
“Ai bật/tắt ai, chỉnh lượt bao nhiêu, vì sao — mới nhất trước.” Bảng: Thời gian | Người bị tác động | Thao tác (vd “Chỉnh lượt thủ công”, bật/tắt nhận lead, đặt lại lượt) | Trước (“lượt 23 · khởi điểm 0”) | Sau | Lý do | Người thực hiện. Phân trang “Dòng 1–10 / N”.

### /ban-giao-lead — Bàn giao lead (hàng loạt)
- “Chuyển hàng loạt lead của một sale (vd khi nghỉ việc) sang sale khác. Có thể lọc theo trạng thái, chiến dịch, chỉ lead chưa đóng. **Task đang mở cũng được chuyển.** Ghi lịch sử + nhật ký kiểm toán; KHÔNG sửa tài khoản sale cũ.”
- Form: Sale bàn giao (nguồn) · Sale nhận (đích) · Lọc trạng thái (chip nhiều lựa chọn, 9 trạng thái trừ Đã mất; trống = tất cả) · Chiến dịch (`utmCampaign`, — Mọi chiến dịch —) · ☑ Chỉ lead chưa đóng (bỏ “Đã mất”) · Lý do bàn giao (placeholder “VD: Sale Nguyễn Văn A nghỉ việc 06/2026”). Nút `Xem trước số lead` → `Thực hiện bàn giao`.

### /lead-nguoi — Lead lâu ngày chưa chăm
- Lọc: “Không ai chăm từ (ngày)” (number 7–730, mặc định 90) · Cơ sở (Tất cả cơ sở trong tầm nhìn | CS1 | CS2 | HO) · `Lọc lại`. “Tìm thấy N lead”; nếu quá nhiều: “…dòng chưa được xếp hạng… Lọc theo cơ sở hoặc nâng số ngày để thu hẹp lại.”
- Bảng: ☐ (chọn hết trang) | Phụ huynh | Số điện thoại | Trạng thái | Đang giữ | Im bao lâu (“123 ngày (~4 tháng)”). Phân trang 10/20/50/100.
- Bulk: chọn dòng → “Chọn tư vấn viên nhận” · “Lý do phân bổ lại” → `Phân bổ N lead` (`phanBoLeadNguoiAction`), kết quả “Đã phân bổ X lead · bỏ qua Y”.

### /leads/bao-cao-chuyen — Chuyển lead liên cơ sở
- Báo cáo theo tháng (`?month=YYYY-MM`, nút ← →), phạm vi “Toàn hệ thống”. KPI: Tổng chuyển; theo cặp “CS2 → CS1”; “x/y Đã chốt”.
- Bảng: Lead (tên + SĐT, link) | Chuyển (CSx → CSy) | Người chuyển | Lý do / bàn giao | Kết quả (trạng thái hiện tại, vd Đã chốt) | Ngày.

### /affiliates — Nguồn giới thiệu (Affiliate)
- “Mỗi người giới thiệu có 1 mã; chia sẻ link kèm `?ref=MÃ` để lead tự gắn về đúng người. Hoa hồng đối soát tay theo % tham chiếu (chờ quy chế chính thức).”
- Nút `Thêm nguồn giới thiệu` → form “Nguồn giới thiệu mới”: Mã giới thiệu * · Tên người/đối tác * (VD: Chị An (PH lớp Sata 3)) · Điện thoại · Cơ sở theo dõi. (`createAffiliateAction`, `updateAffiliateAction`). Danh sách phân trang; rỗng “Chưa có nguồn giới thiệu nào.”

### /lop-trial — Lớp Trial (lớp trải nghiệm)
- “Lớp trải nghiệm nhiều buổi: tạo lớp → thêm buổi → xếp học viên → điểm danh.”
- Quy tắc: tạo lớp chỉ cần cơ sở + khoá trải nghiệm; **tên lớp tự đặt**. Ngày/giờ/phòng/GV chọn khi thêm buổi (mỗi buổi có thể khác). Thêm HV vào lớp = em đó học **toàn bộ buổi** của lớp, kể cả buổi tạo sau. **Đổi lịch hoặc huỷ buổi phải ghi lý do** — lý do gửi thẳng cho GV phụ trách buổi.
- Lọc: `q` (tên lớp hoặc mã lớp). Bảng: Lớp (tên + mã `TRIAL-CS2-26-008`) | Buổi kế tiếp (“Chưa xếp buổi”) | Sĩ số | Số buổi | Trạng thái (Đang mở / …) | Thao tác (`Huỷ lớp` — bấm 2 lần “Bấm lại để xác nhận”, `cancelLopTrialClassAction`).

### /lop-trial/moi — Tạo lớp trải nghiệm
- “Lớp là một khung giờ dùng lại nhiều lần, không gắn ngày khai giảng. Tạo xong nhớ thêm buổi, vì lớp chưa có buổi thì không xếp được học viên.”
- Trường: Tên lớp (readonly, tự sinh `<CS>-<khoá>-Lớp trial <số>`; số thứ tự cấp khi lưu; bỏ dấu tiếng Việt) · Cơ sở * · Khoá trải nghiệm (“Chính là "khoá quan tâm" của khách.”). Nút `Tạo lớp`.
- Mã lớp: `TRIAL-<CS>-<yy>-<seq3>`.

### /lop-trial/:id — Chi tiết lớp trial
- Header: tên, trạng thái, mã, “Sĩ số N · M buổi”, `Huỷ lớp`.
- **Thêm buổi học** (`addLopTrialSessionAction`): Ngày * · Giờ bắt đầu (mặc định 18:00) · Giờ kết thúc · Phòng (— chưa xếp phòng — + phòng của cơ sở) · Giáo viên (— chưa xếp giáo viên — + danh sách GV); dấu “đang bận” — “chỉ đối chiếu buổi của lớp trải nghiệm; chưa tính buổi lớp chính.”
- **Học viên / Thêm học viên**: `Tìm & thêm học viên` (tìm theo tên con, tên PH hoặc SĐT — chỉ ứng viên cùng cơ sở, chưa ở lớp khác; kết quả: tên con · PH · SĐT · trạng thái lead) + ô “Số buổi (≤ max)” (số nguyên 1..max, trống = mặc định) + nút xếp (`enrollLeadChildLopTrialAction{totalSessions}`); lớp đầy → “Lớp đã đủ sĩ số — thêm nữa cần quyền vượt sĩ số.” Danh sách HV: tên con, PH · SĐT, trạng thái (Đang học…), `Gỡ` (bấm 2 lần; `unenrollLeadChildLopTrialAction`).
- **Buổi học & điểm danh**: chip mỗi buổi “Buổi n · dd/MM/yyyy ✓ / đã huỷ · <GV>”; chi tiết buổi “Buổi n · ngày · HH:mm–HH:mm · GV”.
  - `Sửa buổi học` (chỉ buổi `SCHEDULED`): Ngày · Giờ bắt đầu · Giờ kết thúc · Phòng · Giáo viên · **Lý do dời / huỷ \*** (“Nội dung này được gửi thẳng cho giáo viên.”) → `Lưu & báo giáo viên` (`updateLopTrialSessionAction`) / `Huỷ buổi` (bấm 2 lần; `cancelLopTrialSessionAction`) / `Đóng`.
  - `Hoàn tất buổi` (`completeLopTrialSessionAction`).
  - Điểm danh từng HV: `Có mặt` / `Vắng` (bấm lại để bỏ chọn) + Ghi chú…; “Còn N em chưa đánh dấu”; `Lưu điểm danh` (`markLopTrialAttendanceAction`).
  - `Nhận phiếu đánh giá` / PDF: mở `/lop-trial/pdf/:enrollmentId?sessionId=` khi GV đã đánh giá; nếu chưa: “Học viên chưa được giáo viên đánh giá ở buổi này”.
- Trạng thái buổi: `SCHEDULED`, `COMPLETED`, `CANCELLED`. Trạng thái ghi danh trial: `ACTIVE`, `COMPLETED` (+ huỷ).

### /crm/commission — Bảng hoa hồng theo kỳ
Bảng: Kỳ (YYYY-MM) | Trạng thái (`DRAFT` …) | Số dòng | Tổng (VND) | Hành động (`Export Excel` → `/api/admin/crm/commission-export?period=`, `Duyệt`).

### /cham-soc-hv — Việc chăm sóc học viên
“Task chăm sóc phát sinh từ cảnh báo rủi ro / sau đăng ký.” Danh sách thẻ: tiêu đề “Chăm sóc: <loại cảnh báo> — <tên HV>”, link HV (`/students/:id/edit`), “hạn dd/m/yyyy” (+ “(quá hạn)”), nút `Hoàn tất` (`completeCareTask`, toast “Đã hoàn tất chăm sóc”).

### /canh-bao-rui-ro — Cảnh báo rủi ro học viên
“Học viên có nguy cơ rời bỏ — cần chăm sóc kịp thời.” Thẻ: tên HV (link), loại (vd **Nghỉ 2 buổi liên tiếp**), mức (`HIGH`…), mô tả (“Học viên vắng 2 buổi liên tiếp gần nhất — cần liên hệ phụ huynh.”), nút `Đã xử lý` (`resolveRiskAlert`, “Đã đóng cảnh báo”) và `Chuyển cấp` (`escalateRiskAlert`, “Đã chuyển cấp”). Mỗi cảnh báo sinh 1 task chăm sóc ở `/cham-soc-hv`.

### /sinh-nhat — Sinh nhật học viên
Quy tắc: hôm sinh nhật không có lớp → buổi chúc mừng xếp vào **buổi học gần nhất trước đó**; hệ thống báo trước **3 ngày** so với buổi tổ chức (đổi ở Cấu hình vận hành). HV chưa xếp lớp / lớp đã kết thúc không hiện. Danh sách 30 ngày tới; nút `Chạy quét sinh nhật` (job quét thủ công).

---

## B. Học viên & Lớp

### Enum dùng chung
- **Trạng thái học viên** (`StudentStatus`): `ACTIVE` Đang học · `PAUSED` Bảo lưu · `GRADUATED` Hoàn thành · `INACTIVE` Nghỉ học. (Form tạo/sửa chỉ cho chọn 3 giá trị đầu; `INACTIVE` chỉ đặt qua nút “Nghỉ học hẳn”.)
- **Giới tính**: `MALE` Nam · `FEMALE` Nữ · `OTHER` Khác. **Nhóm máu**: `A_POS` A+ · `A_NEG` A− · `B_POS` · `B_NEG` · `O_POS` · `O_NEG` · `AB_POS` · `AB_NEG` · `UNKNOWN` Chưa biết.
- **Mã học viên**: tự sinh dạng `CS2-26-M85QCG` (`<CS>-<yy>-<6 ký tự>`); dữ liệu cũ có dạng `CS1.HV.26.001`. Placeholder gợi ý `SR.HV.001`.
- **Trạng thái ghi danh** (`EnrollmentStatus`): `PENDING` Chờ xếp (lớp) · `CONFIRMED` Đã xếp (lớp) · `STUDYING` Đang học · `ACTIVE` Đang học (legacy) · `PAUSED` Bảo lưu · `COMPLETED` Hoàn thành (khoá) · `WITHDREW` Đã rút / Rút lớp · `TRANSFERRED` Đã chuyển · `CANCELLED`. Bộ lọc mặc định “Đang hoạt động” (`active`).
  - **Ma trận chuyển trạng thái** (dialog “Đổi trạng thái đăng ký”):
    `PENDING → CONFIRMED | CANCELLED`; `CONFIRMED → STUDYING | ACTIVE | WITHDREW | CANCELLED`; `STUDYING/ACTIVE → PAUSED | COMPLETED | WITHDREW | TRANSFERRED`; `PAUSED → STUDYING | ACTIVE | WITHDREW | TRANSFERRED`; `COMPLETED/WITHDREW/TRANSFERRED/CANCELLED` = trạng thái cuối.
  - Lỗi: `CLASS_FULL` “Lớp đã đầy — không thể chuyển học viên vào trạng thái này.”, `INVALID_TRANSITION` “Không thể chuyển sang trạng thái này từ trạng thái hiện tại.”, “Trạng thái không thay đổi”, “Lý do phải có ít nhất 5 ký tự”.
- **Trạng thái lớp** (`ClassStatus`): `PLANNED` Đang lên KH · `RECRUITING` Tuyển sinh · `PENDING_APPROVAL` Chờ duyệt · `ACTIVE` Đang dạy · `COMPLETED` Hoàn thành · `CANCELLED` Huỷ. (Form lớp chỉ cho chọn PLANNED/RECRUITING/ACTIVE/COMPLETED; Chờ duyệt/Huỷ qua quy trình.)
- **Trạng thái buổi học** (`SessionStatus`): `SCHEDULED` Đã lên lịch · `IN_PROGRESS` Đang diễn ra · `COMPLETED` Hoàn thành · `CANCELLED` Đã hủy.
- **Điểm danh** (`AttendanceStatus`): `PRESENT` Có mặt · `ABSENT` Vắng · `LATE` Muộn · `EXCUSED` Phép. Khi vắng/phép có thêm “Lý do phụ huynh xin vắng” và trạng thái bù `NONE` Không bù · `NEEDS_MAKEUP` Cần học bù · `MADE_UP` Đã học bù.
- **Phân loại buổi** (`SessionCategory`): Học chính thức · Lớp Coach (1-1, 1-2, 1-4) · Học bù · Học vượt · Workshop · Sự kiện · Hỗ trợ Đào tạo & Vận hành (trống = tính như Học chính thức).
- **Năng lực robotics** (hồ sơ HV): Lắp ráp cơ khí · Tư duy thuật toán · Lập trình · Cảm biến · Điều khiển động cơ · Giải quyết vấn đề · Làm việc nhóm · Thuyết trình · Sáng tạo · Sẵn sàng thi đấu; mức `NEED_SUPPORT` Cần hỗ trợ · `BASIC` Cơ bản · `GOOD` Tốt · `EXCELLENT` Xuất sắc (+ ghi chú).
- **Phòng**: `ACTIVE` Hoạt động · `MAINTENANCE` Bảo trì · `INACTIVE` Tạm ngừng.
- **Ưu đãi khoá** (`DiscountType`): `AMOUNT` Giảm số tiền (VND) · `PERCENT` Giảm phần trăm (%) · `SCHOLARSHIP` Học bổng (%) · `PROGRAM` Ưu đãi chương trình.
- **Quy ước tên lớp**: `tênkhoá.giờ-thứ.phòng` (vd `sata3.14h-CN.CS2-P302`, nhiều lịch nối `&`: `combo.10h-T2&10h-T4&15h30-T7.CS2-P302`) — tự gợi ý theo khoá/giờ/lịch/phòng, sửa được (“Dùng tên gợi ý: …”). **Mã lớp** `CS2.SATA3.26.004` (`<CS>.<KHOÁ>.<yy>.<seq3>`), tuỳ chọn nhưng duy nhất toàn hệ thống.
- **Chương trình Sata3–7**: 48 buổi = 4 học phần × 12 buổi (mỗi HP có “Ôn tập kiến thức”, “Dự án cuối học phần”, “Demo cuối học phần”, “Báo cáo cuối học phần”); Sata1/Sata2 16 buổi, Combo 32, Sata8 5.
- **Học phí niêm yết (khoá dạy)**: Sata1 2.400.000đ · Sata2 3.040.000đ · Combo 5.440.000đ · Sata8 2.500.000đ · Sata3 10.560.000đ · Sata4 11.520.000đ · Sata5 12.480.000đ · Sata6 13.440.000đ · Sata7 14.400.000đ. (Khoá cha marketing “Lập trình Robot”, “Luyện thi Robosim” giá 0, tắt.)

### /students — Học viên
- Header “Tất cả học viên (active)”; link `Tài khoản PH`, `Thêm học viên`, `Import Excel`.
- Lọc (GET, nút `Áp dụng`): `q` (Tên / mã / phụ huynh / SĐT phụ huynh) · `status` (Tất cả + 4 trạng thái) · `centerId` · `grade` (Lớp 1…12). “N học viên”, phân trang 10/20/50/100, “Trang x/y”.
- Cột: Ảnh (avatar/chữ cái đầu) | Học viên (tên + mã) | Lớp (lớp phổ thông) | Phụ huynh (tên + SĐT) | Cơ sở | Khoá (số khoá đang học) | Trạng thái | Ngày tạo | Hành động (`Sửa` → `/students/:id/edit`).
- **Không có trang `/students/:id`** (404) — trang sửa là trang hồ sơ đầy đủ.

### /students/new và /students/:id/edit — Hồ sơ học viên
Form (server action `createStudent` / `updateStudent`; nút `Tạo học viên`/`Cập nhật`, `Huỷ`):
| Nhóm | Trường |
|---|---|
| Thông tin học viên | Ảnh đại diện (JPG/PNG/WebP/GIF ≤10MB, gợi ý ≥200×200) · `name` Họ và tên **REQ** · `studentCode` Mã học viên · `dateOfBirth` · `gender` · `status` **REQ** (ACTIVE/PAUSED/GRADUATED; ghi chú: “Cho nghỉ học phải dùng nút "Nghỉ học hẳn" ở khối Lifecycle bên dưới — nút đó mới gỡ học viên khỏi lớp.”) · `phone` SĐT HV (nếu có) · `email` |
| Học vấn | `currentGrade` Lớp hiện tại (1–12) · `school` Trường đang học |
| Phụ huynh | `parentName` Họ tên PH chính **REQ** · `parentPhone` SĐT PH chính **REQ** · `parentRelation` Quan hệ (Mẹ/Bố/Ông/Bà) · `parentEmail` · `parentNationalId` CCCD phụ huynh · (details) `parent2Name`, `parent2Phone`, `parent2Relation` |
| Địa chỉ | `address` Số nhà, đường · `ward` Phường · `district` Quận/Huyện · `city` Tỉnh/TP |
| Thông tin Sata Robo | `enrollmentDate` Ngày đăng ký lần đầu · `preferredOrgUnitId` Đơn vị mong muốn · `orgUnitId` Cơ sở **REQ** · `notes` Ghi chú nội bộ (không public) |
| Sức khoẻ (tuỳ chọn) | `bloodType` · Dị ứng (danh sách chuỗi — “Thêm mục”/“Xoá mục”) · `healthNotes` (bệnh nền, lưu ý cho GV) |

Các khối chỉ có ở trang sửa:
- **Lifecycle học viên**: badge trạng thái; nút `Bảo lưu` (dialog “Bảo lưu — <HV>”: Lớp bảo lưu = “Tất cả lớp đang học” hoặc 1 ghi danh · **Lý do \*** · Dự kiến trở lại (date, tuỳ chọn) — `reserveStudentAction`), `Kết thúc bảo lưu` (“Học viên sẽ chuyển về trạng thái "Đang học" và các lớp đang bảo lưu sẽ được resume.”; Ghi chú tuỳ chọn — `resumeStudentReserveAction`), **`❌ Nghỉ học hẳn`** (dialog: “Học viên chuyển sang INACTIVE, tất cả đợt bảo lưu sẽ kết thúc, mọi enrollment chưa hoàn thành chuyển sang WITHDREW. Có thể kích hoạt lại sau.”; **Lý do nghỉ học \*** — `withdrawStudentAction`), `Kích hoạt` lại (`reactivateStudentAction`). Hiển thị đợt bảo lưu đang chạy “từ <ngày> → dự kiến trở lại <ngày>”.
- **Tài khoản phụ huynh (Portal)**: trạng thái liên kết (“Đã liên kết tài khoản phụ huynh. Tài khoản đang chờ kích hoạt — phụ huynh nhập mã nhận qua Zalo (hoặc email) để đặt mật khẩu.”); nút `Cấp tài khoản phụ huynh` (khi chưa có — `createParentAccount`), `Gửi lại mã kích hoạt` (`resendParentActivationOtp`), `Cấp mã tại quầy` (`issueOfflineActivationCode` — hiện mã “Đọc mã này cho phụ huynh (hết hạn theo cấu hình OTP)”, nút `Ẩn mã`). “Con của phụ huynh (N)”: danh sách con (đánh dấu “đang xem”), ô tìm “Tìm HV chưa có phụ huynh (tên/mã/SĐT)…” + `Tìm` để gắn thêm con (`searchLinkableStudents`, `addChildToParent`), gỡ con (`unlinkChildFromParent`).
- **Tiến độ học tập**: mỗi lớp đang học: “Buổi x/y · Đã học · Còn lại”, tên lớp, `mã · khoá · cơ sở`, link `Xem lớp →` (`/classes/:id/progress`), nút `Tạo PDF` (báo cáo tiến độ); chỉ số Điểm danh (x/y, %), Bài học (x/48), Bài tập, Điểm TB.
- **Lịch sử học tập**: bảng Lớp / Khoá | Buổi (đã học/tổng) | Trạng thái (mã enum) | Bắt đầu | Kết thúc.
- **Hồ sơ năng lực robotics**: 10 kỹ năng × mức + ghi chú; nút `Lưu năng lực` (`saveStudentSkills`).
- **Lịch sử bảo lưu**: danh sách đợt (“Chưa có lần bảo lưu nào.”).

### /students/import — Import học viên
- File .xlsx/.xls ≤10MB, ≤5000 dòng; mẫu `/templates/mau-hoc-vien-v2.xlsx`.
- Quy tắc: `studentCode` là **khoá upsert** (trùng → UPDATE; mới → CREATE; trống → luôn CREATE, có thể trùng). Ngày `YYYY-MM-DD` hoặc `DD/MM/YYYY`. `currentGrade` 1–12. `gender` MALE/FEMALE/OTHER. `status` ACTIVE/PAUSED/GRADUATED/INACTIVE (mặc định ACTIVE). `bloodType` A_POS…UNKNOWN. `allergies` phân tách dấu phẩy. `centerSlug` slug cơ sở mong muốn (rỗng = chưa chọn; sai slug → bỏ dòng). Avatar không import.

### /students/tai-khoan — Tài khoản phụ huynh
- “Theo dõi tài khoản chờ kích hoạt · gửi lại mã OTP · báo cấp tài khoản qua Zalo · xuất danh sách gọi điện. Phụ huynh tự kích hoạt tại satarobo.vn/kich-hoat (nhập SĐT → nhận OTP Zalo → đặt mật khẩu).”
- Tab: `Chờ kích hoạt (N)` (mặc định) · `Tất cả (N)` (`?status=all`). Tìm theo tên PH / SĐT / tên học viên. `Xuất CSV`. `Gửi ZNS tất cả chưa nhận` (“cho mọi tài khoản chờ kích hoạt CHƯA từng nhận (tối đa 100/lượt)” — `sendAccountZnsBulk`; kết quả “x gửi · y lỗi · z đã nhận trước đó”; cảnh báo “CHẾ ĐỘ MÔ PHỎNG (ZALO_LIVE chưa bật)”; “Chưa cấu hình mẫu ZNS”).
- Cột: Phụ huynh (tên, SĐT, “Tạo: yyyy-mm-dd”) | Học viên (tên · mã, nhiều con) | Cơ sở | Trạng thái (Chờ kích hoạt / Đã kích hoạt…) | ZNS báo cấp TK (Chưa gửi / Đã gửi / “Lỗi gửi — rê chuột xem”) | Hành động (`Gửi lại OTP` — `resendActivationOtpByUser`; `Gửi ZNS báo cấp TK` — `sendAccountZns`; `Cấp mã tại quầy` — “Cấp mã kích hoạt đọc qua điện thoại (khi ZNS không tới được)”).

### /enrollments — Đăng ký học (ghi danh)
- “N đăng ký (đang hoạt động)”; `Đăng ký mới`.
- Lọc: `q` (HS / SĐT PH / tên lớp / mã lớp) · `status` (active mặc định | all | PENDING | CONFIRMED | STUDYING | PAUSED | COMPLETED | WITHDREW | TRANSFERRED) · `classId` · `centerId`.
- Cột: Học viên | Lớp / Cơ sở | Trạng thái | Ngày đăng ký | Hành động (link sửa → `/enrollments/:id/edit`, `Xoá`).

### /enrollments/new — Đăng ký lớp cho học viên
Học viên * (select: `tên · mã · SĐT PH`) · Lớp học * (chỉ lớp còn mở; nhãn `mã · tên · cơ sở · sĩ số/tối đa`) · Ghi chú (vd “Đăng ký qua campaign 24 suất miễn phí…”). Nút `Tạo đăng ký` / `Huỷ`.

### /enrollments/:id/edit — Chi tiết đăng ký
- Header: “Đăng ký: <HV>” + badge trạng thái.
- Khối **Học viên** (tên, mã, PH · SĐT, `Mở hồ sơ học viên →`); **Lớp học** (tên, mã, Khoá, Cơ sở · Phòng, GV chính, Lịch “CN · 14:00–15:30”, Khai giảng, `Mở chi tiết lớp →`); **Mốc thời gian** (Ngày đăng ký, Xác nhận xếp lớp, Bắt đầu học, Kết thúc); **Audit log (N)** (“Chưa có thay đổi nào được log.”).
- `Đổi trạng thái` (dialog: Trạng thái hiện tại · **Trạng thái mới \*** (chỉ các chuyển hợp lệ) · **Lý do \*** (≥5 ký tự) — “Mỗi lần đổi sẽ ghi vào audit log, không xoá được.” — `changeEnrollmentStatus`).
- `Chuyển lớp` (dialog: chọn lớp đích (hiển thị “Còn N chỗ”) + lý do — `transferEnrollment`; lỗi “Chọn lớp đích”, “Lớp đích đã đầy — vui lòng chọn lớp khác.”; thành công → điều hướng sang ghi danh mới `/enrollments/:newId/edit`, ghi danh cũ = TRANSFERRED).

### /chuyen-lop — Chuyển lớp / chuyển cơ sở (yêu cầu có duyệt)
- Quy tắc: lớp đích **cùng khoá**, **không vượt tiến độ** học viên. Hết chỗ → tự đưa vào **danh sách chờ (waitlist)**. Giữ lịch sử cơ sở cũ.
- Wizard: Bước 1 Cơ sở nguồn → Bước 2 Học viên → Bước 3 Lớp hiện tại → Bước 4 Cơ sở đích (tuỳ chọn, “Mọi cơ sở”) → `Tìm lớp đích phù hợp` (`listEligibleClassesAction`; mỗi lớp hiện “x bài · còn N chỗ”) → Lý do chuyển → tạo yêu cầu (`createTransferRequestAction`, “Đã tạo yêu cầu chuyển — chờ duyệt”).
- Bảng **Yêu cầu đang chờ**: Học viên | Trạng thái (“Chờ quản lý duyệt”) | Lý do | Ngày | Thao tác (`Duyệt` — `approveTransferAction`, `Từ chối` — `rejectTransferAction`).

### /students/sap-het-khoa — Sắp hết khoá
“Học viên còn **≤ 5 buổi** — liên hệ phụ huynh tái tục. Sắp xếp theo số buổi còn lại.” (danh sách read-only).

### /hoan-thanh-khoa — Hoàn thành khoá & chứng chỉ
- Hướng dẫn: đánh dấu HV hoàn thành khoá, nhập **đánh giá cuối khoá của GV** → **sinh chứng chỉ**, gợi ý **khoá tiếp theo**, tạo **việc chăm sóc tái tục** và đẩy **email chúc mừng**.
- **Đề xuất chờ duyệt** (GV gửi từ site giáo viên): `Duyệt` / `Từ chối` (“Lý do từ chối (nên có)”, “Ghi chú (tuỳ chọn)”) — `reviewCourseCompletion`.
- Form đơn lẻ: Bước 1 Học viên → Bước 2 Khoá đang học (`listStudentCoursesAction`) → Bước 3 Lớp (theo khoá) · Xếp loại cuối khoá (Giỏi / Khá / Xuất sắc…) · **Đánh giá cuối khoá của GV \*** → `Đánh dấu hoàn thành & sinh chứng chỉ` (`markCourseCompletion`; “Đã hoàn thành khoá. Chứng chỉ: <certificateCode>”).
- **Hoàn thành khoá hàng loạt theo lớp**: Bước 1 Chọn lớp → `Hoàn thành N học viên & sinh chứng chỉ` (`bulkCompleteByClass`; kết quả “Hoàn thành x, bỏ qua y (đã có chứng chỉ), lỗi z”).
- Bảng lịch sử: Học viên | Khoá | Xếp loại | Khoá tiếp theo | Ngày | Chứng chỉ.

### /hoc-ba — Học bạ học viên (tổng hợp)
Chọn học viên (GET `studentId`) → “Học bạ — <HV>”: bảng Lớp | Khoá | Chuyên cần | Điểm TB | Trạng thái; xuất PDF qua `/api/admin/reports/transcript?studentId=`.

### /report-cards — Học bạ năng lực
- Quy trình: **Chọn lớp → nhập học bạ từng học viên → nộp duyệt → phát hành**. Link `Cấu hình tiêu chí`.
- Chọn lớp (GET `classId`) → bảng Học viên | Trạng thái học bạ (Nháp / Chờ duyệt / Đã phát hành…) | Thao tác (→ `/report-cards/:id`).
- **/report-cards/:id**: “Học bạ — <HV> (<mã>)”, khoá · lớp, badge trạng thái (Nháp).
  - *Số liệu (tự đổ, live)*: Chuyên cần (x/y, %) · Vắng (chưa bù) · Đã học bù · Chờ bù · Bài kiểm tra · KT đạt · Điểm TB KT · Bài tập (nộp/giao) · Bài tập đã chấm · Điểm TB bài tập — “Số liệu được đóng băng vào bản phát hành tại thời điểm phát hành.”
  - *Nhận xét theo giai đoạn* (`+ Thêm giai đoạn`), *Đánh giá năng lực (thang 1–4)* theo tiêu chí của khoá, *Tổng kết*: Kết quả hoàn thành (vd Hoàn thành tốt) · Nhận xét tổng kết.
  - Nút `Lưu nháp`, `Nộp duyệt`. Chặn: “Cần cấu hình tiêu chí năng lực cho khoá trước khi lưu / nộp học bạ.”
- **/report-cards/criteria**: mỗi khoá một khối, danh sách tiêu chí + ô “Tên tiêu chí mới” + `Thêm`. “Đào tạo cấu hình tiêu chí theo từng khoá học. GV chấm thang 1–4 cho mỗi tiêu chí khi nhập học bạ.”

### /classes — Lớp học
- “N lớp”; `Thêm lớp`, `Import Excel`, `Kiểm tra lịch buổi`.
- Lọc: `q` (tên / mã lớp) · `status` · `centerId` · `courseId` · `teacherId`. Phân trang.
- Cột: Tên lớp (+ mã) | Khoá học | Cơ sở / Phòng | Lịch (thứ + giờ, vd “CN 15:45–17:15”) | GV chính | Sức chứa (đang/ tối đa) | Khai giảng (dd/MM) | Trạng thái | Hành động (xem `/classes/:id`, sửa `/classes/:id/edit`, `Xoá`).

### /classes/new và /classes/:id(/edit) — Tạo / chi tiết lớp
**Form lớp** (`createClass` / `updateClass`; nút `Tạo lớp` / `Cập nhật`, `Huỷ`):
- *Thông tin lớp học*: `name` Tên lớp **REQ** (gợi ý theo quy ước) · `classCode` Mã lớp · `courseId` Khoá học **REQ** · `orgUnitId` Cơ sở **REQ** (lọc phòng & GV theo cơ sở) · `status` **REQ** (PLANNED/RECRUITING/ACTIVE/COMPLETED) · `description` “Mô tả chi tiết đặc thù lớp học” (để bàn giao khi đổi GV) · `curriculumId` Giáo trình áp dụng **REQ** (chỉ giáo trình ACTIVE của khoá; “Khoá chưa có giáo trình ACTIVE”).
- *Phân công*: `roomId` Phòng học **REQ** · `teacherId` GV chính **REQ** · `assistantId` Trợ giảng (không được trùng GV chính) · `startDate` Ngày khai giảng **REQ** · `endDate` Ngày bế giảng · `minStudents` Số HS tối thiểu **REQ** (≥1, mặc định 5) · `maxStudents` Số HS tối đa **REQ** (≥1, mặc định 20).
- *Kế hoạch lịch học \** (nhiều giai đoạn — `saveSchedulePhasesAction`): “Một lớp có thể đổi nhịp học giữa khoá — ví dụ tháng 7 học 2 buổi/tuần, tháng 8 còn 1 buổi/tuần. Mỗi giai đoạn khai khoảng ngày + các thứ trong tuần + giờ của từng thứ. Giai đoạn cuối bỏ trống ô "đến ngày" để kéo dài tới khi học đủ số buổi.” Mỗi giai đoạn: Từ ngày * · Đến ngày (trống = đến hết khoá) · chip thứ T2…CN, mỗi thứ chọn Giờ bắt đầu/Giờ kết thúc · Ghi chú (vd nghỉ hè). `Thêm kế hoạch lịch`; khi sửa: **Lý do thay đổi** (ghi nhật ký lớp) + `Lưu kế hoạch`.
- *Áp lịch mới cho các buổi đã sinh* (`previewApplyScheduleAction` → `applyScheduleAction`): “Buổi TRƯỚC ngày áp dụng giữ nguyên. Buổi từ ngày áp dụng trở đi mà đã có dữ liệu (đã điểm danh, đã nhận xét, đã giao bài tập, đã có ảnh, đã hoàn tất hoặc đã huỷ) cũng giữ nguyên ngày — chỉ buổi còn trống mới được dời. Tổng số buổi của khoá không đổi…”. Nút `Xem trước` → `Áp dụng`; cảnh báo “N buổi ở lịch mới bị trùng phòng/GV”.

**Trang chi tiết lớp** — header: tên, badge trạng thái, `mã · khoá`, link `👥 Học sinh` (`/classes/:id/students`), `📊 Tiến độ` (`/classes/:id/progress`); tóm tắt Lịch học · Giờ · GV chính · Sĩ số x/y. Tabs:
1. **Thông tin**:
   - *Phê duyệt lớp*: PLANNED → “Lớp đang chuẩn bị. Gán đủ học sinh phù hợp giờ rồi gửi quản lý duyệt.” `Gửi duyệt` (`submitClassForApproval` → PENDING_APPROVAL); quản lý `Duyệt`/`Từ chối` (`approveClass`/`rejectClass`); ACTIVE → “Lớp đã duyệt, đang hoạt động.” **Lớp duyệt ACTIVE tự sinh buổi.**
   - *Buổi học theo lịch*: `Sinh buổi học` (`generateSessionsAction` — “tạo buổi theo lịch lớp + số buổi chuẩn của khoá, bỏ qua ngày nghỉ (chỉ khi lớp CHƯA có buổi)”); `Xếp lại buổi theo lịch` (“neo lại CẢ DÃY buổi từ ngày khai giảng theo lịch hiện tại (trừ ngày nghỉ). Chỉ đổi ngày — không tạo, không xoá buổi; buổi đã điểm danh / có nhận xét / đã giao bài / có ảnh / đã hoàn tất giữ nguyên ngày.” — kết quả “sinh x · dời y · giữ z buổi đã có dữ liệu”); `Xem trước dời` → `Áp dụng dời buổi` (`previewClassReschedule`/`applyClassReschedule` — “chỉ áp lịch cho các buổi CHƯA diễn ra; buổi trùng lịch nghỉ cơ sở sẽ dời sang buổi kế (giữ đủ tổng buổi).”).
   - Form lớp + kế hoạch lịch (như trên).
   - (Trang `/edit`) *Hủy lớp*: “Rút toàn bộ ghi danh còn học, hủy các buổi tương lai và tạo yêu cầu hoàn tiền cho khoản đã thu. Không thể hoàn tác.” nút `Hủy lớp…`.
2. **Chương trình** — “Chương trình (kế hoạch buổi)”, “Version đang chốt: N”; danh sách buổi theo giáo trình (số thứ tự + tên bài), mỗi dòng `Sửa` (Tiêu đề tuỳ biến · Ghi chú buổi · Lên/Xuống — `updateSessionPlan`); `Áp dụng version mới…` (`adoptCurriculumVersionAction`).
3. **Buổi & Điểm danh**:
   - *Quản lý buổi học*: mỗi buổi “Buổi n · Thứ, dd/MM/yyyy · loại · Đã điểm danh x / Chưa điểm danh · n phiếu nhận xét · trạng thái”; nút `Chi tiết` (`/sessions/:id`), `Điều chỉnh` (Ngày · GV chính · Phòng, mặc định “— Giữ nguyên —” → `Lưu điều chỉnh`, `adjustSessionAction`), `Huỷ` (“Lý do huỷ buổi (bắt buộc, ≥5 ký tự)”; “Buổi sẽ chuyển trạng thái "Đã hủy" (không xoá). Buổi bù được xử lý theo lịch.” → `Xác nhận huỷ buổi`, `cancelSessionAction`); buổi SCHEDULED/IN_PROGRESS đã tới ngày: `Hoàn tất buổi` (`completeSessionAction`) / `Giao bài` (`assignSessionHomeworkAction`).
   - *Điểm danh*: “Chọn buổi điểm danh” (nhãn `Buổi n · dd/MM/yyyy · HH:mm · đã điểm danh x | chưa điểm danh`); bảng Học viên | Trạng thái (Có mặt/Vắng/Muộn/Phép) | Ghi chú (+ lý do vắng & trạng thái bù khi vắng); `Đánh dấu tất cả Có mặt`, `Lưu điểm danh` (`markAttendance`, “Đã lưu điểm danh cho N học viên.”).
4. **Ảnh lớp** — *Đăng ảnh lớp*: chọn lớp, `Đăng ngay 1 ảnh` hoặc `Đưa vào kho (nhiều ảnh)` (tối đa 40/lô), Ngày chụp, Chú thích, gắn thẻ học sinh hoặc “Ảnh chung cả lớp (mọi phụ huynh trong lớp đều xem được)”; ảnh vào **kho của lớp** thì PH chưa thấy — GV chọn, gắn thẻ rồi gửi. *Thư viện (N)*: lọc “Chờ duyệt / Đã duyệt / Từ chối” (`ACTIVE`) hoặc “Trong kho (GV chưa gửi)” (`DRAFT`); `Duyệt` / `Từ chối` (`reviewMedia`), `Xoá` (xoá vĩnh viễn — PH cũng không thấy). Giới hạn file: ảnh ≤10MB, tài liệu ≤20MB, video ≤500MB, audio ≤50MB, archive ≤1GB (SCORM).
5. **Học bù** — danh sách nhu cầu học bù của lớp (“Không có nhu cầu học bù nào đang chờ cho lớp này.”).
6. **Tài liệu SCORM** — “Mở/present tài liệu SCORM của bài giảng theo từng buổi. Mỗi lần mở cấp vé **10 phút** + **watermark** (truy vết).”
7. **Đánh giá & Nhận xét** — *Nhận xét buổi học (phiếu giáo viên)* (cùng nội dung PH xem ở cổng phụ huynh) và *Phiếu khảo sát theo đợt* (`SESSION_EVAL` do quản trị mở theo đợt ở “Đánh giá & Khảo sát”; `loadSessionEvalAction`/`saveSessionEvalAction` — “Lưu phiếu đánh giá buổi”).

### /classes/:id/students — Học sinh lớp
- “Học sinh trong lớp (x/max)”: mỗi HV: tên, mã, select **Sale phụ trách** của ghi danh (`setEnrollmentSaleAction`), badge trạng thái ghi danh, `Chuyển lớp` (`transferFromClassAction`), `Xoá khỏi lớp` (`removeFromClassAction`; lựa chọn “Gỡ khỏi lớp này” / nghỉ hẳn `withdrawFromSystemAction` — “Đã cho <HV> nghỉ hẳn — hồ sơ lead vẫn được giữ lại”).
- Checkbox chọn HV `CONFIRMED` → `Chuyển sang Đang học (x/y)` (`promoteConfirmedAction`).
- “Học viên đủ điều kiện (N)” = **đúng khoá + đúng cơ sở + chưa xếp lớp active**: `Thêm đã chọn (N)` (`assignSelectedAction`), `Thêm toàn bộ` (`assignAllFilteredAction`).

### /classes/:id/progress — Tiến độ lớp
KPI: Sĩ số đang học · Buổi đã diễn ra · Điểm danh TB · Điểm TB lớp. Bảng: Học viên (tên, mã, SĐT PH) | Điểm danh | Bài học (x/48) | Bài tập | Điểm TB | Đề thi đạt | `Chi tiết →`; lưới bài học theo giáo trình. Nút `Tạo & gửi báo cáo` (gửi báo cáo tiến độ cho PH).

### /classes/import — Import lớp
`classCode` = khoá upsert (trùng → UPDATE; mới → CREATE; rỗng → CREATE). 5 tham chiếu phải tồn tại: `courseSlug`, `centerSlug`, `roomCode` (thuộc center), `teacherCode` + `assistantCode` (Employee role TEACHER/CENTER_MANAGER, ACTIVE, có User active). `scheduleDays`: “T2,T5” hoặc số “1,4” (CN=0, T2=1…T7=6). `startTime`/`endTime` `HH:mm` (pad 0). GV phụ ≠ GV chính. Mặc định min 5, max 20, status PLANNED. Cột `notes` bỏ, dùng `description`. Mẫu `/templates/mau-lop-hoc-v2.xlsx`; ≤10MB, ≤5000 dòng.

### /classes/kiem-tra-lich — Kiểm tra lịch buổi học
Đối chiếu dãy buổi đã sinh với ngày khai giảng + lịch học (đã trừ ngày nghỉ); chỉ liệt kê lớp lệch. Bảng: Lớp (trạng thái · số buổi) | Vấn đề (vd **Neo sai ngày khai giảng**: “Buổi 1 đang là … nhưng theo ngày khai giảng + lịch học phải là … — cả dãy N buổi bị neo sai (x buổi lệch ngày).”) | Khai giảng | Buổi 1 hiện tại | Buổi 1 đúng lịch | Buổi lệch | Xử lý (`Xếp lại` = xếp lại buổi theo lịch).

### /sessions — Buổi học
- Tab `Sắp tới` / `Đã diễn ra` / `Tất cả` (“hiển thị 200 mới nhất”); lọc lớp; `Thêm buổi học`.
- Cột: Thời gian (dd/MM/yyyy · HH:mm + nhãn Sắp tới/Đã diễn ra) | Lớp / Chủ đề | Điểm danh (“Chưa có”/x/y) | Thao tác (`/attendance?sessionId=`, `/sessions/:id`, `/sessions/:id/edit?returnTo=`).
- ⚠️ Lỗi hiện hữu: giờ trong danh sách hiển thị theo UTC (lớp 10h hiện 03:00) — bản mới phải hiển thị giờ Asia/Ho_Chi_Minh.

### /sessions/new — Thêm buổi học
`classId` Lớp **REQ** · `date` Thời gian (datetime-local) **REQ** (“Giờ kết thúc tính theo thời lượng buổi của khoá”) · `topic` Chủ đề · `sessionCategoryId` Phân loại buổi · `lessonId` Bài học trong giáo trình (theo giáo trình active của khoá; chọn lớp trước) · `lessonNotes` Ghi chú riêng buổi này (so với template bài) · `notes` Ghi chú (mục tiêu, tài liệu, BTVN). Nút `Tạo buổi học`.

### /sessions/:id — Chi tiết buổi học
- Header: `mã lớp · tên lớp`; “Buổi n · Thứ, dd/MM/yyyy · HH:mm–HH:mm · cơ sở · phòng”; Khoá · GV chính · Bài học (“Bài n: …”).
- **Quy trình sau buổi (checklist)** — trạng thái “Đã hoàn tất”/chưa:
  - Chuẩn bị: 1. Vệ sinh phòng học · 2. Thiết bị dạy học OK · 3. Học cụ / kit đủ cho buổi.
  - Trong / sau buổi: 4. **Điểm danh xong \*** (tự động khi có điểm danh) · 5. **Xác nhận bài đã dạy \*** (đã gắn bài giảng) · 6. **Nhận xét từng HS có mặt \*** (tự động khi mọi HS có mặt đã được nhận xét) · 7. Upload + tag ảnh lớp (tuỳ chọn) · 8. Giao bài tập (tuỳ chọn) · 9. Ghi chú sự cố (tuỳ chọn).
  - “Ghi chú buổi học (GV)” + `Lưu tiến trình` (“Nhớ bấm "Lưu tiến trình" trước khi "Hoàn tất buổi".”).
- **Phiếu nhận xét đã lưu (N)**; **Nhận xét từng học sinh** (nút `Phiếu đánh giá buổi học`); details “Nhận xét nhanh (cũ)” — nhận xét + chấm sao 1–5 từng HS, `Lưu nhận xét nhanh`.
- Quy tắc hoàn tất buổi (trang /attendance): “Một buổi chỉ tính là hoàn tất khi đã điểm danh đủ lớp, nhận xét đủ học viên đi học và có ảnh/video trong kho.”

### /lich — Lịch dạy
Lịch tháng (T2…CN), điều hướng `← Trước`/`Sau →` (`?y=&m=`, m 0-based). Mỗi ngày liệt kê “HH:mm <tên lớp>”; ngày lễ/nghỉ hiển thị.

### /attendance — Điểm danh
- “Chọn lớp để mở danh sách buổi.” Tìm lớp (lớp, mã, khoá, GV) · lọc cơ sở · lọc trạng thái. Tóm tắt “N lớp · M buổi đã dạy chưa chốt hoàn tất”.
- Bảng: Lớp (tên, mã · khoá · giờ) | Cơ sở | Giáo viên | Sĩ số | Buổi đã dạy (x/tổng) | Chưa chốt | Trạng thái | Mở (`Xem buổi` → `?classId=`).
- `?classId=`: danh sách buổi của lớp; `?sessionId=`: “Buổi học đang điểm danh” (lớp, thứ ngày giờ, “N HV · Không có thay đổi”), bảng Học viên | Trạng thái (4 nút) | Ghi chú, `Đánh dấu tất cả Có mặt`, `Lưu điểm danh`.

### /hoc-bu — Học bù
- Luồng: **Buổi vắng cần bù → gợi ý buổi bù cùng khoá/bài (không vượt tiến độ) → xếp → đánh dấu đã bù.**
- Thẻ: HV, lớp, trạng thái (`Chờ xếp bù`/đã xếp “→ bù: <ngày>”/đã bù), “Buổi lỡ: <ngày> · Bài n: <tên bài>”; nút `Gợi ý buổi bù` (`getMakeupSuggestions` — liệt kê buổi của lớp khác cùng bài: “<lớp> · Bài n: … · còn N chỗ” → xếp `scheduleMakeupAction`), `Đã bù` (`completeMakeupAction`), `Huỷ` (confirm “Huỷ yêu cầu học bù của <HV>?” — `cancelMakeupAction`).

### /course-packages — Gói khoá học (để bán)
- “Gói = đơn vị BÁN (giá, marketing) Sata1-8 và Combo. Mỗi gói liên kết một Khoá dạy (chương trình giảng) để tránh trùng lặp.”
- Cột: Mã | Tên gói (+ /slug) | Cấp độ | Khoá dạy | Giá | Số buổi | Trạng thái (Đã đăng / Nổi bật) | Thao tác (sửa `/course-packages/:id/edit`).
- **/course-packages/new** (và edit; `?courseId=` điền sẵn): *Thông tin cơ bản* `code` **REQ** (Sata1…), `slug` (tự tạo từ mã), `name` **REQ**, `shortName`, `subtitle`, `shortDescription`, `description` · *Đối tượng và cấp độ* `ageGroup` (Lớp 1-8), `level` (Nhap mon | So cap | Co ban | Trung cap | Kha | Cao cap | Chuyen binh thi dau | Combo) · *Lịch và giá* `lessons` Số buổi, `duration` (2 tháng), `priceOriginal` Giá niêm yết, `priceEarlyBird` Giá ưu đãi sớm, `priceMember` Giá hội viên (VND) · *Tính năng (JSON)*, *Điểm nổi bật (JSON)*, *Giáo trình* (danh sách chủ đề, nút Thêm) · *Hiển thị* `badge`, `color` (orange/purple/green/blue/amber/indigo/teal/red), `displayOrder`, `isPublished` Đã đăng, `isFeatured` Nổi bật · *Hình ảnh* thumbnail · *SEO* `seoTitle`, `seoDescription` · *Khoá dạy liên kết* `courseId` (hoặc “Không liên kết (dùng giáo trình JSON)”) · *Khoá cha (landing marketing)* `parentCourseSlug` (laptrinhrobot | luyenthirobosim) · *Nội dung trang chi tiết*: `audienceTag`, `audienceDescription`, `mission`, Kết quả đạt được (list), Phương pháp đào tạo (list, tuỳ chọn), Điều kiện đặc biệt (list, vd Sata8 cam kết hoàn tiền), `noteForParents`, FAQ (`Thêm FAQ`). Nút `Tạo mới` / `Huy`.

### /courses — Khoá dạy (chương trình giảng)
- “Khoá dạy = đơn vị GIẢNG (chương trình, độ tuổi, trình độ, ưu đãi). Để BÁN/định giá, mở chi tiết khoá để quản lý gói bán liên kết.”
- Cột: Tên khoá (+ /slug) | Độ tuổi | Trình độ | Giá | Ưu đãi (số) | Trạng thái (Hoạt động / Tắt).
- **/courses/:id**: *Thông tin khoá học* (Tên khoá · Độ tuổi (vd 6-8 tuổi) · Trình độ (vd Cơ bản) · Giá niêm yết (VND) · switch Đang hoạt động → `Lưu`, `updateCourseBasics`); *Ưu đãi* (“Cấu hình giảm giá / học bổng áp dụng toàn hệ thống cho khoá này.”; bảng Loại | Giá trị | Ghi chú | Hiệu lực | Trạng thái | Thao tác; form: Loại ưu đãi · Giá trị (VND hoặc %) · Ghi chú · Điều kiện áp dụng · Hiệu lực từ/đến · Đang áp dụng — `createCourseDiscount`/`updateCourseDiscount`/`deleteCourseDiscount`); *Gói bán liên kết* (+ Thêm gói bán).

### /rooms — Phòng học
- Lọc: `q` (tên/mã) · `centerId` · `status`. `Import Excel` (`/rooms/import`), `Thêm phòng` (`/rooms/new`).
- Cột: Mã / Tên | Cơ sở | Sức chứa | Thiết bị | Trạng thái | Order | Thao tác (sửa).
- Form: `name` Tên phòng **REQ** · `code` Mã phòng **REQ** (vd DN-A1) · `orgUnitId` Cơ sở **REQ** · `capacity` Sức chứa **REQ** (≥1, mặc định 15) · `status` **REQ** · `displayOrder` · Thiết bị (danh sách) · `notes` Ghi chú nội bộ.

---

## C. Tài chính

### Enum dùng chung
- **Loại đơn** (`OrderType`): `COURSE` Khoá học · `PACKAGE` Gói combo · `EXAM` Kỳ thi · `PRODUCT` Sản phẩm · `COMBO` Combo. (Tạo đơn thủ công chỉ cho `COURSE` / `PRODUCT`.)
- **Trạng thái đơn (cột lưu)** (`OrderStatus`): `DRAFT` Nháp · `PENDING_PAYMENT` Chờ thanh toán · `CONFIRMED` Đã xác nhận đơn · `COMPLETED` Hoàn tất · `CANCELLED` Đã huỷ · `REFUNDED` Đã hoàn tiền.
  - Chuyển tay (dialog “Đổi trạng thái đơn hàng”: Hiện tại · Chuyển sang · Lý do (tuỳ chọn) — `changeOrderStatusAction`, chống ghi đè bằng `updatedAt` → lỗi `STALE_WRITE`): `DRAFT → PENDING_PAYMENT | CANCELLED`; `PENDING_PAYMENT → CONFIRMED | CANCELLED`; `CONFIRMED → COMPLETED | CANCELLED`.
- **Trạng thái đơn hiển thị (suy từ tiền)** — badge chính có tooltip “Trạng thái suy từ tiền đã thu, không phải từ cột Order.status” (trừ Nháp/Huỷ/Hoàn tiền là “do người quyết”): `CHUA_THU` Chưa đóng · `DANG_THU` Đang đóng (+ phụ “Có khoản chờ kế toán đối soát”) · `DU_CHO_DOI_SOAT` Đã đóng đủ + “Chờ kế toán đối soát” · `DA_DOI_SOAT` Đã đóng đủ + “Kế toán đã đối soát”; “Đơn 0đ — chưa có học phí”; “Thu vượt — Khách chuyển nhiều hơn tổng đơn”. Badge trả góp: “Trả góp 2 đợt” / “Đã đóng đợt 1”.
- **Phiếu thu / đợt** (`PaymentRequest`): Chờ thu · Thu một phần · Đã đủ · Đã huỷ; “Đã thu (sale thu tay — cổng chưa thấy)”.
- **Khoản thu** (`Payment`): phía người thu “Đã ghi nhận” (nhân viên khai đã nhận tiền, chưa ai đối chiếu); phía kế toán “Chờ kế toán” / “Đã xác nhận” / từ chối; điều chỉnh sinh **bút toán** chênh lệch. Nguồn khoản: `sepay` (webhook), `backfill` (nhập liệu ban đầu), tay.
- **Hình thức lớp (coach)** trên dòng đơn: `GROUP` Lớp nhóm · Coach 1-1 (kèm riêng) ×2 · Coach 1-2 ×1,8 · Coach 1-4 ×1,5 (hệ số nhân giá/buổi).
- **Giảm giá dòng**: `SO_TIEN` (số tiền) / `PHAN_TRAM` (% giảm 1–giới hạn, mặc định trần 50%) + lý do; nhiều khoản giảm cộng dồn trên một dòng, không vượt thành tiền.
- **Phương thức thanh toán — loại**: `CASH` Tiền mặt · `BANK_TRANSFER` Chuyển khoản ngân hàng · `VNPAY` · `TINGEE` · `COD` (thu hộ khi giao) · `WALLET` Ví điện tử. Phạm vi dùng: `canBuyCourse` Khoá học offline · `canBuyPackage` Gói khoá học · `canBuyExam` Kỳ thi · `canBuyProduct` Sản phẩm · `canDeposit` Nạp ví (reserved).
- **Hoàn tiền**: `PENDING` Chờ duyệt · `APPROVED` Đã duyệt · `REJECTED` Từ chối · `PAID` Đã chi.
- **Mã đơn**: `ORD-yymmdd-NNNNNN` (vd `ORD-260917-000002`).
- **Công văn nội bộ được code tham chiếu**: SR.QD.223 (mốc các đợt cách 30 ngày), SR.QD.219 Điều 2 (chia đều tối đa 12 kỳ theo tháng), Điều 3/5 (gói cam kết 5 buổi giá cố định — không bán dạng coach/lẻ; server từ chối), Mục 5.4 (mua lẻ buổi).

### /orders — Đơn hàng
- “Theo dõi & quản lý đơn hàng khoá học, gói combo, kỳ thi”. Nút `Tạo đơn thủ công`.
- Lọc (client, `queryOrders`, phân trang cursor “tải thêm”): Từ ngày · Đến ngày · Trạng thái (“Tất cả (sổ trạng thái)” + 6) · Loại (“Tất cả loại” + 5) · Tìm “Mã đơn / SĐT / Tên KH” · `Xoá` / `Áp dụng`.
- Cột: Mã đơn | Khách hàng | Loại | Số tiền (VND) | Phương thức | Trạng thái | Người tạo | Tạo lúc | Chi tiết. Rỗng: “Chưa có đơn hàng”; lỗi “Lỗi tải đơn hàng”.

### /orders/new — Tạo đơn hàng thủ công (`?leadId=` điền sẵn khách)
- “Dùng cho khách walk-in tại trung tâm hoặc nhập tay đơn đã thoả thuận offline. **Một đơn nhận NHIỀU dòng** — phụ huynh có hai con học hai khoá thì vẫn là một đơn, một công nợ, một mã QR.”
- *Thông tin đơn*: Loại đơn * (Khoá học / Sản phẩm) · Trạng thái ban đầu (Nháp: lưu tạm · **Chờ thanh toán** (mặc định, “chọn cái này cho hầu hết đơn”) · Đã xác nhận đơn: “chỉ chọn khi tiền đã về đủ và kế toán đã đối chiếu”) · Trung tâm (— Không gán —; khi chốt từ lead thì khoá theo cơ sở của khách) · Phương thức TT * (lọc theo cơ sở & loại đơn; lỗi “Vui lòng chọn phương thức thanh toán”).
- *Khách hàng*: Tên phụ huynh * · SĐT * (09xxxxxxxx; tra `timPhuHuynhTheoSdtAction` → cảnh báo “Lead trùng số điện thoại”, hoặc “Không có lead nào mang SĐT này, nhưng SĐT này đã có N hồ sơ học viên — đã lọc sẵn ở ô Học viên…”) · Email (không bắt buộc — kênh dự phòng) · CCCD/CMND (9 hoặc 12 số) · Địa chỉ (số nhà, đường) · Tỉnh/Thành (combobox tìm) · Phường/Xã (chọn tỉnh trước; “Không tìm thấy phường/xã”).
- *Khoá học (N)* — nhiều dòng (`Thêm dòng`, `Xoá dòng n`): Học viên (tuỳ chọn; gợi ý con của lead “· chưa có hồ sơ học viên”) · Khoá học / Sản phẩm * (chọn khoá → đơn giá tự điền theo giá niêm yết; khoá chưa nạp giá → cảnh báo, nhập tay; sản phẩm hết hàng bị khoá, hiện tồn kho) · Hình thức lớp (Lớp nhóm / Coach ×hệ số — hiển thị “đ/buổi × hệ số”, nút “Áp số này vào Đơn giá”) · Số buổi mua (1–500; “Mặc định bằng tổng số buổi của khoá. Sửa khi khách mua LẺ buổi … hoặc mua theo học phần.”) · Số lượng (≥1) · Đơn giá (VND) * · Giảm giá dòng này (`Thêm khoản giảm`: loại Số tiền / % + lý do; “Chưa có khoản giảm nào — dòng này bán đúng giá.”). Lỗi “Dòng n: chưa chọn khoá học/sản phẩm”.
- *Kế hoạch thanh toán*: “Tổng đơn sau giảm giá: Xđ” · ☐ **Thu cọc trước** · Chia thành `1 lần | 2 học phần | 3 học phần | 4 học phần` hoặc N đợt (1–12) · mỗi đợt: Số tiền (đ) + Hẹn đóng (date) · “Tổng N đợt: x / tổng” (phải khớp tổng đơn) · Nhắc công nợ trước (ngày) (mặc định 14).
- Ghi chú khách hàng · Ghi chú nội bộ. Nút `Tạo đơn` (`createOrderManualAction`) → toast “Đã tạo đơn <code>”; nếu kế hoạch lỗi: “Đơn đã tạo, nhưng CHƯA lưu được kế hoạch thanh toán: … Đặt lại ở khối "Kế hoạch thanh toán" trong trang đơn.”

### /orders/:id — Chi tiết đơn hàng
- **Header**: mã đơn, badge Loại, badge trạng thái suy diễn + phụ, badge trả góp; “Tạo <giờ ngày> · <cơ sở>”; Tổng đơn; nút `Gửi email` (`sendManualOrderEmailAction`), `Đổi trạng thái` (chỉ khi có chuyển hợp lệ).
- **Công nợ đơn hàng**: “Còn thiếu X” / “Đã đóng đủ”; Tổng phải đóng · Đã thu · Còn thiếu · (Thu vượt) · Chờ kế toán xác nhận (“Sale đã thu, kế toán chưa đối soát”). Quy tắc: *“Đã thu = tiền hệ thống đã ghi nhận cho đơn này, kể cả khoản kế toán chưa đối soát — vì tiền đã về là đã về.”* Cảnh báo dữ liệu: “Đang chờ sửa dữ liệu — tiền đã về nhưng chưa gắn học viên … gắn học viên cho khoản ở màn Thanh toán.” / “đơn ghi tên con của gia đình khác”.
- **Sản phẩm (N)**: bảng Tên (tên khoá, link HV, hình thức coach · số buổi, SKU sản phẩm, mô tả, danh sách giảm “−528.000đ (5%) · <lý do>”) | SL | Đơn giá | Thành tiền; Tạm tính · Tổng giảm (theo dòng) · Tổng.
- **Công nợ theo con** (đơn nhiều con): mỗi con “còn nợ X · hạn …”, tạo đợt riêng cho con (Số tiền đợt · Hạn đóng (không bắt buộc) → `Tạo đợt` — `taoDotChoConAction`), huỷ đợt (`huyDotChoConAction`); “Các đợt đang mở đã phủ hết X còn nợ.”
- **Phiếu thu & QR theo đợt**: bảng Phiếu thu (“Thu toàn bộ đơn” / “Đợt k/N”) | Phải thu | Đã thu | Còn thiếu | Hạn | Trạng thái | QR (`Xuất QR` — `issueQrForRequest`; “Đang dùng lại mã QR còn hiệu lực”; `regenerateQr`; `Ẩn QR`, phóng to). QR VietQR kèm “Nội dung CK” — “Phụ huynh quét bằng app ngân hàng. Giữ nguyên nội dung chuyển khoản để hệ thống tự đối khớp đúng đợt.”
- **Kế hoạch thanh toán**: “Đóng một lần hoặc chia theo học phần (48 buổi = 4 học phần × 12 buổi). Công văn SR.QD.223 nêu mốc các đợt cách 30 ngày; SR.QD.219 Điều 2 cho phép chia đều tối đa 12 kỳ theo tháng.” Mỗi đợt: “Đợt k · số tiền · hẹn ngày · đã nhận X” + nhãn (“Tiền đã về — chờ kế toán” / “Sale đã thu · KT đã xác nhận”); nút `Đánh dấu đã đóng` / `Đánh dấu thu đủ` (khi thu một phần) (`markOrderInstallmentPaidAction`). *Sổ kế toán*: Đã xác nhận · Chờ xác nhận · `Mở sổ Khoản thu →`. `Thiết lập kế hoạch` / `Sửa kế hoạch thanh toán` (editor đợt; đợt đã thu giữ nguyên; validation “Tổng các phiếu phải bằng X — đang lệch Y”, “Đợt n chưa thu — chọn ngày hẹn đóng”; `Lưu kế hoạch [cọc + ]N đợt` — `recordOrderInstallmentsAction`).
- **Sidebar**: *Thông tin khách hàng* (Tên, SĐT, Email, Địa chỉ, Lead (link), Trung tâm); *Người mua trên hoá đơn* (“Xuất hoá đơn được”, `Sửa`: Họ tên người mua (mặc định theo tên KH) · Tên đơn vị · Mã số thuế · CCCD/Hộ chiếu · Địa chỉ · Email nhận hoá đơn (“Nên có”) — `luuThongTinHoaDonAction`); *Phương thức thanh toán* (`Thay đổi` — `updateOrderPaymentMethodAction`; Mã GD ngân hàng · Gateway txn ID · Thanh toán lúc); *Ghi chú* (Ghi chú nội bộ + `Lưu ghi chú` — `updateOrderNoteAction`); *Lịch sử trạng thái (N)* (từ → đến, người, lý do trong ngoặc kép).

### /payments — Thanh toán (sổ khoản thu)
- “Ghi nhận khoản thu (Sale) & xác nhận / từ chối / điều chỉnh (Kế toán)”.
- **Học phí nhập từ file Excel** (lượt backfill): “Khoản của khách chốt trước 06/08 đang ở trạng thái chờ kế toán nên chưa vào doanh thu. Xem thử trước, rồi xác nhận cả lượt.” `Xem thử` → thống kê Đang chờ kế toán (N khoản) · Sẽ xác nhận (N khoản, Vào doanh thu) · Bỏ qua (N khoản — “Xem từng khoản bị bỏ và sửa”: khoản chưa gắn ghi danh → chọn lớp “— Chọn lớp —” + `Gắn` (`ganGhiDanhChoKhoanAction`)) → `Xác nhận N khoản · X` (`bulkConfirmBackfillPaymentsAction`; “Đã xác nhận N khoản · X vào doanh thu”; lỗi ghi → “xem nhật ký ở /audit-log”).
- **Ghi nhận khoản thu** (form mở bằng nút `Ghi nhận khoản`, đóng `Đóng form`; `recordPaymentAction`): Đơn hàng * (combobox `Chọn đơn hàng`) · Số tiền * (đ) · Phương thức * (`Chọn phương thức`) · Ngày thu * (mặc định hôm nay) · Enrollment ID (tuỳ chọn) · Link chứng từ (tuỳ chọn, https://…) · Ghi chú → `Ghi nhận`.
- **PII**: “CCCD phụ huynh & địa chỉ được che mặc định (thông tin nhạy cảm). Mở xem đầy đủ cần lý do và sẽ được ghi log.” — `Xem đầy đủ` (`revealPaymentsPii`), sau đó “Đang xem đầy đủ — hành động đã được ghi log.”
- Bảng: Đơn hàng (link) | Tên bé | Lớp | Số tiền | Hình thức (cash/sepay/backfill…) | Ngày thu | Người thu | Nguồn HV (kênh lead — tooltip giải thích) | Tên PH | CCCD PH | Địa chỉ | Sale (“Đã ghi nhận” = trạng thái phía người thu) | Kế toán (Chờ kế toán / Đã xác nhận / Từ chối) | Phiếu thu (mã phiếu, chỉ có sau khi kế toán xác nhận — mở PDF in cho PH) | Thao tác.
- Thao tác kế toán: `Xác nhận` (`confirmPaymentAction`), `Từ chối` (`rejectPaymentAction`), `Điều chỉnh` (nhập số tiền mới + lý do; “Bằng số hiện tại — không có gì để điều chỉnh” / “Sẽ sinh bút toán +/−X”; `adjustPaymentAction` với `expectedUpdatedAt`), sửa khoản đang chờ (`updatePendingPaymentAction`). Khoản chưa gắn ghi danh: “kế toán chưa xác nhận được. Chốt lead thành học viên (màn Chuyển đổi) là nút xác nhận sẽ hiện ra.”

### /cong-no — Công nợ
- “Nợ học phí (đã xác nhận thu) & phân nhóm tuổi nợ quá hạn”.
- KPI: Tổng nợ (đăng ký) · Chưa quá hạn · Quá hạn 1-7 ngày · Quá hạn 8-30 ngày · Quá hạn > 30 ngày. Chú thích: “Tổng nợ (đăng ký)” tính theo ghi danh = học phí − khoản kế toán ĐÃ xác nhận; các ô tuổi nợ tính theo đợt thanh toán có hạn (chỉ đơn trả góp) — hai phạm vi khác nhau.
- Chip lọc (kèm số & tổng tiền): Tất cả · **Chưa chốt học phí** · **Đủ tiền — chờ kế toán xác nhận** · **Còn thiếu** · **Chưa đóng đồng nào** · **Thu vượt** · **Đã đóng đủ**. Cảnh báo nhóm chưa chốt: “N em chưa chốt học phí. Hệ thống không biết các em phải đóng bao nhiêu, nên cổng phụ huynh không hiện nợ…” + `Xem N em`.
- Tìm học viên hoặc khoá. Bảng (theo ghi danh): Học viên (tên, khoá) | Phải đóng | Đã thu | Kế toán xác nhận | **Thiếu — PH đang thấy** (con số thật hiện trên cổng PH — chỉ giảm khi kế toán xác nhận) | **Thiếu thật** | Trạng thái | Thao tác (`Sửa học phí` — dialog “Sửa học phí hợp đồng” (học phí cũ → mới) `Lưu học phí`, `suaHocPhiGhiDanhAction`; link `Xác nhận X` → `/payments`).

### /thieu-hoc-phi — Thiếu học phí
- “Học viên đã chốt nhưng chưa phát sinh đơn hàng, hoặc có đơn mà chưa thu đủ. Nhóm "chưa có đơn" đến từ các lượt chốt hàng loạt không nhập số tiền — hệ thống cố ý không bịa khoản thu.” KPI: Chưa có đơn (N) · Tổng còn thiếu.
- Bảng: Phụ huynh · Học viên | Cơ sở | Trạng thái (Chưa có đơn hàng / Đã thu một phần) | Học phí (“chưa có số liệu” hoặc “thiếu X — đã/tổng”) | Thao tác (`Ghi học phí` hoặc `Ghi thêm · tối đa X`).
- Dialog “Ghi học phí cũ” (`ghiHocPhiBackfillAction`): Giảm giá (đồng) + Lý do giảm giá (vd Giới thiệu · ưu đãi hè 2026 · học bổng) · **Tiền ĐÃ THU** / Số tiền đóng thêm · Ghi chú (vd “Cọc 1tr, cuối tháng đóng nốt…”) · tóm tắt Tổng phải đóng / Đã thu / Còn thiếu; chặn “Đã thu lớn hơn tổng phải đóng…”. Nút `Tạo đơn + ghi khoản` (“Tạo đơn hàng đã xác nhận + khoản thu mang dấu nhập liệu ban đầu.”) / `Ghi thêm X`.

### /nhap-giao-dich-cu — Nhập giao dịch cũ
- “Đưa học phí đã đóng trước khi lên hệ thống vào đúng hồ sơ từng em, để cổng phụ huynh thôi hiện nợ. **Khớp theo số điện thoại phụ huynh + họ tên** — mã học viên trong file và mã trên hệ thống là hai hệ đánh số khác nhau.”
- Bước 1 · Chọn file Excel (.xlsx). “File được đọc ngay trong trình duyệt; chỉ tên, số điện thoại, số tiền, ngày và ghi chú được gửi lên máy chủ. CCCD và địa chỉ trong file không rời máy bạn.” Sheet theo tháng/cơ sở (“Tháng 7 2026 CS1”…); cột nhận diện: mã hv, họ và tên học viên, tình trạng, ngày, khóa học đăng ký, cơ sở, ghi chú, Học phí, Số điện thoại.
- Bước đối chiếu (`xemThuNhapGiaoDichAction`): mỗi em → `Sẽ ghi` / `Đã có tiền — bỏ qua` (**chống cộng đôi**) / `Cần chọn` (nhiều hồ sơ — `Đã chọn tay`) / `Không tìm thấy` (không tự tạo hồ sơ); `Vẫn ghi` / “Sẽ ghi chồng — bấm để huỷ” cho dòng đã có đơn. **Gán sale phụ trách** bắt buộc (“Chưa gán sale cho: …”). Ghi (`ghiNhapGiaoDichAction`): **mỗi em một đơn + một khoản cho mỗi đợt (giữ đúng ngày đóng)**, khoản ở trạng thái chờ kế toán.

### /bien-dong-so-du — Biến động số dư (đối soát ngân hàng)
- “Tiền về tài khoản → cổng báo về → hệ thống ghi giao dịch và **rót vào phiếu thu** của đơn. … dòng *Cần xử lý* là giao dịch chưa rót được vào phiếu nào (sai nội dung CK, không tra ra đơn) — mở đơn và xử lý tay.”
- Tab: `Tất cả` · `Cần xử lý (N)` (`?status=unmatched`) · `Đã khớp` (`matched`). Tìm theo mã đơn / nội dung CK / mã tham chiếu / số tiền / tên khách / cổng.
- Bảng giao dịch: Thời gian | Số tiền | Nội dung CK (+ ref) | Cổng (SEPAY…) | Trạng thái (Đã khớp / Cần xử lý / Bỏ qua) | Rót vào phiếu thu (“ORD-… · Đợt k · x / y (đã đủ) · <KH>” hoặc lý do “Không tra ra phiếu thu. orderCode=…, VA=…, ref=…”) | Xử lý:
  - `Gắn vào đơn` (`timDonDeGan` → chọn đơn `taiChiTietDonDeGan` → “Rót Xđ vào đơn này” / “Rót vào đơn”; đơn nhiều con: “Xđ cho từng con” — Khớp đủ / Đang thừa / Còn thiếu, `Ghi phân bổ` (`ganGiaoDichTheoConAction`), tạo đợt tại chỗ (`taoDotChoConTaiChoAction`); `← Đổi đơn`; kết quả có thể “Đơn đã xác nhận + cấp TK phụ huynh”).
  - `Không phải học phí` → `Xác nhận bỏ qua` (`boQuaGiaoDich`).
  - `Gỡ gắn` → `Xác nhận gỡ` (`goGanGiaoDichAction`).
- **Tiền thừa chưa xử lý** (chỉ xem): “Tiền còn dư sau khi đã rót hết các đợt của đơn. Hệ thống không tự hoàn và không tự trừ sang đơn khác — kế toán quyết rồi ghi nhận ở nơi xử lý tương ứng.”
- **Nhật ký webhook SePay (lịch sử)**: 100 dòng gần nhất — Thời gian | Số tiền | Nội dung CK | Đơn khớp | Kết quả (“Đã khớp phiếu thu”…) | Ghi chú; không còn là nguồn đối soát chính.

### /hoan-tien — Hoàn tiền
- “Yêu cầu hoàn tiền theo vòng đời (rút học / chuyển lớp / hủy lớp). **Đề xuất = Σ đã thu − số buổi đã học × đơn giá.**”
- Tab trạng thái `?status=PENDING|APPROVED|REJECTED|PAID|ALL`.
- Bảng: Học viên / Lớp | Lý do | Đã thu | Buổi (học/tổng) (“Thiếu/Chưa chốt N buổi”, “Giải thích sổ buổi”) | Đề xuất hoàn (“chưa tính được”) | Trạng thái | Thao tác (`Duyệt` → `Xác nhận duyệt` — `approveRefundAction`; `Từ chối` — `rejectRefundAction`; yêu cầu “quyền duyệt thu chi”).
- Tạo đề xuất cho ca chưa có (`taoDeXuatHoanTienAction`, `Tạo đề xuất` → `Xác nhận tạo`; “ca khác đã học hết khoá, không phải hoàn”).

### /payment-methods — Phương thức thanh toán
- `/payment-methods` **redirect** → `/cau-hinh-van-hanh?tab=phuong-thuc-tt` (tab trong Cấu hình vận hành); `/payment-methods/new` = 404 (tạo qua nút `Thêm phương thức` trong tab).
- Mô tả: “Tiền mặt, chuyển khoản, cổng online — khai theo từng cơ sở hoặc dùng chung cho cả hệ thống. Phương thức gắn cơ sở chỉ hiện ở đơn của cơ sở đó; phương thức dùng chung (cột Cơ sở để trống) hiện ở mọi cơ sở, kể cả cơ sở mở sau này. Tài khoản ngân hàng dựng mã QR khai ngay trong từng phương thức.”
- Bảng: Thứ tự | Mã | Tên | Loại | Cơ sở (hoặc “Dùng chung”) | Cho phép (Khoá, Gói, Thi, Sản phẩm) | Trạng thái (Hoạt động / Tắt) | Thao tác (`Sửa`, `Tắt`/`Bật`). Dữ liệu hiện có: `BANK_CS2`, `BANK_HO`, `BANK_TRANSFER` (tắt), `CASH`.
- **Form** (`/payment-methods/:id/edit`; `createPaymentMethodAction`/`updatePaymentMethodAction`): *Thông tin chung*: `code` Mã * (VD CASH, BANK_CS1; readonly khi sửa) · `name` Tên * · Loại * · Cơ sở áp dụng * (“Dùng chung (mọi cơ sở)” hoặc 1 cơ sở) · `description` · `image` URL logo · *Cho phép thanh toán cho*: 5 checkbox · *Tài khoản nhận tiền* (loại chuyển khoản): `bankBin` Mã ngân hàng (BIN) * (6 số) · `bankAccountNumber` Số tài khoản * · `bankAccountName` Chủ tài khoản * · `bankName` · `bankBranch` (“Mọi đơn của <cơ sở> chọn phương thức này sẽ nhận tiền về tài khoản trên.”) · (loại VNPAY/TINGEE: cấu hình gateway JSON — “Sprint 5.6.5 sẽ tích hợp thực tế”) · `displayOrder` · `isActive` Kích hoạt.
- Quy tắc chung trang Cấu hình vận hành: mỗi lần lưu phải **ghi lý do** → nhật ký kiểm toán; dòng tam giác vàng = ảnh hưởng rộng/phát sinh chi phí; cấu hình áp toàn hệ thống. Các tab khác: Thông báo đẩy, Tin Zalo, Đăng nhập, Học viên, Lớp & giáo viên, Chấm công, Khách hàng, Thanh toán, Nhắc tự động, Công ty, Nâng cao, Hoa hồng.

---

## D. Nhân sự & Giáo viên

### Enum dùng chung
- **Phòng ban** (`Department`): `BAN_GIAM_DOC` Ban Giám đốc · `DAO_TAO` Phòng Đào tạo · `MARKETING` · `KINH_DOANH` Kinh doanh / Sale · `IT` Công nghệ · `HANH_CHANH_NHAN_SU` Hành chính - Nhân sự · `KE_TOAN` · `TUYEN_SINH` · `GIAO_VU` · `GIANG_DAY`.
- **Trạng thái công việc** (`EmploymentStatus`): `ACTIVE` Đang làm · `ON_LEAVE` Tạm nghỉ · `RESIGNED` Đã nghỉ · `TERMINATED` Cho nghỉ.
- **Loại hợp đồng**: `FULLTIME` Toàn thời gian · `PARTTIME` Bán thời gian · `INTERN` Thực tập sinh · `FREELANCE` Cộng tác viên; import còn nhận `THU_VIEC`, `CHINH_THUC_XAC_DINH`, `CHINH_THUC_KHONG_XAC_DINH`.
- **Hồ sơ GV**: Ngạch `TRAINEE` Tập sự · `JUNIOR` · `ADVANCED` · `SENIOR` · `EXPERT`; trạng thái dạy `ACTIVE` Đang dạy · `ON_LEAVE` Tạm nghỉ · `INACTIVE` Ngưng; vai trong lớp `teacher` GV chính / `assistant` Trợ giảng.
- **Mã NV**: `SR.NV.NNN` (tự đề xuất số kế tiếp), dữ liệu cũ có `CS1.NV.002`.
- **Kiểu phân công vị trí**: `PRIMARY` Chính · `CONCURRENT` Kiêm nhiệm · `DELEGATED` Uỷ quyền.
- **Bộ vai trò (role)** gán cho vị trí: Trợ giảng · Kiểm toán đào tạo (chỉ đọc) · Kế toán cơ sở · Quản lý lớp học · Nhân sự cơ sở · Quản lý cơ sở · Tư vấn & CSKH cơ sở · Kế toán Hội sở · Nhân sự Hội sở · Marketing Hội sở · Sale Hội sở (phiếu mình nhập) · Phụ huynh · Quản trị tối cao · Giáo viên · Đào tạo (toàn LMS).
- **Loại đơn từ** (`WorkRequestKind`), nhóm:
  - *Liên quan lớp học* (chỉ GV có lớp): `CLASS_CHANGE` Đổi lớp dạy · `SUB_TEACH` Dạy thay · `CLASS_OFF` Nghỉ buổi dạy.
  - *Ca làm & chấm công*: `SHIFT_SWAP` Đổi ca · `OT` Tăng ca (OT) · `LATE_EARLY` Đi muộn / Về sớm · `TIMESHEET_FIX` Chỉnh công.
  - *Nghỉ phép & khác*: `LEAVE` Nghỉ phép · `REMOTE` Làm từ xa · `BUSINESS_TRIP` Đi công tác.
  - Trạng thái đơn: `PENDING` Chờ duyệt · `APPROVED` Đã duyệt · `REJECTED` Từ chối (+ cờ “Nộp muộn”, “Áp thất bại”).
- **Loại nghỉ phép**: Nghỉ phép năm · Nghỉ không lương · Nghỉ kết hôn · Nghỉ con kết hôn · Nghỉ ma chay · Nghỉ hưởng BHXH (ốm) (không lương) · Nghỉ thai sản (không lương) · Nghỉ bù.
- **Mã ca** (danh mục dùng chung, 1 mã làm việc = 1 công/ngày; X, P = 0 công):

| Mã | Tên | Giờ | Giờ KH | Công |
|---|---|---|---|---|
| CG | Ca gãy | 09:00–11:30, 14:00–17:45 | 6h15 | 1 |
| CS | Ca suốt (nghỉ 16:30–17:00 tính giờ làm) | 14:00–21:00 | 7h00 | 1 |
| CCT | Ca cuối tuần | 07:45–11:30, 13:45–17:45 | 7h45 | 1 |
| CGD | Ca gãy dài | 09:00–11:30, 13:30–19:15 | 8h15 | 1 |
| D1 / D2 | Làm tại Cơ sở 1 / 2 (ô con trỏ — gộp vào khối cơ sở đó; quét tuỳ chọn) | — | — | 1 |
| HC | Giờ hành chính (nơi làm theo phân công HO) | 08:00–11:30, 13:30–17:30 | 7h30 | 1 |
| 12 / 21 | Sáng CS1·Chiều CS2 / Sáng CS2·Chiều CS1 | như HC | 7h30 | 1 |
| 2C | Cả 2 cơ sở (bất kỳ cơ sở nào) | như HC | 7h30 | 1 |
| S / C / T | Ca sáng 07:45–11:30 / chiều 13:45–17:30 / tối 17:15–21:00 | | 3h45 | 0.5 |
| SC / ST | Sáng + chiều / Sáng + tối | | 7h30 | 1 |
| CT | Chiều + tối (nghỉ 16:30–17:30 tính giờ làm) | 13:45–21:00 | 7h15 | 1 |
| SCT | Sáng + chiều + tối | | 11h00 | 1.5 |
| LD | Linh động (không cần đến; quét tuỳ chọn) | — | — | 1 |
| LDGV | Linh động GV | | | |
| NG | Công tác ngoài | 08:00–11:30, 13:30–17:30 | 7h30 | 1 |
| X | Nghỉ | — | — | 0 |
| P | Nghỉ phép | — | — | 0 |

  Thuộc tính mã ca: Loại (Có giờ · Phải quét / Chỉ nơi làm · Quét tuỳ chọn / Linh động / Nghỉ), các đoạn giờ (ca gãy nhiều đoạn, đoạn “nghỉ giữa giờ” có/không tính công), Giờ KH, Công, Nơi làm (Cơ sở của đơn vị / Tại CSx / Theo phân công (HO) / Bất kỳ cơ sở / Linh động / Công tác ngoài), Phạm vi (Dùng chung — chỉ HO sửa / riêng cơ sở), Trạng thái (Đang dùng / Đã ngưng). Ký hiệu ô lưới: `T` sửa tay, `Đ`/`N` sinh từ đơn đã duyệt, `—` trống.
- **Cờ chấm công**: Không có lượt · Thiếu lượt ra · Ra không có vào · Thiếu buổi sáng · Thiếu buổi chiều · Đi muộn · Về sớm · Thiếu giờ · Đến sát giờ · Ngoài vùng · Thiếu GPS · Chưa toạ độ · Sai nơi làm · Chấm ngoài lịch · Bấm trùng · Vượt trần lượt · Làm ngày lễ · GPS kém · Chỉnh tay (đơn duyệt). Kết luận rà: “Đã ghi nhận có lý do”, “Đã gỡ kết luận”, “Đã ghi đè công”, “Đã bỏ ghi đè”, “Vắng có lý do”.

### /teachers — Giáo viên
- “N giáo viên · Quản lý toàn bộ nhân sự ở mục Nhân sự”. Tìm `q` (tên, email).
- Cột: Tên (+ email) | Cơ sở | Ngạch | Loại HĐ | Trạng thái (“Chưa có hồ sơ” nếu chưa lập hồ sơ GV) | Lớp (số lớp) | Tải / tuần (“N buổi · Xh”).

### /teachers/:id — Hồ sơ giáo viên
- *Thông tin cơ bản* (read-only): Email · Mã NV · Chức danh · SĐT · Cơ sở.
- *Hồ sơ chuyên môn* (`updateTeacherProfile`): Ngạch · Loại hợp đồng (FULLTIME/PARTTIME) · Trạng thái · Giới thiệu / ghi chú chuyên môn · **Khoá dạy được (N)** (chip chọn nhiều khoá) → `Lưu hồ sơ`.
- *Lớp đang phụ trách*: nhóm “GV chính (N)” / “Trợ giảng (N)” (mỗi lớp có nút gỡ — `unassignClassFromTeacher`); gán lớp: select lớp (cùng cơ sở) + vai (GV chính / Trợ giảng) → `Gán` (`assignClassToTeacher`).
- *Lịch dạy trong tuần*: theo thứ CN, T2…T7, các khung “HH:mm–HH:mm · mã lớp · tên lớp”; **phát hiện xung đột giờ** (“N xung đột giờ”, dòng cảnh báo “T7: "<lớp A>" trùng giờ "<lớp B>"”).
- *Tải giảng dạy / tuần*: Lớp đang dạy · Buổi / tuần · Giờ / tuần.
- *Số buổi đã dạy trong tháng*: chọn `month` (GET) → “Đã dạy N buổi trong YYYY-MM (chỉ tính buổi đã diễn ra)” + danh sách “Thứ, dd/MM · lớp”.
- *Đánh giá giáo viên*: điểm phụ huynh trung bình (N đánh giá, từ các lớp GV phụ trách); “Đánh giá nội bộ / dự giờ (N)”; form “Thêm đánh giá nội bộ”: Điểm (1–5 sao) + Nhận xét dự giờ (**bắt buộc**) → `Ghi đánh giá` (`addTeacherReview`).

### /nhan-su — Quản lý nhân sự
- “N nhân sự · <trạng thái>”; `Import Excel`, `Thêm nhân sự`.
- Lọc (GET): `q` (tên, SĐT, email, mã NV) · `department` · `centerId` (gồm Hội sở) · `status` (ALL / ACTIVE mặc định / ON_LEAVE / RESIGNED / TERMINATED). Chip nhanh theo phòng ban kèm số lượng.
- Cột: Họ tên (+ chức danh, “↑ <quản lý trực tiếp>”) | Email | SĐT | Cơ sở (vd “HO (Hội sở)”) | Bộ phận | Vai trò (có thể nhiều) | Trạng thái | Ngày vào làm | Hành động (sửa `/nhan-su/:id/edit`).

### /nhan-su/new và /nhan-su/:id/edit — Hồ sơ nhân sự
- *Thông tin cơ bản*: Mã nhân viên * (tự đề xuất “Mã NV tự động đề xuất: SR.NV.017”) · Họ tên * · **Chức danh \*** · Phòng ban * · Email công ty · Ngày vào làm · Avatar (≤10MB) · Bio (Markdown) · Trạng thái công việc · ☑ Đang làm việc (legacy) · ☐ Hiển thị public · CEO Quote auto-link · ☐ **Miễn tính công (chấm công)**.
- *Liên hệ & HR*: Số điện thoại · ☐ Nhân viên HO (Hội sở) · Đơn vị làm việc (CS1/CS2/Hội sở) · Ngày sinh · Giới tính · Loại hợp đồng · Quản lý trực tiếp (danh sách “tên — chức danh”) · CCCD / CMND (12 hoặc 9 số) · Địa chỉ · Liên hệ khẩn cấp (Tên - Quan hệ - SĐT) · Ghi chú nội bộ · **💰 Lương (chỉ HR / Accountant / SUPER_ADMIN thấy)**: Bậc (SR.QD.200, 1–9) · Mức (1–5) · Lương đóng BHXH (VNĐ) · Display order.
- *Chuyên môn giảng dạy*: Môn dạy (danh sách) · Chứng chỉ chuyên môn (danh sách).
- Trang sửa thêm *Tài khoản đăng nhập*: Email · Vai trò (nút `Đổi vai trò`) · Trạng thái (Hoạt động) · Lần đăng nhập cuối · Ngày tạo · link `Sửa tài khoản` (`/users/:id/edit`), `Đổi mật khẩu` (`/users/:id/reset-password`), `Phân quyền` (`/users/:id/permissions`).
- Nút `Tạo nhân sự` / `Cập nhật`, `Huỷ`.

### /nhan-su/import — Import nhân viên
`employeeCode` bắt buộc, là khoá upsert (trùng = CẬP NHẬT chỉ những cột có trong file; mới = TẠO MỚI, cần đủ `fullName`, `jobTitle`, `department`). **Ô trống = GIỮ NGUYÊN**, cột không có trong file không bị đụng; muốn xoá trường phải sửa trên hồ sơ. Thiếu cột `status` → giữ nguyên trạng thái. `contractType` theo enum (7 giá trị). `centerSlug`: thiếu cột = giữ nguyên; sai slug → bỏ dòng. `managerCode` = employeeCode của quản lý (phải tồn tại trước). `subjects`/`certifications` phân tách dấu phẩy. Avatar không import. Mẫu `/templates/mau-nhan-vien-v2.xlsx`; ≤10MB, ≤5000 dòng.

### /nhan-su/vi-tri — Vị trí công việc (phân quyền theo vị trí)
- Nguyên tắc: “**Quyền gắn vào vị trí, không gắn vào người.** Người nghỉ thì gỡ phân công — vị trí giữ nguyên bộ quyền cho người kế nhiệm. Cây báo cáo (“báo cáo cho”) là cây riêng, dùng cho luồng duyệt, không dùng để tính phạm vi dữ liệu.”
- *Thêm vị trí*: Tên vị trí * (VD Quản lý cơ sở 1) · Đơn vị trực thuộc * (`CS1 · Cơ sở 1`, `CS2 · Cơ sở 2`, `DANANG · Khối Đà Nẵng`, `HO · Hội sở`) · Báo cáo cho (vị trí khác) · ☐ Là vị trí quản lý · **Bộ vai trò** (chip chọn nhiều — người giữ vị trí hưởng đủ các vai) → `Tạo vị trí`. Bảng: Vị trí | Đơn vị | Bộ vai trò | Báo cáo cho | Đang giữ | Thao tác.
- *Phân công người vào vị trí*: “Mỗi người có **đúng một** phân công Chính còn hiệu lực; Kiêm nhiệm và Uỷ quyền không giới hạn. Hết hạn là quyền tự tắt ở lần truy cập kế tiếp.” Form: Người * · Vị trí * · Kiểu (Chính/Kiêm nhiệm/Uỷ quyền) · Hiệu lực từ * (mặc định hôm nay) · Đến ngày (trống = vô thời hạn) · Ghi chú (số quyết định, lý do…) → `Phân công`. Bảng “Đang hiệu lực” (+ `Xem cả lịch sử`): Người | Vị trí | Kiểu | Hiệu lực | Ghi chú | Thao tác.
- *Điều động tác nghiệp*: “Nơi tác nghiệp tách khỏi nơi trực thuộc: giáo viên biên chế Hội sở được điều xuống cơ sở dạy mà không đổi biên chế, không đổi vai trò. Điều động chỉ mở phạm vi dữ liệu của cơ sở đó, trong đúng khoảng thời gian ghi ở đây — hết hạn là mất truy cập ngay.” Bảng: Người — vị trí | Nơi tác nghiệp | Lý do | Hiệu lực | Ghi chú | Thao tác.

### Module Chấm công — điều hướng chung
Tab con (giữ `coSo` + `ky=YYYY-MM`): **Bảng công ngày** (`/cham-cong`) · **Lưới phân ca** (`/cham-cong/phan-ca`) · **Kỳ công & chốt** (`/cham-cong/ky-cong`) · **Nội quy & thống kê** (`/cham-cong/thong-ke`) · **Công dạy** (`/cham-cong/cong-day`) · **Đơn từ** (`/don-tu`) · **Đối soát** (`/cham-cong/doi-soat`) · **Cấu hình** (`/cham-cong/danh-muc-ca`, `/cham-cong/diem-cham`). Chọn khối: CS1 / CS2 / Hội sở. Dải tháng “Tháng MM/YYYY · Đang mở/Đã chốt · Công chuẩn N”. Nút đầu trang `Màn hình QR`, `Import lịch`. Bài hướng dẫn `/huong-dan/nhan-su-giao-vien`.

### /cham-cong — Bảng công ngày
- Nguyên tắc: “**Công đếm theo lịch đã xếp; lượt quét chỉ sinh cờ để quản lý rà.**” Công được tính theo ca trong lưới phân ca — lượt quét vào/ra chỉ gắn cờ (đi muộn, thiếu lượt, ngoài vùng…), **không tự trừ công**. Ngày công tính theo giờ Việt Nam.
- Dải ngày trong tháng (số đỏ = số người có cờ cần rà). KPI: Có ca (N người) · Đã quét · Cờ cần rà · Chờ tính (“Máy tính lại sau vài phút”) · Đã ghi đè.
- Lọc: `loc` = Tất cả | Chỉ có cờ (`co`) | Chưa quét (`chuaquet`) | Đã ghi đè (`ghide`); `q` tên; `date`.
- Bảng: Nhân sự | Ca (mã) | Quét (“HH:mm → HH:mm · số lượt”) | Giờ / KH | Công | Cờ | Chi tiết.
- Bấm tên → panel chi tiết: từng lượt quét (nguồn: máy quét / qua đơn / sửa tay; người duyệt, lúc), giờ chuẩn ca, nghỉ giữa giờ; hành động **ghi đè công** (nhập số công + **Lý do** — “Nhấn Enter để lưu”; `setDayOverrideAction`; mọi lần ghi đè lưu vết), đánh dấu vắng có lý do (`setDayAbsenceAction`), sửa giờ quét tay (`suaGioQuetTayAction`), kết luận cờ. Người thuộc khối khác: “thuộc khối X — chỉ xem”.

### /cham-cong/checkin — Chấm công (nhân viên)
“Cần quét mã QR tại quầy. Mở từ menu thì không chấm được — phải quét mã. Dùng camera điện thoại quét mã QR dán tại quầy (hoặc chiếu trên màn hình quầy) của cơ sở.” Link `Về lịch ca của tôi`. (Quét QR → trang checkin với token + GPS.)

### /cham-cong/man-hinh — Màn hình QR
- Chọn cơ sở (`centerId`) → `Trình chiếu` (toàn màn hình, không menu, không hiện tên; Esc/Thoát để quay lại).
- Quy tắc: **Mã QR cố định** (= mã in dán ở quầy; “đời khoá N”), ảnh chụp vẫn quét được — thứ chặn người ở xa là **định vị**: điểm chấm công đã khai toạ độ thì quét ngoài bán kính bị từ chối. TV rớt mạng vẫn giữ mã cuối.
- Khối *Điểm chấm công*: Tên điểm · Kiểm định vị (Bật · bán kính 100m) · Mã QR (Cố định · đời khoá 1) · link `Sửa điểm chấm công` (`/cham-cong/diem-cham`).
- *Lượt chấm hôm nay*: Nhân sự | Giờ | Vào/Ra | Cờ.

### /cham-cong/lich-ca — Lịch ca của tôi (self-service)
- Tab cá nhân: `Lịch ca` · `Đơn của tôi` · `Chấm công`. “Ca do Quản lý xếp trên lưới phân ca. Muốn đổi thì nộp đơn — duyệt xong lịch đổi ngay.” Nút `Nộp đơn`. Điều hướng tháng `?month=`.
- *Tổng hợp tháng (TẠM TÍNH tới hôm nay, số còn đổi tới khi Kế toán chốt kỳ)*: Công tháng / công chuẩn (chưa nhân hệ số lương) · Ngày đã đi làm / ngày có ca · Đi muộn & Về sớm (số lần, tổng phút) · Ngày nghỉ phép. *Chi tiết tháng*: Ngày nghỉ tách loại (Nghỉ phép P — có lương/không lương; Nghỉ theo ca X; Nghỉ lễ) · Giờ làm (Thực tế / Theo kế hoạch / Chênh lệch; Ngày đi công tác — đủ cặp vào/ra) · Ngày có vấn đề (Thiếu lượt vào/ra; Chưa chấm ngày nào; Quản lý chỉnh tay công; Tự chỉnh) · Đơn của tôi (Giờ thêm qua đơn duyệt; chờ duyệt; bị từ chối).
- Lịch ngày: ô công có chữ “ghi đè” = Quản lý sửa tay; ngày có ổ khoá = kỳ đã chốt (phải qua đơn chỉnh công); cờ “Không có lượt”/“Thiếu lượt ra” → nút **Nộp đơn chỉnh công** ở cột cuối. Người Hội sở / diện miễn chấm công không có lịch ca.

### /cham-cong/phan-ca — Lưới phân ca
- Lưới Nhân sự × ngày (1..30, kèm thứ) + cột Công, Nghỉ; tóm tắt: Người trong khối · Ô đã xếp x/y · Ô sửa tay · Ô từ đơn đã duyệt. Dòng cuối “Có ca” đếm theo ngày.
- Bấm ô → đổi mã ca / xoá ca / kèm lý do — người đó nhận thông báo ngay. Nút `Sinh lưới từ khung` (từ **Khung ca tuần**), `Import Sheet`.
- Quy tắc: ô sửa tay (T) và ô từ đơn đã duyệt (Đ, N) **được giữ nguyên** khi sinh lưới/import lại. Ô viền đứt + mũi tên = ca chịu công ở khối khác (sửa ở khối đó). Cột Công đếm ô có mã trừ X và P; cột Nghỉ đếm X và P. Ngày nền xám = nghỉ tuần theo cấu hình cơ sở; chữ đỏ = ngày lễ.

### /cham-cong/phan-ca/import — Import lịch phân ca
- Wizard 3 bước: **1. Đọc file** → **2. Ánh xạ & phạm vi** → **3. Kết quả**. “Đọc file Sheet (.xlsx) → soát ánh xạ tên → áp khung ca tuần và lưới tháng.”
- File tải từ Google Sheet (Tệp → Tải xuống → .xlsx), ≤2MB; hệ thống đọc tab **KHUNG CA CỐ ĐỊNH** và các tab **LỊCH Tmm-yyyy**.
- Quy tắc: mỗi tháng làm một lần; xác nhận tên ai là ai (lần sau **tự nhớ ánh xạ**); ca do đơn đã duyệt hoặc quản lý sửa tay **không bị file đè**; chạy lại cùng file an toàn (idempotent — chỉ ghi phần khác); hàng thuộc cơ sở không được phân quyền bị bỏ qua và đếm riêng.
- *Lần import gần đây*: thời gian · người · kỳ · “N ô mới · N huỷ · N giữ tay · N ô khung ca”.

### /cham-cong/ky-cong — Kỳ công & chốt
- Tiêu đề “Kỳ công tháng MM/YYYY — <khối>”. “Công = tổng công ngày (đã tính ghi đè). Buổi dạy = buổi lớp đã hoàn thành do người đó thực dạy.” Nút `Tính lại`, `Xuất Excel (bản tạm)` (`/api/admin/cham-cong/export`), `Chốt kỳ`.
- Quy tắc: **Chốt kỳ đóng băng công** của cả khối trong tháng — sau chốt, lượt quét và ô lưới không đổi được số, **chỉ cấp Hội sở mở lại**. Rà hết “việc còn dang dở” rồi `Tính lại` trước khi chốt. Cột “Buổi ở cơ sở” đếm buổi của lớp thuộc cơ sở; màn Công dạy đếm theo người — lệch nhau ở ca dạy chéo là ĐÚNG.
- *Việc còn dang dở trước khi chốt*: N ngày còn cờ chưa rà · N ngày có người không quét lượt nào (công đang tính 0) · N đơn chờ duyệt (duyệt sau khi chốt sẽ không vào kỳ này).
- *Công chuẩn & trạng thái kỳ*: Trạng thái kỳ (Đang mở/Đã chốt) · Số công chuẩn (0–31, bước 0.5; mặc định = số ngày trong tháng − ngày nghỉ tuần − ngày lễ, vd “30 ngày − 6 ngày nghỉ tuần/lễ”) · Ghi chú công chuẩn (≤200) → `Lưu` (để trống = tự tính lại). “Bản tạm dựng lúc …”.
- KPI: Tổng công cả kỳ · Ngày có cờ · Buổi dạy ở cơ sở · Người có công.
- Bảng: Nhân sự (tên, mã NV) | Công | Giờ | Hậu kiểm | Buổi ở cơ sở | Công | KH | Nghỉ CL | Lễ | HC | Làm / KH | Muộn | Sớm | Không lượt | Ghi đè | Cờ.

### /cham-cong/danh-muc-ca — Mã ca (Cấu hình)
- Tab: Tất cả · Đang dùng · Đã ngưng; `Thêm mã ca`; mỗi dòng `Ngưng`/kích hoạt. Cột: Mã | Tên | Loại | Giờ | Giờ KH | Công | Nơi làm | Phạm vi | Trạng thái | Hành động.
- Quy tắc: ca gãy khai nhiều đoạn; nghỉ giữa giờ có tính công thì kẹp một đoạn “nghỉ giữa giờ”. **Sửa một mã KHÔNG đổi lịch đã xếp** (ô cũ giữ giờ cũ) — muốn đổi cả tháng thì tạo mã mới rồi xếp lại. Mã “Dùng chung” chỉ Hội sở sửa; mã riêng cơ sở chỉ hiện với người cơ sở đó.

### /don-tu — Duyệt đơn từ (quản lý)
- “Đơn của nhân sự gửi tới cơ sở chịu công. **Duyệt là áp ngay lên lịch và công.**” Chọn khối (Tất cả khối / CS1 / CS2 / Hội sở), tab trạng thái (Chờ duyệt / Đã duyệt / Từ chối; `?status=`).
- KPI: Chờ duyệt · Nộp muộn (nộp sát ngày áp dụng) · Chờ > 2 ngày (quá hạn xử lý) · Áp thất bại (lần duyệt trước không áp được).
- Bảng: Người nộp | Loại (+ cờ Nộp muộn) | Áp dụng (ngày, “quá 2 ngày”) | **Thay đổi** (xem trước hệ quả, vd `S → CG`, `13:55→13:55 ⇒ 14:00→21:00`) | Cơ sở | Tuổi đơn | Trạng thái | Mở chi tiết đơn.
- Quy tắc: duyệt áp hệ quả **ngay trong cùng thao tác** (đổi mã ca trên lưới, ghi mã nghỉ, ghi mốc giờ chỉnh tay, huỷ buổi dạy hoặc gán người dạy thay). Nếu áp không được (lớp đã điểm danh, kỳ công đã khoá…) → đơn **tự quay lại Chờ duyệt** kèm lý do — không bao giờ có đơn “đã duyệt” mà lịch chưa đổi. **Từ chối bắt buộc nhập lý do** (người nộp đọc nguyên văn).

### /don-tu/cua-toi — Đơn của tôi (+ form tạo đơn)
- “Đổi ca, nghỉ phép, chỉnh công (quên quét), tăng ca, đi muộn/về sớm, công tác.” Tab: Tất cả / Chờ duyệt / Đã duyệt / Từ chối (kèm số). Cột “Phản hồi” hiển thị “Lần duyệt gần nhất không áp được: …”.
- Quy tắc: đơn gửi tới Quản lý của **cơ sở chịu công ngày đó** (người Hội sở tự chọn cơ sở nhận đơn). Nộp trước hạn báo trước; nộp muộn vẫn gửi được nhưng mang cờ **Nộp muộn**. Duyệt xong lịch ca & công ngày đổi ngay, người nộp nhận thông báo.
- **Form “Tạo đơn mới”** (dialog; `submitRequestAction`; lỗi “Chọn cơ sở nhận đơn”, “Nhập lý do”, “Chọn mã ca mới”, “Nhập giờ vào hoặc giờ ra đề nghị”). Trường chung: *Cơ sở nhận đơn \** (chỉ người HO — “Bạn thuộc Hội sở — chọn Quản lý cơ sở nào sẽ duyệt.”; người cơ sở thấy dòng “Đơn gửi tới: <cơ sở> (theo ca ngày áp dụng / cơ sở nhà). Nộp trước ít nhất N ngày; nộp muộn vẫn được nhưng có cờ.”) · *Lý do \**.

| Loại | Trường riêng |
|---|---|
| Đổi lớp dạy / Nghỉ buổi dạy | Lớp * (lớp của tôi) · Ngày buổi dạy * |
| Dạy thay | Lớp * · Ngày buổi dạy * · Người dạy thay (tuỳ chọn, “- Chưa chỉ định -”) |
| Đổi ca | Ngày đổi ca * · Mã ca mới của tôi * (danh mục mã ca) · Người nhận ca (tuỳ chọn) (+ mã ca mới cho người nhận) |
| Tăng ca (OT) | Ngày * · Từ giờ – Đến giờ |
| Đi muộn / Về sớm | Ngày * · Hình thức (Đi muộn / Về sớm) · Giờ |
| Chỉnh công | Ngày * · Giờ vào đề nghị · Giờ ra đề nghị (ít nhất một) — “Quên quét thì điền mốc bị thiếu. Duyệt xong hệ thống ghi mốc "chỉnh tay" và tính lại công ngày đó — lượt quét thật vẫn giữ nguyên để đối chiếu.” |
| Nghỉ phép | Từ ngày * · Đến ngày · Loại nghỉ (8 loại) · Người làm thay (tuỳ chọn) |
| Làm từ xa | Từ ngày * · Đến ngày |
| Đi công tác | Từ ngày * · Đến ngày · Nơi đến (VD: Cơ sở 2) |

  Payload: `{kind, fromDate, toDate, startTime, endTime, classId, className, targetUserId, requesterNewTemplateId, targetNewTemplateId, leaveTypeId, requestedInAt, requestedOutAt, chosenCenterId, detail, reason}`.

### /jobs — Tuyển dụng
- “N tin đăng”; `Tạo JD mới`. Tab `status`: Tất cả · Đang tuyển (`OPEN`) · Bản nháp (`DRAFT`) · Đã đóng (`CLOSED`) · Tạm dừng (`ON_HOLD`).
- Cột: Tiêu đề | Phòng ban | Trạng thái | Chỉ tiêu | Hạn nộp | Người tạo | Cập nhật | (thao tác).

### /jobs/new — Tạo tin tuyển dụng
- *Thông tin cơ bản*: `title` Tiêu đề * · `slug` Slug (URL) * (URL `/tuyen-dung/...`) · `department` Phòng ban * (`marketing-sale` Marketing & Tuyển sinh · `dao-tao` Đào tạo & Giáo viên · `marketing` · `it` Công nghệ thông tin · `van-hanh` Vận hành & Hành chính · `ke-toan` Kế toán & Tài chính · `rd` R&D & Sản phẩm) · `location` Địa điểm * (`danang` Đà Nẵng · `online-hybrid` · `remote`) · `type` Hình thức * (`fulltime` · `parttime` · `intern` Thực tập · `contract` Hợp đồng dự án) · `workingHours` Giờ làm việc · Yêu cầu kinh nghiệm (Không yêu cầu · `ENTRY` Mới ra trường · `JUNIOR` 1-2 năm · `MID` 3-5 năm · `SENIOR` 5+ năm · `EXPERT` 10+ năm).
- *Nội dung tin tuyển*: `description` Mô tả tổng quan * · Trách nhiệm công việc (list) · Yêu cầu ứng viên (list) · Quyền lợi (list).
- *Lương & Chỉ tiêu*: `salaryMin` · `salaryMax` (VND) · `salaryNote` (vd Thoả thuận theo năng lực) · `openings` Số chỉ tiêu (≥1) · `closesAt` Hạn nộp CV.
- *Thông tin liên hệ*: `contactEmail` · `contactPhone`. *Trạng thái*: `status` (DRAFT/OPEN/CLOSED/ON_HOLD). Nút `Tạo JD` / `Huỷ`.

### /evaluations — Đánh giá & Khảo sát
- “Phiếu đánh giá giáo viên và khảo sát cơ sở. Form builder (4 loại câu hỏi) cho đánh giá GV của học viên và khảo sát cơ sở của phụ huynh.”
- **Mẫu form** (`Tạo form` — `createFormAction`; `Kích hoạt`/`Lưu trữ`/`Kích hoạt lại` — `setFormStatusAction`; `Nhân bản` — `cloneFormAction`): Tiêu đề * · Phạm vi (`TEACHER_EVAL` Đánh giá GV · `CENTER_SURVEY` Khảo sát cơ sở · `SESSION_EVAL` Đánh giá buổi học) · danh sách câu hỏi: nội dung * + loại (`STAR_RATING` Chấm sao 1–5 · `RADIO` Một lựa chọn · `CHECKBOX` Nhiều lựa chọn · `TEXTBOX` Nhập văn bản · `PHOTO` Tải ảnh — **chỉ cho SESSION_EVAL**) + lựa chọn (RADIO/CHECKBOX ≥2). Validation: “Form cần ít nhất 1 câu hỏi”, “Tiêu đề không được trống”, “Nội dung câu hỏi không được trống”. Trạng thái form: `DRAFT` Nháp · `ACTIVE` Đang dùng · `ARCHIVED` Lưu trữ.
- **Đợt đánh giá / khảo sát** (`Tạo đợt` — `createRoundAction`): Form (chỉ form đang kích hoạt) · Tên đợt (vd “Giữa khóa Sata 3 — CS1”) · Cơ sở (**bắt buộc với CENTER_SURVEY**, tuỳ chọn với loại khác) · Khoá (tuỳ chọn, không áp cho CENTER_SURVEY) · Mở từ / Đóng lúc (datetime) → `Lưu đợt`. Trạng thái đợt `DRAFT` Nháp · `OPEN` Đang mở · `CLOSED` Đã đóng (nút `Mở`, `Đóng`, `Kết quả` — `setRoundStatusAction`).

