# Kiểm thử toàn diện qua HTTP thật

`scripts/kiem-thu/kich-ban-toan-dien.ps1` gọi thẳng API tRPC và các route handler của
máy chủ đang chạy, bằng đúng cách trình duyệt gọi. Không mô phỏng, không gọi hàm trong
tiến trình: mọi kiểm tra đều đi qua mạng, qua middleware, qua phân quyền thật.

Bốn bộ:

| Bộ | Nội dung | Số kiểm tra (khi đủ dữ liệu) |
|---|---|---:|
| **A** | Bảo mật — theo `docs/KIEM-DINH-BAO-MAT.md` | 42 |
| **B** | Cách ly dữ liệu theo trung tâm nhượng quyền — theo `docs/NHUONG-QUYEN.md` | 43 |
| **C** | Trải nghiệm một chạm (`inbox`) — theo `docs/TRAI-NGHIEM-MOT-CHAM.md` | 18 |
| **D** | Chạy lại toàn bộ `kich-ban-vai-tro.ps1` (94 bước nghiệp vụ theo 7 vai trò) | 94 |

---

## 1. Điều kiện tiên quyết

Làm đủ theo thứ tự, trên máy Windows của chủ dự án:

```powershell
# 1. Cơ sở dữ liệu
docker compose up -d postgres
pnpm db:push          # dựng bảng theo schema Drizzle
pnpm db:apply-sql     # chạy packages/db/sql/*.sql — BẮT BUỘC, có 0005_nhuong_quyen.sql
pnpm db:seed          # dữ liệu mẫu: 2 cơ sở SATA + 1 bên nhượng quyền FR_HUE

# 2. Máy chủ dev — trong .env phải có ALLOW_DEV_ACTOR=1
pnpm dev              # http://localhost:3000
```

Bắt buộc:

- **`ALLOW_DEV_ACTOR=1`** trong `.env`. Kịch bản đăng nhập bằng **tài khoản mẫu**
  (cookie `x-dev-actor=<email>`), **không có mật khẩu nào trong kịch bản**.
  Cờ này bị vô hiệu tuyệt đối khi `NODE_ENV=production` — nên **không chạy kịch bản
  này trên môi trường thật**.
- **`pnpm db:apply-sql`** đã chạy. Thiếu bước này thì bảng `tenants` chưa có và
  toàn bộ bộ B sẽ báo "bỏ qua".
- **`curl.exe`** (Windows 10/11 có sẵn tại `C:\Windows\System32\curl.exe`).
- **Windows PowerShell 5.1** (kịch bản viết theo cú pháp 5.1, chạy được cả trên PowerShell 7).

## 2. Cách chạy

```powershell
# Chạy tất cả, báo cáo ghi cạnh kịch bản
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-toan-dien.ps1

# Chỉ một bộ
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-toan-dien.ps1 -Only bao-mat
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-toan-dien.ps1 -Only tenant
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-toan-dien.ps1 -Only mot-cham
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-toan-dien.ps1 -Only vai-tro

# Địa chỉ khác + nơi ghi báo cáo khác
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kich-ban-toan-dien.ps1 `
  -BaseUrl http://localhost:3001 -Out D:\bao-cao\kiem-thu-2026-09-18.md
```

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `-BaseUrl` | `http://localhost:3000` | Gốc địa chỉ máy chủ cần kiểm thử |
| `-Out` | `scripts\kiem-thu\bao-cao-kiem-thu.md` | Nơi ghi báo cáo Markdown |
| `-Only` | `tat-ca` | `bao-mat` · `tenant` · `mot-cham` · `vai-tro` · `tat-ca` |

**Mã thoát**: `0` khi không có kiểm tra nào không đạt, `1` khi có — dùng được trong CI.

> `kich-ban-vai-tro.ps1` (bộ D) gọi cứng `http://localhost:3000`, **không theo `-BaseUrl`**.
> Muốn kiểm thử máy chủ ở cổng khác thì chạy lần lượt `-Only bao-mat`, `-Only tenant`,
> `-Only mot-cham` (mỗi lần một bộ, `-Only` chỉ nhận một giá trị), và bỏ bộ D.

## 3. Ý nghĩa từng bộ

### Bộ A — Bảo mật

Đóng lại từng phát hiện trong `docs/KIEM-DINH-BAO-MAT.md`, kiểm tra bản vá còn nguyên:

| Nhóm | Kiểm tra |
|---|---|
| Mạo danh (N1, N2) | Gửi `x-dev-actor` bằng **header** (không phải cookie) → `auth.me` phải trả `null`, không đọc được dữ liệu |
| Chưa đăng nhập | 7 procedure cần quyền phải trả `UNAUTHORIZED`/`FORBIDDEN`, và thông báo lỗi không kèm SĐT / email thật |
| IDOR | Người của cơ sở 1 đọc / sửa lead · học viên · lớp · buổi học · đơn hàng · ghi danh · nhân sự của **cơ sở 2** → phải bị từ chối, và thông báo lỗi không chứa dữ liệu của bản ghi |
| Leo thang quyền | Quản lý cơ sở khoá tài khoản · tư vấn cấp vai trò · tư vấn chốt kỳ công · giáo vụ đổi cấu hình hệ thống · quản lý cơ sở nhân bản trung tâm · kế toán đổi tuỳ chọn quyền riêng tư |
| Tải tệp (C3, C4) | Tệp khai `image/png` nhưng nội dung là mã kịch bản → từ chối; tệp `.svg` → từ chối; tên tệp có `../` → khoá lưu trữ phải được làm sạch; URL phát ảnh có đường dẫn vượt thư mục → từ chối |
| Chống dò (C2, T6) | Đăng nhập cổng phụ huynh sai liên tục và xin OTP liên tục → phải gặp `HTTP 429` |
| Header bảo mật | `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` trên trang HTML |
| Cron (T1) | Gọi `/api/cron/outbox` với bí mật sai → phải từ chối |
| Nhật ký (C5) | Sau khi xuất CSV học viên / lead, `system.audit` phải có thêm dòng `PII_REVEAL`; nhật ký mặc định che SĐT / email |

### Bộ B — Cách ly dữ liệu theo trung tâm (tenant)

Kiểm chứng bảng "ai thấy gì" ở `docs/NHUONG-QUYEN.md` mục 2.4:

- Hội sở chuỗi thấy **số liệu tổng hợp** của `FR_HUE` (số lead, doanh thu 30 ngày, công nợ)
  nhưng **không** thấy dữ liệu cá nhân khi `hoSeesPii = false` — kiểm bằng biểu thức chính quy:
  không còn 10 chữ số liền nhau, email phải chứa `***`, họ tên phải ở dạng rút gọn.
- Danh sách phiếu thu **không có dòng nào** thuộc cơ sở của `FR_HUE` khi
  `hoSeesFinanceDetail = false`, trong khi số tổng hợp vẫn còn.
- Hội sở chuỗi **không tự bật được** công tắc quyền riêng tư của bên nhượng quyền
  (đây là điểm mấu chốt của cách ly — chỉ quản trị của chính trung tâm đó mới đổi được).
- `allowCrossCenterTransfer = false` → chuyển lead sang cơ sở của trung tâm khác bị chặn
  kèm thông báo tiếng Việt; danh sách lớp nhận chuyển lớp của trung tâm khác phải rỗng.
- `assertSameTenant` → đọc bản ghi của trung tâm khác bị từ chối, thông báo không kèm PII.
- Vòng tròn đổi tuỳ chọn: đổi → đọc lại đúng giá trị → **trả về trạng thái ban đầu**.
- Nhân bản một chạm: `tenants.previewProvision` cho bảng kê > 0 dòng; `tenants.provision`
  tạo trung tâm mới mã `QA<ddHHmmss>`; sau đó kiểm chứng trung tâm mới có khoá học / gói /
  mã ca / nhóm quyền được sao chép, **không** có lead / học viên / nhân sự / giao dịch,
  tài khoản quản trị ở trạng thái *chờ kích hoạt* và **không có mật khẩu**,
  và có bản ghi nhật ký kèm lý do. Nhân bản lại cùng mã, mã sai định dạng, lý do quá ngắn
  đều phải bị chặn.

### Bộ C — Trải nghiệm một chạm

- `inbox.today` cho **từng vai trò trong 7 vai trò**: khẳng định **không có nhóm việc nào
  nằm ngoài quyền**. (Không khẳng định chiều ngược lại — nhóm rỗng thì `inbox.today` bỏ đi,
  nên "thiếu nhóm" có thể chỉ là chưa có việc, không phải lỗi phân quyền.)
