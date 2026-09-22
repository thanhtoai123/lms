# Phía người dùng — cổng phụ huynh `/ph` và app giáo viên `/teacher`

> Yêu cầu của chủ dự án: "…và **tiếp tục phát triển phía người dùng**".
> Tài liệu này ghi lại **rà soát hành trình** (viết trước khi làm), các quyết định thiết kế,
> và cách xem thử. Liên quan: `docs/HO-SO-HOC-TAP.md`, `docs/CHUNG-NHAN-LO-TRINH.md`, `docs/TRAI-NGHIEM-MOT-CHAM.md`.

## 1. Rà soát hành trình (trước khi làm)

Đếm "chạm" từ lúc mở ứng dụng (đã đăng nhập) tới khi xong việc; gõ phím không tính.

### 1.1 Phụ huynh — việc hằng ngày / hằng tuần

| # | Việc | Hiện trạng | Chạm | Thiếu gì | Ưu tiên |
|---|---|---|---|---|---|
| P1 | Con học buổi tới lúc nào, ở đâu, với ai | Trang chủ: một dòng ngày giờ · lớp · phòng · cơ sở | 0 | Không có tên GV, không nổi bật, không có hành động kèm | Cao |
| P2 | Xin nghỉ một buổi | **Không có luồng**: vào trang con → "Hỏi trung tâm" → gõ chủ đề + nội dung → gửi; CSKH nhập tay thành yêu cầu | 4 + gõ | Nút một chạm tạo yêu cầu nghỉ (`parent_requests` loại `absence`), hỏi có cần học bù | **Rất cao** |
| P3 | Xem nhận xét buổi gần nhất | Trang chủ → Chi tiết → Hồ sơ học tập → cuộn tìm phiếu mới nhất | 2 + cuộn dài | Tóm tắt phiếu gần nhất ngay trang chủ (mức, nhận xét, ảnh) | **Rất cao** |
| P4 | Đóng học phí | Băng vàng trang chủ → Học phí → mở "Chuyển khoản (QR)" | 2 | Hạn / số tiền nổi hơn, mở thẳng QR | Trung bình |
| P5 | Đọc thông báo chưa đọc | Tab "Thông báo" (số chưa đọc trong nhãn) | 1 | Tóm tắt 3 thông báo mới trên trang chủ | Trung bình |
| P6 | Xem lịch học tháng / tuần | **Không có** — chỉ 10 buổi sắp tới + 30 buổi gần đây dạng danh sách | — | Lịch tháng/tuần có buổi thường, học bù, nghỉ lễ, trạng thái điểm danh | Cao |
| P7 | Theo dõi yêu cầu đã gửi (nghỉ, học bù, hỏi) | **Không có** — chỉ một thông báo "Trung tâm đã nhận yêu cầu" | — | Danh sách "Yêu cầu của tôi" + trạng thái + lịch sử | Cao |
| P8 | Xin học bù buổi con đã vắng | **Không có** | — | Nút "Xin học bù" trên buổi vắng (trong hạn) | Cao |
| P9 | Xem SataCoin của con | Trang con: một dòng số xu | 1 | Lịch sử, quà đổi được, yêu cầu đổi quà | Trung bình |
| P10 | Hành trình học (khoá đã / đang học, % buổi, học bạ, chứng nhận) | Trang con: danh sách lớp + học bạ dạng chữ; hồ sơ học tập ở trang riêng | 1–2 | Dòng thời gian lộ trình, biểu đồ tiến bộ, sản phẩm, **in / chia sẻ chứng nhận** | Cao |
| P11 | Phản hồi sau buổi | **Không có** (CSKH ghi hộ qua điện thoại) | — | Thả cảm xúc một chạm + ghi chú; "Cần trao đổi" → việc chăm sóc | Cao |
| P12 | Nhiều con | Trang chủ xếp chồng thẻ từng con, phải cuộn | cuộn | Chip chuyển nhanh giữa các con | Cao |
| P13 | Hỏi trung tâm | Trang con → form cuối trang | 1 + cuộn | Lối vào từ "Yêu cầu của tôi" | Thấp |
| P14 | Mở app khi mất mạng | Trình duyệt báo lỗi | — | Màn "offline" tối giản; manifest đúng màu thương hiệu | Trung bình |

