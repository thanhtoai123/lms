# Trải nghiệm một chạm — khu quản trị Sata Robo

Tài liệu này ghi lại đợt tối ưu trải nghiệm theo yêu cầu của chủ sản phẩm:
*"UI/UX thân thiện, tư duy 1 chạm để thao tác nhanh, không quá nhiều tab / luồng thông tin
trên 1 màn hình tránh loạn"*.

Phạm vi: chỉ đổi **cách trình bày và số bước**. Không đổi một luật nghiệp vụ nào — mọi hành
động vẫn đi qua đúng service cũ (service tự kiểm tra quyền, ghi audit, bắn thông báo).

---

## 1. Nguyên tắc thiết kế

1. **Một màn hình = một nhiệm vụ chính + tối đa 3 khối.**
   Số liệu tóm tắt tối đa 4 thẻ. Nội dung tra cứu không được chiếm chỗ của việc phải làm.
2. **Tối đa 3 tab.** Cần nhiều hơn thì: gộp tab gần nghĩa, đổi tab thành bộ lọc, hoặc đẩy
   nội dung phụ vào **panel trượt bên phải** (mở theo yêu cầu, đóng bằng `Esc`).
3. **Mỗi dòng đúng MỘT nút hành động chính**, cộng một liên kết phụ "Mở chi tiết".
   Không mở hộp thoại nhiều bước cho hành động chính.
4. **Việc cần nhập liệu thì mở thẳng ô nhập**, không mở trang trung gian.
   Điểm danh, viết nhận xét, viết học bạ, xếp buổi bù đều cần dữ liệu người dùng nhập,
   nên nút chính của những nhóm này đưa thẳng tới màn hình nhập đúng lớp / đúng buổi
   (vẫn là một cú nhấp) thay vì giả vờ "làm ngay" rồi ghi sai.
5. **Hành động đảo ngược được thì phải có "Hoàn tác"** ngay trong thông báo.
   Quyết định đã ghi sổ (duyệt tiền, duyệt đơn, cấp chứng nhận) **không** có Hoàn tác —
   muốn đảo phải đi đúng luồng nghiệp vụ, vì đó là yêu cầu kiểm toán chứ không phải giới hạn UI.
6. **Nhớ giúp người dùng.** Bộ lọc gần nhất của từng trang được lưu trên máy
   (`localStorage`, mọi truy cập bọc `try/catch`); trình duyệt chặn lưu trữ thì trang vẫn chạy bình thường.
7. **Không đặt màu mới.** Chỉ dùng token đã khai trong `apps/web/src/app/globals.css`
   (tím `#610b8a`, cam `#ff8f2d`) và bộ icon lucide đã ánh xạ trong `docs/GIAO-DIEN-GOC.md`.
8. **Tiếp cận được:** nút icon có `aria-label` tiếng Việt, vùng chạm ≥ 40px (`min-h-10`),
   tiêu điểm bàn phím thấy rõ (`focus-visible:outline-*`), panel bên giữ tiêu điểm bên trong.
9. **Xuống 400px không tràn ngang:** lưới tự xuống dòng, bảng nằm trong khung `overflow-x:auto`.

---

## 2. Màn hình "Việc hôm nay"

`/viec-hom-nay` — trang **mặc định** khi vào khu quản trị (đăng nhập, logo góc trái, trang gốc `/`).

Gộp mọi việc cần xử lý của **người đang đăng nhập**, chỉ hiện nhóm mà người đó có quyền và
chỉ trong phạm vi cơ sở người đó được nhìn thấy.

