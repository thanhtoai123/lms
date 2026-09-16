# Đặc tả hệ quản trị admin.satarobo.vn — khảo sát từng màn hình

*Khảo sát ngày 16/09/2026 bằng tài khoản quản trị, 122 màn hình (danh sách, chi tiết, form tạo mới, cấu hình). Chỉ ghi nhận cấu trúc — bộ lọc, cột, nút, trường form, trạng thái, quy tắc nghiệp vụ hiển thị trên giao diện. Không sao chép dữ liệu cá nhân của phụ huynh, học viên, nhân sự. Dữ liệu thô đã lọc nằm ở `docs/admin-survey.raw.json`.*

---

## 0. Đính chính so với báo cáo phân tích lần 1

Khảo sát sâu cho thấy ba nhận định trong báo cáo đầu cần sửa lại cho đúng, và điều này quan trọng vì nó thay đổi cách nhìn về hệ cũ:

1. **Lịch học đã là dữ liệu, không phải chuỗi.** Chi tiết lớp có khối "Kế hoạch lịch học" theo thứ (T2…CN), giờ bắt đầu/kết thúc, khoảng hiệu lực (từ ngày / đến ngày), nhiều giai đoạn; có nút *Sinh buổi học* (theo lịch + số buổi chuẩn của khoá, bỏ ngày nghỉ), *Xếp lại buổi theo lịch*, *Xem trước dời* (chỉ áp cho buổi chưa diễn ra, dời buổi trùng nghỉ sang buổi kế, giữ đủ tổng buổi), và trang *Kiểm tra lịch buổi học* đối chiếu dãy buổi với khai giảng + lịch. Chuỗi `sata4.15h45-CN.CS2-301` chỉ là **tên lớp theo quy ước** sinh từ dữ liệu đó. Hệ mới đã làm đúng hướng này nhưng không phải là "cải tiến mới" — cần bổ sung phần còn thiếu: nhiều giai đoạn lịch, xem trước dời, kiểm tra lệch lịch.
2. **CCCD/địa chỉ phụ huynh được che mặc định.** Màn Thanh toán ghi rõ: "CCCD phụ huynh & địa chỉ được che mặc định (thông tin nhạy cảm). Mở xem đầy đủ cần lý do và sẽ được ghi log." Audit log cũng che SĐT/email mặc định. Nhận định "hiển thị mặc định" trong báo cáo đầu là sai; hệ cũ đã có kiểm soát hé lộ PII.
3. **Tự động hoá đã rất sâu.** Trang *Cấu hình vận hành* có 11 nhóm với hàng chục tham số (SLA lead theo phút, ngưỡng rủi ro, nhắc tái tục, nhắc buổi học, chống bão tin Zalo, trần OTP, dung sai chấm công…). Hệ cũ không phải "chỉ ghi nhận việc"; vấn đề là **các việc sinh ra chưa được hoàn tất trong luồng** (đúng như số 348 việc / 151 quá hạn cho thấy).

Những điểm yếu khác trong báo cáo đầu vẫn đúng: mọi trang render động không cache, điều hướng ~1 giây, sidebar prefetch dây chuyền, CSP report-only lệch cấu hình, tài khoản admin dùng chung, nhiều màn hình trùng lặp chức năng, tracking marketing chưa bật.

---

## 1. Bức tranh module (13 nhóm, ~95 màn hình danh sách + chi tiết/form)

| # | Nhóm | Màn hình |
|---|---|---|
| 1 | Tổng quan | Dashboard, CRM Dashboard |
| 2 | CRM & Tuyển sinh | Leads (bảng/kanban), Nhập khách hàng, Nhập lead Excel, Chốt hàng loạt, Quản lý chia lead, Bàn giao lead, Lead lâu ngày chưa chăm, Chuyển lead liên CS, Nguồn giới thiệu, Messenger CRM, Lớp Trial, Chi tiết lead |
| 3 | Học viên & Đăng ký học | Học viên (+new/import/edit), Tài khoản phụ huynh, Đăng ký học (+new/edit), Chuyển lớp/cơ sở, Sắp hết khoá, Hoàn thành khoá & chứng chỉ, Học bạ, Học bạ năng lực (+tiêu chí), SataCoin |
| 4 | Lớp học & Lịch | Lớp học (+new/import/kiểm tra lịch/chi tiết 7 tab), Buổi học (+new/chi tiết), Lịch tổng, Điểm danh, Ảnh lớp, Duyệt ảnh, Học bù, Cơ sở, Phòng học |
| 5 | LMS / Học liệu | Giáo trình (+new), Đề xuất sửa giáo án, Khoá dạy, Gói khoá học (bán), Khoá tiên quyết, Tài liệu (+new), Bài tập (+new/templates), Tài liệu lớp tôi, SCORM |
| 6 | CSKH & Phụ huynh | Tin nhắn, Quản trị hội thoại (+đối soát), Yêu cầu PH, Đánh giá PH, Khảo sát/NPS, Thông báo PH, Cảnh báo rủi ro, Chăm sóc HV, Sinh nhật |
| 7 | Nhân sự & Giáo viên | Giáo viên (+hồ sơ), Nhân sự (+new/edit/import), Vị trí công việc, Chấm công (bảng công, kỳ công, phân ca, màn hình quét, check-in), Duyệt đơn từ, Lịch ca của tôi, Tuyển dụng (+new) |
| 8 | Sản phẩm & Kho | Học cụ Kits (+new), Sản phẩm (+new), Tồn kho (dashboard/items/movements), Kiểm kê (+new) |
| 9 | Tài chính | Đơn hàng (+new/chi tiết), Thanh toán, Công nợ, Thiếu học phí, Nhập giao dịch cũ, Biến động số dư (SePay), Hoàn tiền, Phương thức TT (+new), Hoa hồng |
| 10 | Website & Marketing | Tin tức, Nội dung website, Marketing dashboard, Funnel |
| 11 | Email & OTP | Email templates (+new), Email logs, OTP logs |
| 12 | Hệ thống & Cấu hình | Tài khoản (+new), Nhóm người dùng, Vai trò & quyền, Cây tổ chức, Audit log (+legacy), Tuân thủ NĐ13, Webhook replay, Tích hợp, Cấu hình vận hành (11 tab), Cài đặt |
| 13 | Báo cáo | Lead, Trải nghiệm, Đào tạo, Trung tâm, Hiệu suất GV, Cohort, Churn, Doanh thu vs mục tiêu, Đo pilot chat |