### 1.2 Giáo viên — "xong việc trong 5 phút sau giờ dạy"

| # | Việc | Hiện trạng | Chạm | Thiếu gì | Ưu tiên |
|---|---|---|---|---|---|
| G1 | Lịch dạy hôm nay / tuần | Trang chủ: Hôm nay + 7 ngày tới + Cần chốt | 0 | Sĩ số trên thẻ, lối vào "Chuẩn bị" | Trung bình |
| G2 | Điểm danh → phiếu → hoàn tất | Màn buổi dạy một trang, ba bước | 1 | (giữ nguyên) | — |
| G3 | Phiếu cần hoàn thiện | Thẻ trên trang chủ | 1 | (giữ nguyên) | — |
| G4 | Chuẩn bị buổi dạy | Khối "Buổi này cần hoàn thiện" **ẩn với buổi tương lai**; tài liệu ở `/teaching-materials` (khu quản trị); không có danh sách HV cần lưu ý | 3+ | Màn "Chuẩn bị": bài, mục tiêu, học cụ, tiêu chí trọng tâm + mô tả mức, tài liệu của bài, HV cần lưu ý (sức khoẻ, vắng buổi trước, thẻ nổi bật, PH cần trao đổi) | **Rất cao** |
| G5 | Chụp & gắn ảnh trong buổi | Sang `/media` (khu quản trị, giao diện máy tính): chọn lớp, buổi, tải, gắn thẻ, gửi duyệt | 7+ | Chụp bằng camera ngay trên màn buổi, gắn nhiều em một chạm, cảnh báo em chưa đồng ý đăng ảnh | **Rất cao** |
| G6 | Xem phản hồi của phụ huynh | **Không có** (chỉ CSKH thấy ở `/parent-feedback`) | — | Thẻ "Phản hồi mới của PH" trang chủ + trên màn buổi | Cao |
| G7 | Lớp của tôi: tiến độ, HV nguy cơ, học bạ sắp đến hạn | Tiến độ x/y; bấm vào mở trang quản trị | 1 | HV nguy cơ (vắng nhiều, mức giảm), mốc học bạ sắp đến | Cao |
| G8 | Lương / chấm công của tôi | Chỉ qua menu quản trị "Của tôi" | 3 | Lối tắt từ app GV | Thấp |

### 1.3 Lỗ hổng rõ ràng khác

- Cổng PH: chữ 11–12 px ở nhiều chỗ, vùng chạm của thanh điều hướng < 44 px ở một số máy, không có `aria-label` cho nút biểu tượng.
- Manifest `/ph`: `theme_color` trắng (không phải tím Sata Robo), không có màn offline, SW không lưu gì.
- Trang con hiện `remark` từ điểm danh — đúng (nhận xét cho PH), **không** lộ `private_note` (đã kiểm).
- Dữ liệu PH chỉ theo `student_guardians` của phiên — giữ nguyên nguyên tắc cho mọi procedure mới.

### 1.4 Thứ tự làm

1. Lõi thuần + test (`packages/core/src/portal/`): lịch tháng, dòng thời gian lộ trình, chọn phiếu gần nhất, phân loại phản hồi → việc chăm sóc, nguy cơ HV, mốc học bạ sắp đến.
2. Service phụ huynh (phạm vi theo phiên PH) + route `/api/ph/*` có trần tần suất, audit trong transaction.
3. Trang PH: Hôm nay của con → Lịch học → Yêu cầu của tôi → Hành trình → SataCoin → offline.
4. App GV: trang chủ (phản hồi PH, lối tắt chấm công) → màn Chuẩn bị → ảnh nhanh → Lớp của tôi.
5. Seed + tài liệu.

---

## 2. Kết quả (sau khi làm)

### 2.1 Hành trình trước / sau (số chạm, đã đăng nhập)