| Nhóm việc | Nguồn (service cũ) | Nút chính | Kiểu |
|---|---|---|---|
| Việc hẹn với khách hôm nay | `leads.myLeadTasks` | Hoàn tất | chạy ngay |
| Lead quá hạn liên hệ | `leads` + `computeSla` | Đã liên hệ | chạy ngay |
| Phiếu đánh giá học thử chưa gửi | `trialReports.pendingTrialReports` | Điền phiếu | mở drawer phiếu đúng buổi thử (docs/PHIEU-DANH-GIA-HOC-THU.md) |
| Buổi học chưa điểm danh | `sessions.listSessions` | Điểm danh | mở lưới điểm danh đúng lớp |
| Buổi chưa viết nhận xét | `sessions.listSessions` | Viết nhận xét | mở lớp |
| Buổi chưa có phiếu nhận xét học viên | `sessionEvaluations.pendingEvaluationSessions` | Chấm phiếu | mở màn buổi học, cuộn tới khối phiếu (docs/HO-SO-HOC-TAP.md) |
| Học bạ kỳ chưa viết | `reportCards.dueReportCards` | Viết học bạ | mở đúng học bạ |
| Học bù chờ xếp buổi | `makeup.listMakeup` | Xếp buổi bù | mở bảng học bù |
| Ảnh lớp chờ duyệt | `media.listMedia` | Duyệt ảnh | chạy ngay |
| Phiếu thu chờ xác nhận | `finance.listPayments` | Xác nhận | chạy ngay |
| Hoàn tiền chờ duyệt | `finance.listRefunds` | Duyệt | chạy ngay |
| Đơn nghỉ / đơn công chờ duyệt | `hrRequests.listRequests` | Duyệt | chạy ngay |
| Yêu cầu phụ huynh chưa xử lý | `care.listParentRequests` | Duyệt | chạy ngay |
| Việc chăm sóc học viên tới hạn | `engagement.listCareTasks` | Đã xử lý | chạy ngay **+ Hoàn tác** |
| Chứng nhận chờ cấp | `reportCards.pendingCompletions` | Duyệt cấp | chạy ngay |
| Thông báo cần xác nhận | `engagement.myNotifications` | Đã xem | chạy ngay |

Bố cục đúng 3 khối: **4 thẻ số liệu** → **hàng chip lọc theo nhóm** (thay cho tab) →
**danh sách việc**. Mỗi nhóm có ô "Chọn" để làm hàng loạt; mỗi dòng có nút chính + nút
"Mở chi tiết". Cập nhật lạc quan: dòng biến mất ngay, dòng nào lỗi thì quay lại kèm lý do.

### Backend mới

| Thủ tục | Việc |
|---|---|
| `inbox.today` | Trả các nhóm việc đã lọc theo quyền + phạm vi cơ sở |
| `inbox.act` | Chạy hành động chính cho 1..50 dòng; từng dòng độc lập, trả về danh sách dòng lỗi |
| `inbox.undo` | Hoàn tác — hiện chỉ mở cho nhóm "Việc chăm sóc học viên" |

Mã nguồn: `packages/api/src/services/inbox.ts`, `packages/api/src/routers/inbox.ts`.
Mỗi nhóm được bọc `try/catch`: một nhóm lỗi hoặc thiếu quyền chỉ mất nhóm đó, không gãy cả trang.

---

## 3. Bảng trước / sau — 10 tác vụ hay gặp nhất

Đếm **số cú nhấp chuột tính từ lúc vừa đăng nhập** (trước: rơi vào Dashboard; sau: rơi vào Việc hôm nay).

| # | Tác vụ | Trước | Sau | Tiết kiệm |
|---|---|---:|---:|---:|
| 1 | Xác nhận một phiếu thu chờ kế toán | 6 | 1 | **−5** |
| 2 | Xác nhận 10 phiếu thu chờ kế toán | 60 | 11 | **−49** |
| 3 | Ghi nhận "đã gọi" cho một lead quá hạn SLA | 7 | 1 | **−6** |
| 4 | Duyệt một đơn nghỉ của nhân sự | 3 | 1 | **−2** |
| 5 | Duyệt toàn bộ ảnh chờ duyệt của một buổi | 4 | 2 | **−2** |
| 6 | Duyệt một yêu cầu của phụ huynh | 4 | 1 | **−3** |
| 7 | Đóng một việc chăm sóc học viên quá hạn | 5 | 1 | **−4** |
| 8 | Duyệt cấp chứng nhận hoàn thành khoá | 3 | 1 | **−2** |
| 9 | Mở lưới điểm danh của lớp còn buổi chưa chốt | 4 | 1 | **−3** |
| 10 | Quay lại một danh sách với đúng bộ lọc lần trước | 4 | 0 | **−4** |