Quy ước chung toàn hệ: mọi bảng có ô tìm kiếm + bộ lọc GET qua query string + "Hiển thị 10/20/50/100"; dữ liệu giới hạn theo cơ sở của người dùng ("phạm vi cơ sở của bạn"); nhiều màn hình có link Import Excel + template mẫu; các thao tác nhạy cảm yêu cầu **lý do** và được ghi audit.

---

## 2. Tổng quan

**Dashboard** — Khối "Cần xử lý" gồm 7 hàng đợi có đếm quá hạn: học bạ chưa viết (buổi 5/12), buổi chưa hoàn tất, ảnh chờ duyệt, cảnh báo rủi ro, việc chăm sóc, khách đăng ký quá lâu chưa chốt, lead cần xử lý. KPI: doanh thu/mục tiêu tháng, khách mới tháng (so tháng trước), hẹn học thử hôm nay, GV đứng lớp hôm nay, công nợ học phí (số ghi danh còn nợ), tổng lead, tổng HV, tỉ lệ chuyển đổi. Biểu đồ: lead 14 ngày, phân bố trạng thái, phễu theo tuần. Bảng "Leads mới nhất" (PH, phone che, status, thời gian).

**CRM Dashboard** — Phễu chuyển đổi, lead theo nguồn, hiệu suất đội sale (nhân viên / lead được giao / đã chốt / tỉ lệ chốt), chi tiết theo trạng thái; link sang Kanban.

---

## 3. CRM & Tuyển sinh

**Leads** — Hai chế độ xem: bảng và Kanban. Bộ lọc: tìm (tên/SĐT/tên con), cơ sở, sale phụ trách, nguồn (text tự do: sata1, sale-form, quatang…), từ ngày, đến ngày, trạng thái, sắp xếp. Cột: PH/HS, SĐT, khoá quan tâm, trạng thái, cơ sở, sale, ngày nhận lead, hành động (xoá). Nút: Lọc, Làm mới, Cột hiển thị, tải file mẫu, Import Excel, Chốt hàng loạt, Xuất Excel, xem lead đã đăng ký.
Trạng thái lead (10): Mới, Đã liên hệ, Đang tư vấn, Đã hẹn học thử, **Đang học thử**, Đã học thử, Chờ quyết định, Đã đăng ký, Đang nuôi dưỡng, Đã mất. (Hệ mới đang thiếu "Đang học thử" — cần thêm.)

**Chi tiết lead** — Thông tin khách (tên con, tuổi, khoá quan tâm, cơ sở, nguồn, sale, ngày nhận, lần nhập gần nhất, ghi chú); *Con của phụ huynh* (một lead có nhiều con — LeadChild, "Thêm con"); *Thanh toán*; đổi trạng thái (select), gán sale (select), *Chuyển lead* (liên cơ sở), *Chia lại lead*; *Ghi nhanh hoạt động*: Gọi điện / Nhắn tin / Ghi chú / Email với trường người gọi, thời lượng (phút), nội dung; *Lịch sử tương tác*.

**Nhập khách hàng** — Form nhập nhanh phiếu giấy: tên PH, SĐT, tên bé thứ 1 (+ Thêm con), khoá quan tâm từng bé, nguồn, link Facebook, cơ sở PH chọn (hoặc "để hệ thống tự chia"), ghi chú. Quy tắc: *không ô nào bắt buộc, điền tới đâu lưu tới đó; mã nhân viên lấy từ tài khoản đăng nhập*; có danh sách "đã nhập trong phiên này"; nút "Lưu và nhập phiếu tiếp".

**Nhập lead từ Excel** — .xlsx/.xls ≤10MB, ≤5000 dòng; cột cố định; SĐT bắt buộc hợp lệ (09xx/+84, để kiểu text tránh mất số 0); cơ sở: QL cơ sở để trống → về cơ sở mình, HO/Super Admin mới nhập hộ cơ sở khác; có trang riêng cho "lead đã đăng ký".

**Chốt hàng loạt (lead đã đăng ký)** — Lọc cơ sở, gõ lọc, ẩn lead đã chốt; bảng PH / HS / Lớp (chọn lớp kèm giá) / Ảnh: đồng ý / Đã đóng (đ) · ngày / Kết quả. Nút: tick tất cả, đồng ý ảnh tất cả, điền "đã đóng" theo file Excel, Chốt N lead. Cảnh báo dòng: phiếu không có tên PH; mã nhân viên không có trong hệ thống → chia tự động. **Quy tắc sau chốt**: tài khoản PH ở trạng thái *chờ kích hoạt*; PH vào satarobo.vn/kich-hoat nhập SĐT nhận OTP Zalo và tự đặt mật khẩu.

**Quản lý chia lead** — Theo khu vực (Khối Đà Nẵng / chưa gắn) → cơ sở; chế độ chia: *Luân phiên đều lượt* / *Theo tỷ lệ chốt* / *Quản lý giao tay*; bảng sale: nhận lead (bật/tắt), lượt đã nhận, tổng lead đang giữ, lần chia gần nhất, ghi chú; tab pool / sổ chia / lịch sử; nút "Đặt lại lượt toàn cơ sở".