| # | Việc | Trước | Sau | Ở đâu |
|---|---|---|---|---|
| P1 | Buổi học tới (giờ, phòng, cơ sở, GV) | 0 · một dòng, không có GV | **0** · thẻ nổi bật đầu trang, có GV + địa chỉ cơ sở + 3 buổi kế | `/ph` |
| P2 | Xin nghỉ một buổi | 4 + gõ, CSKH nhập tay | **2** (Xin nghỉ → "Gửi · cần/không cần học bù"); lý do tuỳ chọn | `/ph`, `/ph/lich` |
| P3 | Nhận xét buổi gần nhất | 2 + cuộn dài | **0** · mức từng tiêu chí, nhận xét, sản phẩm, thẻ nổi bật, ảnh | `/ph` |
| P4 | Đóng học phí | 2 | **1** · "Thanh toán QR" mở thẳng mã QR của đơn | `/ph` → `/ph/hoc-phi?don=…` |
| P5 | Thông báo chưa đọc | 1 | **0** · 3 thông báo mới + chuông có số | `/ph`, mọi trang |
| P6 | Lịch học tháng / tuần | — | **1** · lưới tháng + danh sách, hoặc tuần; buổi thường, học bù, nghỉ lễ, trạng thái điểm danh | `/ph/lich` |
| P7 | Theo dõi yêu cầu | — | **1** · đang xử lý / đã xong, mốc trạng thái, huỷ khi còn "Mới" | `/ph/yeu-cau` |
| P8 | Xin học bù buổi đã vắng | — | **3** (Lịch → Xin học bù → Gửi) | `/ph/lich` |
| P9 | SataCoin của con | 1 · chỉ số dư | **1** · số xu, hạng, lịch sử, quà đổi được, quà đã đổi | `/ph/be/<id>/xu` |
| P10 | Hành trình học + chứng nhận | 1–2 | **1** · dòng thời gian, % buổi, lộ trình, biểu đồ, sản phẩm; chứng nhận **Tải / in** + **Chia sẻ link xác thực** | `/ph/be/<id>` |
| P11 | Phản hồi sau buổi | — | **1** · 👍 / 🙂 / 😟 (+ ghi chú tuỳ chọn) | `/ph` |
| P12 | Nhiều con | cuộn | **1** · chip chuyển nhanh (giữ trên mọi trang) | `/ph`, `/ph/lich`, `/ph/be/<id>` |
| P13 | Hỏi trung tâm | 1 + cuộn | **1** | `/ph/yeu-cau#hoi-dap` |
| P14 | Mở app khi mất mạng | lỗi trình duyệt | màn "Chưa có kết nối" | `/ph/offline` (service worker) |
| G1 | Lịch dạy hôm nay / tuần | 0 | **0** · thêm sĩ số + nút "Chuẩn bị" | `/teacher` |
| G4 | Chuẩn bị buổi dạy | 3+ | **1** | `/teacher/sessions/<id>/chuan-bi` |
| G5 | Chụp & gắn ảnh | 7+ (khu quản trị) | **3** (Chụp → chọn em / "Chọn cả N em" → Tải & gửi duyệt) | màn buổi dạy |
| G6 | Phản hồi của PH | — | **0** · thẻ trên trang chủ + khối trên màn buổi | `/teacher`, `#phan-hoi-ph` |
| G7 | Lớp của tôi: nguy cơ, học bạ mốc | 1 · chỉ tiến độ | **1** · tiến độ %, HV cần quan tâm (lý do), học bạ tới hạn / sắp tới | `/teacher/classes` |
| G8 | Chấm công của tôi | 3 | **1** · tab "Chấm công" | thanh điều hướng GV |

### 2.2 Thiết kế

- **Mobile-first**: một cột ≤ 448px; chữ nền 15px (nhãn phụ 13px, thanh điều hướng 12px kèm biểu tượng); mọi nút / liên kết
  ≥ 44px (`min-h-11`), thẻ chọn cảm xúc 64px; không tràn ngang ở 360px (lưới tháng 7 cột × ô 44px + lề 16px).