Chi tiết cách đếm:

1. **Xác nhận phiếu thu** — trước: menu *Thanh toán* → chọn trạng thái → *Lọc* → mở đơn hàng →
   *Xác nhận* → xác nhận trong ô. Sau: nút *Xác nhận* ngay trên dòng ở Việc hôm nay.
2. **10 phiếu thu** — trước phải mở 10 trang đơn hàng. Sau: 10 ô chọn + 1 nút "Xác nhận 10 việc".
3. **Đã gọi lead** — trước: menu *Leads* → lọc → mở lead → chọn loại hoạt động → nhập nội dung → *Lưu*.
   Sau: nút *Đã liên hệ* trên dòng (và nút *Đã gọi* ngay trên bảng `/leads`).
4. **Đơn nghỉ** — trước: menu *Duyệt đơn từ* → tab *Chờ duyệt* → *Duyệt & áp ngay*.
5. **Ảnh một buổi** — trước: menu *Duyệt ảnh* → chọn buổi → chọn tất cả → *Duyệt*.
   Sau: chọn nhóm → *Duyệt ảnh N việc*.
6. **Yêu cầu phụ huynh** — trước: menu → tab *Chưa xử lý* → mở yêu cầu → *Duyệt*.
7. **Việc chăm sóc** — trước: menu *Chăm sóc HV* → tìm việc → chọn trạng thái → nhập kết quả → *Lưu*.
   Sau: nút *Đã xử lý*, có **Hoàn tác** trong thông báo nếu bấm nhầm.
8. **Chứng nhận** — trước: menu *Hoàn thành khoá & chứng nhận* → tìm đề xuất → *Duyệt*.
9. **Điểm danh** — trước: menu *Điểm danh* → chọn cơ sở → *Lọc* → bấm lớp.
   Sau: nút *Điểm danh* trên dòng buổi, mở thẳng lưới đúng lớp.
10. **Bộ lọc cũ** — trước: chọn lại 3–4 ô lọc rồi bấm *Lọc*. Sau: trang tự khôi phục chuỗi lọc đã lưu.

Ngoài bảng trên:

- **Mở bất kỳ màn hình / hành động nào**: `Ctrl + K` → gõ vài chữ → `Enter` (không cần cuộn menu 117 mục).
- **Xem biểu đồ phụ của Dashboard**: trước phải cuộn qua 7 khối; nay 1 nút *Biểu đồ chi tiết*.
- **Xem phần tra cứu hồ sơ học viên**: trước cuộn qua 11 khối; nay 1 nút *Hồ sơ đầy đủ*.

---

## 4. Trang đã tái cấu trúc

| Trang | Trước | Sau |
|---|---|---|
| `/viec-hom-nay` | *(chưa có)* | Màn hình mới, mặc định khi vào khu quản trị |
| `/dashboard` | 7 khối, 6 thẻ KPI, khối "Cần xử lý" 12 ô | 3 khối, 4 thẻ KPI; "Cần xử lý" thành một dải một dòng trỏ sang Việc hôm nay; 2 biểu đồ phụ vào panel trượt phải |
| `/cham-cong` (và 5 trang con) | 7 chip ngang hàng | 3 việc hằng ngày + *Đơn từ* + *Của tôi*, 3 mục thiết lập tách sau vạch ngăn |
| `/satacoin` | 5 tab | 3 tab việc + một trang *Thiết lập xu* gộp "Danh mục quà" và "Luật thưởng xu" |
| `/classes/[id]` | 4 tab | 3 tab; *Ảnh lớp* thành liên kết sang `/media?class=…` (trang đầy đủ hơn: có tải ảnh, gắn thẻ, lọc trạng thái) |
| `/students/[id]` | 11 khối | 4 khối; phần tra cứu vào panel *Hồ sơ đầy đủ* |
| `/leads` | Hành động trên dòng chỉ có *Xoá* | Thêm *Đã gọi* một chạm (reset đồng hồ SLA) + nhớ bộ lọc |
| 15 trang danh sách khác | Mất bộ lọc mỗi lần quay lại | Nhớ bộ lọc gần nhất: `students`, `enrollments`, `payments`, `orders`, `don-tu`, `parent-requests`, `cong-no`, `attendance`, `duyet-media`, `hoc-bu`, `canh-bao-rui-ro`, `audit-log`, `thieu-hoc-phi`, `teachers`, `nhan-su` |