**Bàn giao lead** — Chọn sale nguồn → sale đích; lọc theo trạng thái (chip), chiến dịch utm; chỉ lead chưa đóng; lý do bàn giao; "Xem trước số lead" → "Thực hiện bàn giao".

**Lead lâu ngày chưa chăm** — Lọc "không ai chăm từ (ngày)", cơ sở (kể cả Hội sở); cột PH, SĐT, trạng thái, đang giữ (sale), im bao lâu; chọn nhiều dòng để xử lý.

**Chuyển lead liên cơ sở** — Báo cáo theo tháng: lead, chuyển từ→đến, người chuyển, lý do/bàn giao, kết quả, ngày.

**Nguồn giới thiệu (Affiliate)** — Danh sách + thêm nguồn (phục vụ hoa hồng).

**Messenger CRM** — Inbox Messenger (tích hợp Facebook, hiện trống).

**Lớp Trial** — Danh sách lớp trải nghiệm: lớp, buổi kế tiếp, sĩ số, số buổi, trạng thái. Tạo lớp chỉ cần cơ sở + khoá trải nghiệm; **tên lớp tự sinh** (Cơ sở_Lớp trial số); ngày/giờ/phòng/GV chọn khi thêm buổi, mỗi buổi có thể khác; **đổi lịch/huỷ buổi phải ghi lý do và lý do gửi thẳng cho GV**.

---

## 4. Học viên & Đăng ký học

**Học viên** — Lọc: tìm (tên/mã/PH/SĐT PH), trạng thái (Đang học/Bảo lưu/Hoàn thành/Nghỉ học), cơ sở, lớp (1–12). Cột: ảnh, HV, lớp, PH, cơ sở, khoá, trạng thái, ngày tạo. Link: tài khoản PH, thêm mới, import.

**Form học viên (new/edit)** — 5 khối: *Thông tin HV* (ảnh ≤10MB, họ tên*, mã HV VD SR.HV.001, ngày sinh, giới tính, trạng thái, SĐT/email HV), *Học vấn* (lớp hiện tại, trường), *Phụ huynh* (PH chính*: tên, SĐT, quan hệ, email, CCCD; PH 2: tên, SĐT, quan hệ), *Địa chỉ* (số nhà, phường, quận, tỉnh), *Thông tin Sata Robo* (ngày đăng ký lần đầu, cơ sở ưu tiên, cơ sở quản lý, ghi chú nội bộ), *Sức khoẻ* (nhóm máu, bệnh nền). Trang edit thêm: *Lifecycle* (Bảo lưu / Nghỉ học hẳn), *Tài khoản PH (Portal)* (gửi lại mã kích hoạt, cấp mã tại quầy, gỡ), *Lịch sử bảo lưu*, *Tiến độ học tập* (điểm danh, bài học, bài tập, điểm TB), *Lịch sử học tập* (lớp/khoá, buổi đã học/tổng, trạng thái, bắt đầu, kết thúc), *Hồ sơ năng lực robotics* (nhiều tiêu chí xếp loại: Cần hỗ trợ / Cơ bản / Tốt / Xuất sắc; Lưu năng lực; Tạo PDF).

**Tài khoản phụ huynh** — Cột: PH, HV, cơ sở, trạng thái, ZNS báo cấp TK, hành động; Xuất CSV; "Gửi ZNS tất cả chưa nhận".

**Đăng ký học (enrollment)** — Trạng thái: Chờ xếp, Đã xếp, Đang học, Bảo lưu, Hoàn thành, Đã rút, Đã chuyển (mặc định lọc "đang hoạt động"). Lọc lớp, cơ sở. Form new: chọn lớp (hiện sĩ số hiện tại/tối đa) + ghi chú. Chi tiết: học viên, lớp (khoá, cơ sở, GV, lịch, khai giảng), mốc thời gian (ngày đăng ký, xác nhận xếp lớp, bắt đầu học, kết thúc), audit log; nút Đổi trạng thái, Chuyển lớp.

**Chuyển lớp / chuyển cơ sở** — Wizard 4 bước: cơ sở nguồn → học viên → lớp hiện tại → cơ sở đích (tuỳ chọn) → "Tìm lớp đích phù hợp"; lý do chuyển; bảng lịch sử (HV, trạng thái, lý do, ngày).

**Sắp hết khoá** — Danh sách HV còn ≤ N buổi (N cấu hình) → gọi tái tục.

**Hoàn thành khoá & chứng chỉ** — Theo HV (3 bước: HV → khoá đang học → lớp) hoặc hàng loạt theo lớp; nhập xếp loại cuối khoá + đánh giá của GV (bắt buộc) → **sinh chứng chỉ, gợi ý khoá tiếp theo, tạo việc chăm sóc tái tục, đẩy email chúc mừng**. Bảng: HV, khoá, xếp loại, khoá tiếp theo, ngày, chứng chỉ.

**Học bạ** — Chọn HV → xem học bạ. **Học bạ năng lực** — chọn lớp → xem HV; *Cấu hình tiêu chí năng lực* theo từng khoá (thêm tiêu chí).

**SataCoin** — Quy tắc thưởng (mã, tên, số coin), cấp/điều chỉnh coin (HV, số coin âm = trừ, lý do, ghi chú), bảng giao dịch. **Quy tắc: sổ cái bất biến, không sửa/xoá; điều chỉnh = giao dịch đảo; số dư = tổng giao dịch.**

---

## 5. Lớp học & Lịch

**Lớp học** — Lọc: tìm, trạng thái (Đang lên KH / Tuyển sinh / Chờ duyệt / Đang dạy / Hoàn thành / Huỷ), cơ sở, khoá, GV. Cột: tên, khoá, cơ sở/phòng, lịch, GV chính, sức chứa, khai giảng, trạng thái. Link: tạo mới, import, **Kiểm tra lịch buổi học**.