- **Thương hiệu**: tím `#610b8a` (thẻ "Buổi học tới", nút chính), cam `#ff8f2d` (xu, cần luyện thêm, "Cần trao đổi"), nền `#fafaf8`.
- **Một chạm**: thao tác ghi dùng bảng trượt từ đáy (`BottomSheet`: Esc / chạm nền để đóng, giữ tiêu điểm, trả tiêu điểm).
- **Trợ năng**: mọi nút biểu tượng có `aria-label` tiếng Việt; `aria-current` trên mục điều hướng / chip con; lưới tháng có nhãn đầy đủ
  cho trình đọc màn hình; thanh tiến độ `role="progressbar"`.
- **PWA**: manifest `/ph/manifest.webmanifest` (tên, màu `#610b8a`, lối tắt Lịch học / Yêu cầu / Học phí); service worker đăng ký
  ngay khi mở `/ph` — chỉ lưu đệm trang `/ph/offline` + biểu tượng, **không** lưu trang có dữ liệu của con.

### 2.3 API mới

Cổng phụ huynh — service `packages/api/src/services/parentHub.ts` (phạm vi theo phiên PH), route handler có `sameOrigin` + trần
`parentActionUser` (60 thao tác / giờ / phụ huynh, dùng chung giữa các bản sao):

| Hàm / route | Việc |
|---|---|
| `familyChildren` | Cửa duy nhất lấy danh sách con: `student_guardians` của phiên + cùng tenant + chưa xoá |
| `hubHome` | Hôm nay của con: buổi tới (+ yêu cầu nghỉ đã gửi), phiếu gần nhất (+ ảnh đã duyệt, cảm xúc), học phí, thông báo |
| `hubSchedule` | Lịch con trong khoảng ngày: buổi lớp mình, học bù đã học / đã xếp, nghỉ lễ, cờ "xin nghỉ được" / "xin học bù được" |
| `hubRequests` | Yêu cầu của các con — chỉ mốc trạng thái, **không** trả ghi chú sự kiện (có thể là ghi chú nội bộ) |
| `POST /api/ph/requests` → `parentSubmitRequest` / `parentCancelRequest` | Xin nghỉ buổi sắp tới / xin học bù buổi đã vắng (trong hạn 30 ngày) / huỷ yêu cầu còn "Mới" do chính PH gửi. Tạo `parent_requests` kênh `app` như CSKH tạo tay: mã `YCyy-nnnnn` (khoá advisory), sự kiện, thông báo CSKH + QLL cơ sở, thông báo "đã nhận" cho PH, `writeAudit` — **một transaction** |
| `POST /api/ph/react` → `parentReact` | Cảm xúc sau buổi con **có mặt** trong 14 ngày: ghi `parent_feedback` (rating 5/4/2 + `reaction`), "Cần trao đổi" mở `care_tasks` `PARENT_CONCERN` (hạn 24h, chống trùng), báo CSKH + GV đứng buổi, `writeAudit` — một transaction. PH sửa được khi dòng do app tạo và CSKH chưa xử lý |
| `hubCoins` | Số xu, hạng, lịch sử (ẩn ghi chú điều chỉnh / thu hồi của nhân sự), quà đổi được, quà đã đổi — chỉ đọc |
| `hubJourney` | Hồ sơ học tập (`buildPortfolio`) + dòng thời gian (`buildJourney`) + tiến độ lộ trình (`pathProgress`) + id chứng nhận |
| `portalCertificate` (certificates.ts) | Giấy chứng nhận **còn hiệu lực** của con để in (`/ph/be/<id>/chung-nhan/<cid>`) |

App giáo viên — `packages/api/src/services/teacherHub.ts`, router `teacher.*` (`protectedProcedure`, quyền `_own`):