- Mọi nhóm phải có khoá hợp lệ, `actionKind` là `mutate` hoặc `open`, nhãn nút không rỗng;
  mọi dòng phải đủ `id` / tiêu đề / liên kết "Mở chi tiết".
- `inbox.act` trên 1 dòng hợp lệ → `done = 1`; trộn 1 dòng hợp lệ + 1 dòng ngoài phạm vi →
  dòng sai phải nằm trong `failed`, dòng đúng vẫn chạy.
- `inbox.undo` chỉ chấp nhận nhóm hoàn tác được (hiện chỉ "Việc chăm sóc học viên");
  nhóm khác phải bị chặn kèm thông báo tiếng Việt.
- Đo thời gian phản hồi `inbox.today` cho cả 7 vai trò, cảnh báo nếu > 3 giây.

> Bộ C chỉ chạy hành động thật trên **nhóm an toàn**: *Việc chăm sóc học viên* (hoàn tác được),
> *Lead quá hạn liên hệ*, *Việc hẹn với khách*. Kịch bản **không tự duyệt phiếu thu, hoàn tiền,
> đơn từ hay chứng chỉ** — đó là quyết định có ghi sổ.

### Bộ D — Nghiệp vụ theo vai trò

Chạy lại nguyên `scripts/kiem-thu/kich-ban-vai-tro.ps1` trong một tiến trình con, đọc từng
dòng `PASS` / `FAIL` và gom vào cùng bảng tổng hợp. Xem `docs/KIEM-THU-VAI-TRO.md` cho
chi tiết 94 bước.

## 4. Cách đọc báo cáo

Báo cáo Markdown ở `-Out` có 8 mục:

| Mục | Nội dung |
|---|---|
| 1. Môi trường và thời điểm | Địa chỉ hệ thống, bộ đã chạy, giờ bắt đầu / kết thúc, phiên bản PowerShell |
| 2. Bảng tổng hợp | Đạt / không đạt / bỏ qua theo từng bộ và tổng |
| 3. Các kiểm tra không đạt | **Đọc mục này trước.** Mỗi dòng có kỳ vọng vs thực tế và **gợi ý nguyên nhân** trỏ thẳng vào tệp mã nguồn cần xem |
| 4. Các kiểm tra bị bỏ qua | Môi trường thiếu dữ liệu. Không phải lỗi, nhưng **cũng không phải bằng chứng là đạt** |
| 5. Hiệu năng | Thời gian `inbox.today` từng vai trò; > 3.000 ms bị đánh dấu **chậm** |
| 6. Bản ghi do kịch bản tạo | Danh sách cần **xoá tay**. Kịch bản không bao giờ tự xoá dữ liệu |
| 7. Ghi chú của lần chạy | Điều kiện đặc biệt của lần chạy (tài khoản chờ kích hoạt, trần tần suất đã dùng hết…) |
| 8. Toàn bộ kết quả | Bảng đầy đủ để đối chiếu giữa hai lần chạy |

Trên màn hình, mỗi kiểm tra in một dòng:

```
[PASS] A · A01 header x-dev-actor KHONG duoc nhan la quan tri toi cao
[FAIL] B · B10 SDT trong danh sach lead cua FR_HUE da duoc che — ky vong: khong con 10 chu so lien nhau | thuc te: con SDT day du trong ket qua
[SKIP] B · B18 nguoi cua FR_HUE chi thay co so cua minh — tai khoan FR_HUE dang cho kich hoat
```

Mỗi dòng rút gọn ≤ 300 ký tự và **đã che dữ liệu cá nhân** (SĐT → `<sdt-da-che>`,
email → `<email-da-che>`) trước khi in và trước khi ghi báo cáo.

## 5. Kịch bản tự dọn đến đâu

Kịch bản **không xoá bất kỳ dữ liệu nào** — xoá tự động là rủi ro lớn hơn dữ liệu thừa.
Thay vào đó, mọi bản ghi nó tạo ra đều được đánh dấu và liệt kê ở mục 6 của báo cáo:

| Bản ghi | Dấu nhận biết | Xoá bằng cách |
|---|---|---|
| Trung tâm QA + cơ sở + phòng + danh mục được sao chép | mã trung tâm `QA<ddHHmmss>`, mã cơ sở `QAC<ddHHmmss>` | Xoá theo `tenant_id` của trung tâm đó (ghi trong báo cáo) |
| Tài khoản quản trị của trung tâm QA | email `qa.provision.<dấu thời gian>@example.test` | Xoá dòng `users` + `user_roles` tương ứng |
| Ảnh lớp QA | chú thích `QA-KIEM-THU-<dấu thời gian>` | Xoá dòng `session_media` (id ghi trong báo cáo) |
| Nhật ký `PII_REVEAL` do lệnh xuất CSV của kịch bản sinh ra | thời điểm chạy | Giữ lại là đúng — đó là bằng chứng nhật ký hoạt động |
| Yêu cầu OTP / nhật ký đăng nhập của số điện thoại giả | số bắt đầu bằng `0900` | Tự hết hạn; xoá được nếu muốn |
| Hoạt động lead / việc chăm sóc do `inbox.act` ghi | ghi chú "Kiểm thử tự động" | Giữ lại được; việc chăm sóc đã được `inbox.undo` trả lại |

Ngoài ra kịch bản **đổi tạm** một vài tuỳ chọn rồi **trả về trạng thái ban đầu** ngay trong
cùng lần chạy (`allowCrossCenterTransfer` của `SATA`, và `hoSeesPii` của `FR_HUE` nếu đăng nhập
được bằng quản trị của bên nhượng quyền). Nếu lần chạy bị ngắt giữa chừng, kiểm tra lại hai
công tắc này ở `/nhuong-quyen`.

## 6. Những chỗ kịch bản sẽ tự bỏ qua

Kịch bản không bao giờ dừng vì thiếu dữ liệu — nó ghi `SKIP` kèm lý do:

| Tình huống | Bị bỏ qua |
|---|---|
| Tài khoản quản trị của `FR_HUE` (`quantri@satarobo-hue.test`) ở trạng thái **chờ kích hoạt** trong dữ liệu mẫu | Toàn bộ chiều kiểm tra "người của `FR_HUE` không thấy dữ liệu của `SATA`", và vòng tròn bật / tắt `hoSeesPii` (B18–B22). Muốn chạy đủ: vào *Hệ thống → Tài khoản*, mở khoá tài khoản đó rồi chạy lại |
| Chưa chạy `pnpm db:apply-sql` nên chưa có bảng `tenants` | Gần như toàn bộ bộ B |
| `FR_HUE` chưa có học viên / phiếu thu trong dữ liệu mẫu | Các kiểm tra che PII của danh sách học viên và chi tiết tài chính của bên nhượng quyền |
| Cơ sở 2 chưa có lead / lớp / buổi / đơn hàng / ghi danh / nhân sự mẫu | Đúng kiểm tra IDOR tương ứng (mỗi loại bản ghi bỏ qua riêng) |
| Không lấy được buổi học mẫu ở cơ sở 1 | Ba kiểm tra tải tệp |
| `CRON_SECRET` chưa đặt (máy phát triển cho gọi tay) | Kiểm tra cron — đặt `CRON_SECRET` rồi chạy lại để kiểm tra thật |
| Hộp "Việc hôm nay" của quản trị không có nhóm việc an toàn nào | `inbox.act` / `inbox.undo` (C11–C13) |
| Không tìm thấy `kich-ban-vai-tro.ps1` hoặc nó không in dòng `PASS`/`FAIL` nào | Bộ D |

Dòng `SKIP` **không làm kịch bản trả mã thoát 1**. Đọc mục 4 của báo cáo để biết phần nào
chưa thật sự được kiểm chứng trong lần chạy đó.

## 7. Lưu ý khi chạy lại nhiều lần

- Hai lần chạy cách nhau **dưới 1 giây** sẽ đụng mã trung tâm QA (mã sinh theo `ddHHmmss`).
  Thực tế không xảy ra vì một lần chạy mất vài chục giây.
- Bộ A dùng hết hạn mức chống dò của địa chỉ IP đang chạy: **15 phút** cho cổng phụ huynh,
  **1 giờ** cho OTP. Chạy lại ngay thì hai kiểm tra đó vẫn đạt (đang bị chặn sẵn), nhưng
  kiểm thử tay trên cùng máy sẽ bị chặn — chờ hết khoảng đó hoặc khởi động lại `pnpm dev`.
- Mỗi lần chạy đủ bộ B tạo thêm **một trung tâm QA**. Xoá bớt định kỳ theo mục 6 của báo cáo.
- Báo cáo mặc định ghi đè tệp cũ. Muốn giữ lịch sử thì truyền `-Out` kèm ngày.