**Form lớp (new / chi tiết tab Thông tin)** — Tên lớp* (theo quy ước), mã lớp, khoá*, cơ sở*, trạng thái*, mô tả đặc thù (để bàn giao khi đổi GV), giáo trình (chỉ giáo trình ACTIVE của khoá), phòng, GV chính, trợ giảng, khai giảng*, bế giảng, sĩ số tối thiểu*/tối đa*, **Kế hoạch lịch học***: nhiều dòng {thứ T2…CN, giờ bắt đầu/kết thúc theo giai đoạn, từ ngày*, đến ngày (trống = hết khoá), ghi chú}; **Áp lịch mới cho buổi đã sinh** {lý do thay đổi, áp dụng từ ngày, Xem trước → Áp dụng}. Khối *Phê duyệt lớp* ("Gửi duyệt" → trạng thái Chờ duyệt → ACTIVE tự sinh buổi). Tab: Thông tin / Chương trình (kế hoạch buổi theo giáo trình) / Buổi & Điểm danh / Ảnh lớp / Học bù / Tài liệu SCORM / Đánh giá & Nhận xét (phiếu nhận xét buổi của GV, phiếu khảo sát theo đợt).

**Kiểm tra lịch buổi học** — Liệt kê lớp có buổi lệch so với khai giảng + lịch (buổi 1 hiện tại vs đúng lịch, số buổi lệch) → "Xếp lại buổi theo lịch".

**Buổi học** — Tab Sắp tới / Đã diễn ra / Tất cả; lọc lớp; cột thời gian, lớp/chủ đề, điểm danh, thao tác. Form thêm buổi: lớp*, **phân loại buổi** (Học chính thức / Lớp Coach 1-1,1-2,1-4 / Học bù / Học vượt / …), bài học trong giáo trình, chủ đề, ghi chú riêng.

**Chi tiết buổi học (GV)** — Khoá, GV chính, bài học; *Chuẩn bị trước buổi* (checklist), *Quy trình sau buổi* (checklist), ghi chú buổi học (GV), *Nhận xét từng học sinh* (nhận xét + điểm/xếp loại mỗi HS), *Phiếu nhận xét đã lưu*; nút Lưu tiến trình, Bắt đầu buổi, Hoàn tất buổi học, Phiếu đánh giá buổi học.

**Điểm danh** — Theo lớp: cơ sở, GV, sĩ số, buổi đã dạy, **chưa chốt**, trạng thái, mở.

**Ảnh lớp học** — Đăng ảnh (chọn lớp, chọn ảnh, chú thích); thư viện lọc trạng thái: Chờ duyệt / Đã duyệt / Từ chối / Trong kho (GV chưa gửi). **Duyệt ảnh** — nhóm theo ngày, mỗi ngày N lớp chờ duyệt, gắn "Quá hạn".

**Học bù** — Luồng: buổi vắng cần bù → *Gợi ý buổi bù cùng khoá/bài (không vượt tiến độ)* → xếp → đánh dấu đã bù; cho phép liên cơ sở (cấu hình).

**Cơ sở** — cơ sở, liên hệ, liên kết, trạng thái; import; edit theo slug. **Phòng học** — mã/tên, cơ sở, sức chứa, thiết bị, trạng thái (Hoạt động/Bảo trì/Tạm ngừng), thứ tự; import.

**Lịch tổng** — Lịch dạy dạng calendar (không có bảng).

---

## 6. LMS / Học liệu

**Giáo trình** — lọc khoá, trạng thái (Đang/Không sử dụng); cột tên, khoá, trạng thái, số bài. Form: tên*, khoá*, mô tả, trạng thái (Nháp/Đang dùng). Bài học có tên dạng "Giáo trình Sata 1 — Bài 1: …".
**Đề xuất sửa giáo án** — hàng đợi OPEN / ACCEPTED / REJECTED (GV đề xuất, đào tạo duyệt).
**Khoá dạy** — tên, độ tuổi, trình độ, giá, ưu đãi, trạng thái (11 khoá). **Gói khoá học (để bán)** — mã, tên gói, cấp độ, khoá dạy, giá, số buổi, trạng thái (9 gói) — *tách "khoá dạy" (chương trình) khỏi "gói bán" (thương mại)*.
**Khoá tiên quyết** — khoá / phải hoàn thành trước; **chặn đăng ký nếu HV chưa "Hoàn thành" khoá yêu cầu**.
**Tài liệu giảng dạy** — loại (PDF/Ảnh/Video/Slide/Worksheet/Audio/Khác), bài học, public/private (admin/GV), tags, người tải. Form: file, tiêu đề*, mã, mô tả, bài học, public (HS/PH xem), ghi chú.
**Bài tập** — trạng thái Đang soạn/Đã giao/Đã đóng/Lưu trữ; cột lớp, hạn nộp, tài liệu, nộp/chấm; templates. Form: tiêu đề*, loại (Bài trên lớp/Bài tập về nhà), mô tả*, hướng dẫn, tổng điểm*, hạn nộp, lớp*, bài học, cho phép trả lời text / nộp file.
**Tài liệu lớp tôi** — GV chọn lớp đang dạy → tài liệu. **SCORM** — chọn khoá → buổi học → gói SCORM.

---

## 7. CSKH & Phụ huynh