| Procedure | Quyền | Việc |
|---|---|---|
| `teacher.feedback` | hồ sơ GV của tài khoản; lọc `teacher_id` = mình + `tenantCond` | Phản hồi (có cảm xúc) 14 ngày của buổi mình dạy |
| `teacher.prep` | `session:read` (own) sau `loadSessionForAuth` (assertTenant); sức khoẻ cần `student:read` (own); tài liệu cần `document:read` (own) | Màn Chuẩn bị |
| `teacher.sessionExtras` | `session:read` (own); sĩ số + đồng ý ảnh chỉ khi có `media:write` (own) | Phản hồi PH của buổi + dữ liệu chụp ảnh nhanh |
| `teacher.classInsights` | `listClasses` theo GV (phạm vi cơ sở + `tenantCond`) | Tiến độ, HV nguy cơ, học bạ mốc |

Ảnh nhanh dùng lại `/api/media/upload` (soi magic bytes, `media:write`) + `learning.submitMedia` — ảnh được giáo vụ duyệt thì tự vào
phiếu nhận xét của các em đã gắn (`evidenceMedia` lọc thêm lần nữa theo đồng ý đăng ảnh). Em chưa đồng ý: hiện cảnh báo, **không** cho gắn.

### 2.4 Dữ liệu

`packages/db/sql/0014_phia_nguoi_dung.sql`: cột `parent_feedback.reaction` (CHECK giá trị + khớp rating), chỉ mục
`parent_feedback (teacher_id, created_at desc)`, `parent_requests (parent_id, created_at desc)`, `attendance (makeup_for_session_id)`.

Luật thuần có kiểm thử: `packages/core/src/portal/family.ts`, `portal/teacher.ts` — `portal.test.ts` (lịch tháng / tuần, dòng thời gian,
chọn phiếu gần nhất + tóm tắt, phản hồi → việc chăm sóc, nguy cơ học viên, học bạ mốc tới hạn, ghi chú chuẩn bị).

### 2.5 Xem thử

Sau `pnpm db:push && pnpm db:apply-sql && pnpm db:seed` (lệnh seed in lại hướng dẫn ở cuối):

- **Phụ huynh**: `/ph/dang-nhap` → SĐT **0911000001** ("Phụ huynh mẫu 1", ba con: Học viên mẫu 1, 11, 2) → "Gửi mã đăng nhập".
  Chế độ phát triển (`ALLOW_DEV_ACTOR=1`, không phải production) hiện mã thử ngay dưới ô nhập ("mã thử: ……") — không gửi Zalo, không có mật khẩu.
  - Chip **Học viên mẫu 2**: phiếu gần nhất có ảnh, thả cảm xúc được; buổi thứ hai sắp tới đã có yêu cầu nghỉ (huỷ được ở "Yêu cầu").
  - Chip **Học viên mẫu 11**: Hành trình → chứng nhận lộ trình + chứng nhận khoá (Tải / in, Chia sẻ link xác thực).
  - Học viên mẫu 1: SataCoin 150 xu + một quà chờ duyệt; buổi tới đã "Đã xin nghỉ".
  - Xin học bù: đăng nhập **0911000006** (Học viên mẫu 6 vắng có phép các buổi chẵn).
- **Giáo viên**: `/login` → `teacher1@satarobo.vn` → `/teacher`: thẻ "Phản hồi của phụ huynh" (👍 / 🙂 / 😟), nút "Chuẩn bị buổi dạy"
  trên buổi sắp tới (Học viên mẫu 4 có lưu ý dị ứng; PH cần trao đổi), "Lớp của tôi" (Học viên mẫu 3, 6 cần quan tâm; học bạ mốc buổi 5).

### 2.6 Cần kiểm lại trên máy thật

- iOS Safari: `capture="environment"` mở camera sau; `createImageBitmap` với ảnh HEIC (nếu lỗi thì tải tệp gốc ≤ 10 MB).
- Android Chrome: `navigator.share` cho link xác thực; iOS < 15 rơi về sao chép.
- Service worker cũ (chỉ push) được thay bằng bản mới khi mở lại app (`skipWaiting` + `clients.claim`); kiểm màn offline ở chế độ máy bay.
- In chứng nhận từ điện thoại (Lưu PDF, Lề: Không, Đồ hoạ nền) trên cả Chrome Android và Safari iOS.
- Vùng an toàn (tai thỏ, thanh home) với thanh điều hướng đáy và bảng trượt.