Thành phần dùng chung mới (đặt một lần ở `AdminShell`, mọi trang dùng được):

| Tệp | Việc |
|---|---|
| `components/toast.tsx` | Thông báo tiếng Việt, có nút *Hoàn tác*, `aria-live="polite"` |
| `components/drawer.tsx` | Panel trượt phải, đóng bằng `Esc`, giữ tiêu điểm bên trong, ≤ 95vw |
| `components/shortcuts.tsx` | `useListKeys` (j/k/Enter/Space/E) và bảng phím tắt bật bằng `?` |
| `components/action-button.tsx` | Nút có trạng thái đang xử lý + chặn nhấn đúp, khung xương và trạng thái rỗng |
| `components/remember-filters.tsx` | Nhớ bộ lọc gần nhất theo từng trang |

---

## 5. Phím tắt

| Phím | Việc |
|---|---|
| `Ctrl + K` (hoặc `⌘ K`) | Mở bảng lệnh: tìm kiếm **và** hành động nhanh |
| `/` | Mở bảng lệnh (khi con trỏ không ở trong ô nhập) |
| `?` | Bật / tắt bảng phím tắt |
| `J` hoặc `↓` | Xuống một dòng trong danh sách |
| `K` hoặc `↑` | Lên một dòng trong danh sách |
| `Enter` | Mở chi tiết dòng đang trỏ |
| `Space` | Chọn / bỏ chọn dòng đang trỏ |
| `E` | Chạy hành động chính của dòng đang trỏ |
| `Esc` | Đóng bảng lệnh / panel bên / hộp thoại |

Bảng lệnh `Ctrl + K` nay có nhóm **Hành động nhanh** (gõ là ra, `Enter` là chạy):
xem việc hôm nay, tạo lead, nhập lead từ file, thêm học viên, tạo đăng ký học, tạo đơn hàng /
thu tiền, xác nhận phiếu thu, xem công nợ, điểm danh lớp, tạo lớp, duyệt ảnh lớp, duyệt đơn từ,
làm đơn của tôi. Mỗi hành động chỉ hiện khi trang đích **có trong menu của người dùng** —
menu đã lọc theo quyền nên không lộ việc người dùng không được làm.

---

## 6. Điều cần kiểm thử lại

- **Phân quyền từng nhóm việc**: đăng nhập bằng 7 vai trò trong `docs/KIEM-THU-VAI-TRO.md`,
  kiểm tra Việc hôm nay chỉ hiện đúng nhóm mà vai trò đó được làm.
- **Hành động hàng loạt**: chọn lẫn dòng hợp lệ và dòng không còn hợp lệ (đã có người khác xử lý)
  → phải xử lý xong phần hợp lệ và trả dòng lỗi về danh sách kèm lý do.
- **Nhớ bộ lọc**: mở trang danh sách ở chế độ ẩn danh / trình duyệt chặn lưu trữ site → trang
  vẫn chạy, không có lỗi trên console.
- **Trang mặc định**: người chỉ có vai trò giáo viên vẫn phải vào `/teacher`, không vào `/viec-hom-nay`.