**Tin nhắn** — Chat realtime (Supabase Realtime): nhóm lớp và 1-1 GV↔PH; tìm hội thoại/PH.
**Quản trị hội thoại** — cột hội thoại, loại (Nhóm lớp / 1-1 GV↔PH), cơ sở, trạng thái (Đang hoạt động/Đang khoá/Đã lưu trữ), thành viên, số tin, hoạt động cuối; **nội dung chỉ mở sau khi nhập lý do, mỗi lần mở ghi audit kèm tên người xem**; trang đối soát.
**Yêu cầu phụ huynh** — loại: ABSENCE (xin nghỉ), MAKEUP (học bù), TRANSFER_CLASS, TRANSFER_CENTER, RESERVE (bảo lưu), CONSENT_CHANGE (đồng ý hình ảnh), OTHER; trạng thái PENDING / APPROVED / REJECTED / CANCELLED.
**Đánh giá phụ huynh** — phản hồi/đánh giá GV từ PH. **Khảo sát / NPS** — tạo khảo sát: tiêu đề, câu hỏi NPS 0–10, mốc gửi (Sau học thử / Sau 3 buổi / Giữa khoá / Cuối khoá / Sau khiếu nại / Chung), đối tượng (cơ sở); *NPS là KPI của CSKH*; link "evaluations" (bản mới).
**Thông báo phụ huynh** — soạn (tiêu đề, nội dung, phạm vi lớp/HV), đã đăng (ẩn/xoá); hệ thống tự đăng "Thay đổi lịch học" theo lớp khi buổi bị điều chỉnh.
**Cảnh báo rủi ro HV** — thẻ theo HV: mã rủi ro (vd nghỉ 2 buổi liên tiếp), mức HIGH, mô tả, nút Đã xử lý / Chuyển cấp. **Chăm sóc HV** — việc chăm sóc sinh từ rủi ro, nút Hoàn tất. **Sinh nhật** — quét sinh nhật 30 ngày tới; "Chạy quét sinh nhật".

---

## 8. Nhân sự & Giáo viên

**Giáo viên** — cột tên, cơ sở, ngạch, loại HĐ, trạng thái, lớp, tải/tuần. **Hồ sơ GV** — thông tin cơ bản (email, mã NV, chức danh, SĐT, cơ sở); hồ sơ chuyên môn: ngạch (Tập sự/Junior/Advanced/Senior/Expert), loại HĐ (Toàn/Bán thời gian), trạng thái (Đang dạy/Tạm nghỉ/Ngưng), khoá được dạy (chip theo khoá), ghi chú; lớp đang phụ trách (gán lớp: GV chính/Trợ giảng); lịch dạy tuần; tải giảng dạy/tuần; số buổi đã dạy trong tháng (chỉ tính buổi đã diễn ra); **đánh giá GV** (dự giờ: điểm 1–5 sao + nhận xét bắt buộc).

**Nhân sự** — lọc phòng ban (Ban GĐ, Đào tạo, Marketing, Kinh doanh, IT, HCNS, Kế toán, Tuyển sinh, Giáo vụ, Giảng dạy), cơ sở (kể cả Hội sở), trạng thái (Đang làm/Tạm nghỉ/Đã nghỉ/Cho nghỉ). Form (new/edit): *Thông tin cơ bản* (mã NV* tự đề xuất SR.NV.xxx, họ tên*, chức danh*, phòng ban*, email công ty, ngày vào làm, avatar, bio Markdown, đang làm việc, hiển thị public, CEO quote, miễn tính công), *Liên hệ & HR* (SĐT, nhân viên HO, ngày sinh, giới tính, loại HĐ: Toàn/Bán thời gian/Thực tập/CTV, quản lý trực tiếp, CCCD, địa chỉ, liên hệ khẩn cấp, ghi chú, **bậc/mức/lương BHXH — chỉ HR/Kế toán/SUPER_ADMIN thấy**), *Chuyên môn giảng dạy* (môn dạy, chứng chỉ), *Tài khoản đăng nhập* (email, vai trò, trạng thái, đăng nhập cuối; Đổi vai trò).

**Vị trí công việc** — bảng vị trí (đơn vị, bộ vai trò, báo cáo cho, đang giữ); *Phân công người vào vị trí* (kiểu Chính / Kiêm nhiệm / Uỷ quyền, hiệu lực từ–đến, ghi chú số quyết định); *Điều động tác nghiệp* (nơi tác nghiệp, lý do, hiệu lực). **Quy tắc: mỗi người đúng một phân công Chính còn hiệu lực; hết hạn quyền tự tắt.** Bộ vai trò: Trợ giảng, Kiểm toán đào tạo, Kế toán CS, QL lớp học, Nhân sự CS, QL cơ sở, Tư vấn & CSKH, Kế toán HO, Nhân sự HO, Marketing HO, Sale HO, Phụ huynh…

**Chấm công** — Bảng công ngày theo cơ sở/ngày: nhân sự, ca, quét, giờ/KH, công, cờ, chi tiết. **Quy tắc: công đếm theo lịch ca đã xếp; lượt quét chỉ sinh cờ (đi muộn, thiếu lượt, ngoài vùng) để quản lý rà; ghi đè công phải ghi lý do và lưu vết.** Link: màn hình quét, import phân ca theo kỳ, kỳ công, lọc có cờ/ghi đè/chưa quét, hướng dẫn. **Duyệt đơn từ** — PENDING/APPROVED theo cơ sở; đơn của tôi. **Lịch ca của tôi** — theo tháng, check-in.

**Tuyển dụng** — JD: tiêu đề*, slug*, phòng ban*, địa điểm* (Đà Nẵng/Online-Hybrid/Remote), hình thức* (Toàn/Bán thời gian/Thực tập/Dự án), giờ làm, kinh nghiệm, trách nhiệm, yêu cầu, quyền lợi, lương min/max, chỉ tiêu, hạn nộp, email/SĐT liên hệ, trạng thái (Nháp/Đang tuyển/Đã đóng/Tạm dừng); hiển thị ra website /tuyen-dung.

---

## 9. Sản phẩm & Kho

**Học cụ (ZMRobo Kits)** — catalog marketing cho trang /hoc-cu: tiêu đề*, slug, subtitle*, brand*, series*, code, mô tả ngắn/đầy đủ*, giá hiển thị*, source URL, specs (pieces/age/level/brand/weight/compatibility), features, highlights, ảnh chính*, đã đăng, còn hàng, thứ tự.
**Sản phẩm** — SKU*, trạng thái (Nháp/Đang bán/Tạm ngưng/Ngừng KD), tên*, mô tả, loại (Kit Robot/Cảm biến/Khối nhiệm vụ/Phụ kiện/Sách/Tài liệu/Vật tư tiêu hao/Khác), giá bán*, giá vốn (nội bộ), giá thuê/tháng, tồn kho, ngưỡng cảnh báo, liên kết catalog Kit, ảnh (URL ≤10).
**Tồn kho** — dashboard theo cơ sở (mặt hàng có tồn, tổng giá trị, cảnh báo thấp, hoạt động gần nhất); items; movements. **Kiểm kê** — phiếu theo cơ sở: trạng thái Đang soạn/Hoàn thành/Đã huỷ, số dòng, đã điều chỉnh, +/−, người làm.

---

## 10. Tài chính

**Đơn hàng** — lọc ngày, mã đơn/SĐT/tên; cột mã, KH, loại, số tiền, phương thức, trạng thái, người tạo, tạo lúc. **Tạo đơn thủ công**: loại đơn* (Khoá học…), trạng thái ban đầu (Chờ thanh toán), trung tâm, phương thức TT*, khách hàng (tên PH*, SĐT*, email, CCCD, địa chỉ, tỉnh, phường), sản phẩm (khoá học*, số lượng, đơn giá*), định giá (giảm giá theo số tiền/%), ghi chú KH/nội bộ.
**Chi tiết đơn** — công nợ đơn (tổng phải đóng, đã thu, còn thiếu, chờ kế toán xác nhận), khách hàng, sản phẩm, phương thức, **kế hoạch thanh toán** (1 lần / 2–4 học phần, đợt: số tiền, hạn, đã thu; nhắc công nợ trước N ngày), sổ kế toán, ghi chú, lịch sử trạng thái, **Thanh toán & QR** (mã QR chuyển khoản có hạn), gửi email, đổi trạng thái.
**Thanh toán** — luồng 2 vai: *Sale ghi nhận khoản thu* → *Kế toán xác nhận / từ chối / điều chỉnh*; cột đơn, tên bé, lớp, số tiền, hình thức, ngày thu, người thu, nguồn HV, tên PH, CCCD PH (che), địa chỉ (che), sale, kế toán, phiếu thu; nhập học phí từ Excel.
**Công nợ** — theo nhóm; **quy tắc: tổng nợ (đăng ký) = học phí − khoản kế toán ĐÃ xác nhận; tuổi nợ tính theo đợt của đơn có lịch trả góp** (hai phạm vi khác nhau). **Thiếu học phí** — PH·HV, cơ sở, trạng thái, học phí, thao tác.
**Nhập giao dịch cũ** — đọc Excel ngay trong trình duyệt; **chỉ tên, SĐT, số tiền, ngày, ghi chú gửi lên máy chủ; CCCD/địa chỉ không rời máy**.
**Biến động số dư** — sổ giao dịch cổng SePay (thời gian, số tiền, nội dung CK, cổng, trạng thái, rót vào phiếu thu, xử lý), lọc chưa khớp / đã khớp; *tiền thừa chưa xử lý* (không tự hoàn/tự trừ, kế toán quyết); nhật ký webhook (100 dòng gần nhất).
**Hoàn tiền** — HV/lớp, lý do, đã thu, buổi (học/tổng), **đề xuất hoàn tính theo buổi**, trạng thái PENDING/APPROVED/REJECTED/PAID.
**Phương thức TT** — mã*, tên*, loại* (tiền mặt/CK/gateway), cơ sở áp dụng* (dùng chung hoặc theo cơ sở — **chỉ hiện ở đơn cơ sở đó**), mô tả, logo, cho phép thanh toán cho: khoá offline / gói khoá / kỳ thi / sản phẩm / nạp ví (reserved), thứ tự, kích hoạt.
**Hoa hồng** — bảng theo kỳ (kỳ, trạng thái, số dòng, tổng), duyệt, export; trần tổng hoa hồng cấu hình (vd 0.09 = 9%, gồm cả GV dạy buổi trải nghiệm).

---

## 11. Website & Marketing

**Tin tức** — tiêu đề, danh mục, trạng thái, ngày đăng. **Nội dung website** — override hero image/title/subtitle từng trang công khai (Trang chủ, Khoá học, Về chúng tôi, Tuyển dụng, Liên hệ, Học cụ); để trống = mặc định; **public page tự revalidate sau khi lưu**. **Marketing dashboard** — phễu lead, theo nguồn khoá học, UTM source/campaign, trạng thái tracking (Meta Pixel, Meta CAPI, GA4, GA4 MP — hiện chưa cấu hình). **Funnel** — trang phễu.

---

## 12. Email & OTP

**Email templates** — nhóm: xác nhận đơn hàng, biên nhận thanh toán, thông báo bảo lưu, thông báo nghỉ học, nhắc tái tục, báo cáo tiến độ, nhắc lịch học 24h, nhắc gia hạn 14 ngày, thông báo lead mới…; cột code, tên, tiêu đề, đã gửi, status. **Email logs** — thời gian, đến, subject, template, trigger, status (Chờ gửi/Đã gửi/Thất bại/Bounce), người gửi. **OTP logs** — lúc, người nhận, mục đích (Kích hoạt/Quên mật khẩu/Đổi liên hệ), các lần gửi, trạng thái mã.

---

## 13. Hệ thống & Cấu hình

**Tài khoản** — 125 tài khoản, **chỉ SUPER_ADMIN quản lý**; cột email, tên, role, nhân sự, cơ sở, trạng thái, đăng nhập cuối. Tạo tài khoản: tên*, email*, SĐT (đăng nhập bằng SĐT hoặc email), mật khẩu*, **vai trò (chọn nhiều; quyền = hợp của các vai trò; vai trò chính → dashboard mặc định)**, đơn vị* (CS1/CS2/Hội sở — *HO không phải vai trò*), nhân sự liên kết; thông tin gửi qua email + Zalo; đổi mật khẩu lần đầu.
**Nhóm người dùng** — tên, mô tả, thành viên, grant. **Vai trò & quyền (RBAC)** — 15 role (mã, tên, loại hệ thống/hoạt động, số quyền, người dùng); tạo role (mã IN HOA, tên, lý do).
**Cây tổ chức** — đơn vị cha/con (DANANG khối, CS1, CS2, HO); **"mở cơ sở mới là thêm đơn vị ở đây — không cần lập trình viên"**.
**Audit log** — hợp nhất toàn hệ; lọc ngày, người, module, hành động, đối tượng, lý do; **QL cơ sở chỉ thấy log cơ sở mình; PII che mặc định, xem đầy đủ có kiểm soát**; export CSV; xoá log > 365 ngày; log legacy.
**Tuân thủ NĐ13** — HV đã nghỉ quá hạn lưu trữ 5 năm → rà soát xoá ẩn danh; DSAR & xoá ẩn danh chỉ SUPER_ADMIN.
**Webhook replay** — webhook lỗi (nguồn, external id, nhận lúc, lỗi) → chạy lại. **Tích hợp** — Rate limit Upstash (fallback memory), Zalo OA/ZNS (gửi thử, ~300đ/tin, tối đa 5 lần/giờ, OA dev chỉ gửi được số admin), MISA AMIS (bật sync, chạy thử).
**Cài đặt** — thông tin tài khoản, đổi mật khẩu (≥8 ký tự, chữ hoa + số), thông báo đẩy (bật trên máy), hướng dẫn, danh sách cơ sở, môi trường.

### 13.1. Cấu hình vận hành — catalog quy tắc (11 nhóm)

Đây là "bộ luật vận hành" của hệ cũ; hệ mới nên đưa toàn bộ vào bảng `operational_settings` (key, value, unit, scope cơ sở) và rule engine đọc từ đó:

- **Thông báo đẩy**: bật/tắt push; 36 loại thông báo nội bộ chia 5 nhóm (Cần thực hiện, Tin nhắn PH, Việc mới, Đến hạn, Hệ thống), mỗi loại có mức Khẩn/Thường và **đối tượng nhận theo vai trò/ngữ cảnh** (vd "Lead mới vừa chia cho tôi → tư vấn viên được chia"; "Công nợ quá hạn → Kế toán"; "Điểm danh bị sửa hồi tố → GV chính"; "Đơn từ mới chờ duyệt → người giữ quyền hr_attendance:approve tại cơ sở"; "Buổi trải nghiệm bị huỷ → GV được phân"; "Phụ huynh nhắn tin → GV chính + trợ giảng").
- **Tin Zalo (ZNS)**: gửi thật/giả lập; mẫu tin (mã xác thực, cấp tài khoản, sinh nhật, có tin nhắn mới) theo template ID đã duyệt; báo PH khi có tin mới trong nhóm lớp (chỉ khi lâu không mở); ngưỡng phút chưa đọc (tin thường / thông báo lớp); **mỗi PH 1 tin/nhóm lớp trong N phút (chặn bão tin)**; số tin tối đa mỗi lượt tự động.
- **Đăng nhập/OTP**: mã hiệu lực N phút; nhập sai tối đa; chờ xin lại; trần theo số/máy/hệ thống/ngày; ngưỡng tự ngắt.
- **Học viên**: còn N buổi = sắp hết khoá; hạn xử lý việc chăm sóc; bảo lưu tối đa (tháng); báo vắng sát ngày = gấp; cửa sổ tái tục sau học xong; "hay vắng" = X buổi trong Y buổi gần nhất; sinh nhật (báo trước, quét trước, lùi sớm nhất); cho học bù liên cơ sở.
- **Lớp & GV**: sĩ số min/max mặc định; quá tải giờ/tuần (cảnh báo, không chặn); thời hạn link xem ảnh/video (signed URL, giây); cho PH xem điểm bài tập (đang tắt — PH chỉ thấy đã nộp/chưa).
- **Chấm công**: dung sai quét (phút); số lần đăng ký ca khẩn/tháng; khoảng ngày đăng ký ca tháng sau; bán kính quét (mét); QL sửa bảng công trong N ngày; ngày nghỉ cố định tuần; ngưỡng đi muộn (gắn dấu / tính 1 lần trễ); trừ % nội quy mỗi lần trễ / nghỉ không phép; nhắc trước giờ ca; số lượt quét tối đa/ngày; cửa sổ ghép lượt vào–ra.
- **Khách hàng (lead)**: dedupe cùng SĐT trong N ngày; trần hoa hồng; số buổi học thử tối đa/khách; **SLA theo phút**: chưa trả lời tin nhắn, chưa bàn giao, chưa phân công, phân công rồi chưa liên hệ ("hay bị vi phạm nhất"), khách im lặng, không hoạt động (giờ) → danh sách bị bỏ quên; rate limit form web (lượt/ms) và màn nhập phiếu (phiếu/phút); cảnh báo nguồn lead lỗi / im bất thường.
- **Thanh toán**: nhắc đợt 2 trước N ngày; lệch tối đa vẫn coi là khớp tiền (đồng); QR hiệu lực (phút).
- **Nhắc tự động**: nhắc tái tục bắt đầu/sớm nhất (ngày trước hết khoá), không nhắc lại trong N ngày; nhắc buổi học bắt đầu/sớm nhất (giờ); số dòng mỗi nhóm việc trên dashboard; việc tồn N ngày = quá hạn.
- **Công ty**: SĐT/email theo cơ sở hiện trên web; danh sách giải thưởng, bộ quà tặng, cam kết (nội dung công khai — nên có người duyệt).
- **Nâng cao**: chuyển sang sơ đồ tổ chức mới (ảnh hưởng phạm vi dữ liệu), timeout upload.

---

## 14. Báo cáo

Lead (phễu "đã từng tới bước", tỷ lệ chuyển từng bước, tỷ lệ chốt theo sale, theo nguồn, cơ sở, tháng, nguồn hoa hồng, rụng ở bậc + lý do; *sổ trạng thái chỉ ghi từ 25/08/2026*), Trải nghiệm (phễu học thử → đăng ký; lấp đầy, dự đủ buổi, chuyển đổi), Đào tạo (chuyên cần theo lớp: buổi tính, đi học, vắng, chờ bù, đã bù), Trung tâm (doanh thu theo tháng; đã xác nhận / chờ xác nhận / phải thu / công nợ theo cơ sở), Hiệu suất GV (buổi đã dạy, chuyên cần, HV, điểm học bạ TB), Cohort (kỳ bắt đầu, ghi danh, tiến độ TB, hoàn thành/đang học/rút), Churn (theo tháng, theo cơ sở), Doanh thu vs mục tiêu (đặt mục tiêu theo cơ sở/kỳ), Đo pilot chat (PH trong nhóm, đã kích hoạt, đã đăng nhập, đồng ý quy định, đọc ≤48h).

---

## 15. Đối chiếu với hệ mới (satarobo-platform) — gap cần xây

| Đã có trong hệ mới | Cần bổ sung/sửa theo đặc tả này |
|---|---|
| Lịch lớp dạng dữ liệu, sinh buổi, chặn trùng phòng/GV | Nhiều giai đoạn lịch; "áp lịch mới cho buổi đã sinh" (xem trước dời, giữ tổng buổi, không đụng buổi đã diễn ra); kiểm tra lệch lịch; phê duyệt lớp (Chờ duyệt → ACTIVE tự sinh); phân loại buổi (chính thức/coach/bù/vượt); trợ giảng; sĩ số min |
| State machine buổi học, Teacher app 3 bước | Checklist chuẩn bị/sau buổi; nhận xét + điểm từng HS; "Bắt đầu buổi"; phiếu đánh giá buổi; mốc học bạ 5/12 → học bạ năng lực theo tiêu chí từng khoá; ảnh lớp có duyệt + consent + signed URL hết hạn |
| Lead 9 trạng thái, SLA, phân bổ theo tải, timeline, chuyển đổi | Thêm trạng thái "Đang học thử"; LeadChild (nhiều con/lead); 3 chế độ chia (luân phiên / theo tỷ lệ chốt / giao tay) + pool + sổ chia + đặt lại lượt; bàn giao hàng loạt có lý do; chuyển lead liên cơ sở; import Excel + template; chốt hàng loạt (+ tạo tài khoản PH chờ kích hoạt OTP Zalo); Lớp Trial (buổi lẻ, đổi lịch phải ghi lý do → GV); affiliate & hoa hồng; SLA bộ tham số theo phút như 13.1 |
| Outbox + rule engine + care task + notify | Catalog 36 loại thông báo nội bộ theo vai trò/ngữ cảnh; ZNS thật với chặn bão tin; email templates + logs; OTP; yêu cầu PH 7 loại có duyệt; khảo sát NPS theo mốc; sinh nhật; sắp hết khoá → tái tục; hoàn thành khoá → chứng chỉ + gợi ý khoá tiếp |
| Students/parents/enrollments cơ bản | Form HV đầy đủ 5 khối + PH 2 + sức khoẻ; lifecycle bảo lưu/nghỉ (tối đa N tháng); chuyển lớp/cơ sở wizard; enrollment 7 trạng thái + mốc thời gian; khoá tiên quyết chặn ghi danh; SataCoin (sổ cái bất biến); tài khoản PH (kích hoạt OTP, cấp mã tại quầy) |
| RBAC 15 role × cơ sở | Vị trí công việc (Chính/Kiêm nhiệm/Uỷ quyền, hiệu lực); cây tổ chức tự thêm cơ sở; nhóm người dùng; tài khoản nhiều vai trò + vai trò chính; PII reveal có lý do + audit; audit theo cơ sở |
| — | Toàn bộ Tài chính (đơn, kế hoạch trả góp, QR, SePay đối khớp, sale ghi nhận/kế toán xác nhận, công nợ 2 phạm vi, hoàn tiền theo buổi, phương thức theo cơ sở, hoa hồng, MISA) |
| — | Nhân sự & chấm công (lịch ca, quét có bán kính, cờ, ghi đè có lý do, đơn từ, kỳ công), tuyển dụng |
| — | LMS (giáo trình/bài học, tài liệu, bài tập & chấm, SCORM, đề xuất sửa giáo án), kho & sản phẩm, website CMS, báo cáo 9 loại |

Ưu tiên đề xuất cho Giai đoạn 2 (đã bắt đầu): hoàn thiện CRM theo đúng 10 trạng thái + LeadChild + chia lead 3 chế độ + chốt hàng loạt tạo tài khoản PH; sau đó ảnh lớp/duyệt/consent và học bạ năng lực; Giai đoạn 3 Tài chính theo đúng luồng sale ghi nhận → kế toán xác nhận + SePay.
