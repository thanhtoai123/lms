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
  kèm thông báo tiếng Việt; danh sách lớp nhận chuyển lớp **không được lẫn lớp của trung tâm
  khác** — kịch bản dựng bản đồ cơ sở → trung tâm từ `tenants.get` rồi đối chiếu tenant của
  từng lớp với tenant của ghi danh, chứ không đếm số lựa chọn.
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
  nên "thiếu nhóm" có thể chỉ là chưa có việc, không phải lỗi phân quyền; kịch bản ghi
  chú những nhóm như vậy ở mục 7 của báo cáo.)

  Kỳ vọng **không** được suy từ tên tài khoản. Kịch bản đọc sống từ chính hệ thống:

  | Nguồn | Dùng để |
  |---|---|
  | `auth.me` (gọi bằng chính tài khoản đó) | vai trò đang hiệu lực của tài khoản |
  | `system.roles` | ma trận vai trò → danh sách quyền + nhãn tiếng Việt |
  | `admin.groups` + `admin.group` | quyền cấp thêm theo nhóm người dùng (chỉ cộng thêm) |
  | Bảng nhóm việc → quyền trong kịch bản | lấy đúng từ `canAnywhere(...)` ở `packages/api/src/services/inbox.ts` |

  Rồi khớp theo đúng luật `matches()` của `packages/core/src/policy/policy.ts` (hiểu `*` và
  `*_own`). Nhờ vậy đổi ma trận quyền trong mã nguồn thì kịch bản tự theo. Chỉ còn **một**
  bảng phải cập nhật tay: nhóm việc → quyền, và chỉ khi `inbox.ts` thêm nhóm mới.

  > Ví dụ vì sao không suy theo tên: `giaovu.cs1@example.test` là **CENTER_CLASS_MANAGER**
  > (có `session:*`, `attendance:*`, `media:*`, `report_card:*`, `completion:*`), không phải
  > vai trò Đào tạo. Nó thấy 5 nhóm việc học vụ là **đúng quyền**.
- Mọi nhóm phải có khoá hợp lệ, `actionKind` là `mutate` hoặc `open`, nhãn nút không rỗng;
  mọi dòng phải đủ `id` / tiêu đề / liên kết "Mở chi tiết".
- `inbox.act` trên 1 dòng hợp lệ → `done = 1`; trộn 1 dòng hợp lệ + 1 dòng ngoài phạm vi →
  dòng sai phải nằm trong `failed`, dòng đúng vẫn chạy.
- `inbox.undo` chỉ chấp nhận nhóm hoàn tác được (hiện chỉ "Việc chăm sóc học viên");
  nhóm khác phải bị chặn kèm thông báo tiếng Việt.
- Đo thời gian phản hồi `inbox.today` cho cả 7 vai trò, cảnh báo nếu > 3 giây.

> Bộ C chỉ chạy hành động thật trên **nhóm an toàn**: *Việc chăm sóc học viên* (hoàn tác được),
> *Lead quá hạn liên hệ*, *Việc hẹn với khách*. Kịch bản **không tự duyệt phiếu thu, hoàn tiền,
> đơn từ hay chứng nhận** — đó là quyết định có ghi sổ.

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
| Ảnh lớp QA (đánh dấu **ảnh chung cả lớp** để không chặn luồng duyệt ảnh của kịch bản khác) | chú thích `QA-KIEM-THU-<dấu thời gian>` | Xoá dòng `session_media` (id ghi trong báo cáo) |
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
| Không đăng nhập được bằng tài khoản nào của `FR_HUE` (`giamdoc@satarobo-hue.test` đang hoạt động, `quantri@satarobo-hue.test` chờ kích hoạt) | Toàn bộ chiều kiểm tra "người của `FR_HUE` không thấy dữ liệu của `SATA`", và vòng tròn bật / tắt `hoSeesPii` (B18–B22). Chạy lại `pnpm db:seed` để có tài khoản mẫu đang hoạt động |
| Chưa chạy `pnpm db:apply-sql` nên chưa có bảng `tenants` | Gần như toàn bộ bộ B |
| `FR_HUE` chưa có học viên / phiếu thu trong dữ liệu mẫu | Các kiểm tra che PII của danh sách học viên và chi tiết tài chính của bên nhượng quyền |
| Không có trung tâm thứ hai nào **đang có lớp** để đối chiếu | B16 (lớp nhận chuyển lớp lẫn tenant khác) |
| Cơ sở 2 chưa có lead / lớp / buổi / đơn hàng / ghi danh / nhân sự mẫu | Đúng kiểm tra IDOR tương ứng (mỗi loại bản ghi bỏ qua riêng) |
| Không lấy được buổi học mẫu ở cơ sở 1 | Ba kiểm tra tải tệp |
| Tài khoản giáo vụ không tải lên được ảnh ở buổi mẫu (HTTP 401/403) | A28 / A29 |
| `CRON_SECRET` chưa đặt (máy phát triển cho gọi tay) | Kiểm tra cron — đặt `CRON_SECRET` rồi chạy lại để kiểm tra thật |
| Không đọc được `system.roles` (ma trận vai trò) | Phần đối chiếu quyền của C01–C07 (vẫn kiểm tra hình dạng dữ liệu) |
| Một tài khoản mẫu không đăng nhập được | Đúng dòng C của tài khoản đó |
| Hộp "Việc hôm nay" của quản trị không có nhóm việc an toàn nào | `inbox.act` / `inbox.undo` (C11–C13) |
| Không tìm thấy `kich-ban-vai-tro.ps1` hoặc nó không in dòng `PASS`/`FAIL` nào | Bộ D |

Bộ D (`kich-ban-vai-tro.ps1`) tự bỏ qua thêm hai chỗ, in ra dòng `SKIP` (không tính vào
PASS/FAIL của báo cáo gộp):

| Tình huống | Bị bỏ qua |
|---|---|
| Không có buổi `scheduled` nào **đã diễn ra** thuộc lớp còn học viên | F2–F6 (điểm danh, chờ xếp bù, chốt buổi, xác nhận bài, nhận xét) |
| Kho ảnh lớp không có ảnh nào đã gắn học viên hoặc đánh dấu ảnh chung | G2–G5 (gửi duyệt → loại → khôi phục) |

Dòng `SKIP` **không làm kịch bản trả mã thoát 1**. Đọc mục 4 của báo cáo để biết phần nào
chưa thật sự được kiểm chứng trong lần chạy đó.

## 7. Bốn quy tắc khi thêm kiểm tra mới

Rút ra từ hai đợt chạy thật đầu tiên — cả chín mục không đạt đều là khiếm khuyết của **kịch bản**,
không phải của sản phẩm.

1. **Khẳng định `ok` của NGHIỆP VỤ, không phải `ok` của HTTP.**
   Các thủ tục hàng loạt (`learning.submitMedia` / `reviewMedia` / `restoreMedia`,
   `admissions.leads.bulkConvert`, các thủ tục học bạ hàng loạt) trả về
   `{ results, ok, failed }` — `ok` là **số dòng thành công**. Lời gọi thành công mà `ok = 0`
   vẫn là hỏng; phải đọc `results[].message` để biết lý do thật. Tương tự, `inbox.act` trả
   `{ done, failed }` và `/api/media/upload` trả `{ ok, uploaded, results }`.

2. **Đọc đúng trường mảng, đừng đếm thẳng đối tượng.**
   `students.enrollments` trả `{ total, page, pageSize, counts, items }`,
   `students.eligibleClasses` trả `{ source, canWaive, items }`, `finance.payments` và
   `system.audit` trả `{ total, …, items }`. `@($doiTuong).Count` **luôn bằng 1** nên trông
   như "có 1 kết quả". Dùng `Rows $r.data.items`, và với nhật ký thì so `total` chứ đừng đếm
   số dòng của một trang.

3. **Đừng suy kỳ vọng từ tên tài khoản; đọc quyền sống từ hệ thống.**
   Tên `giaovu.cs1@…` không nói lên vai trò. Lấy vai trò bằng `auth.me`, ma trận quyền bằng
   `system.roles`, quyền nhóm bằng `admin.groups`, rồi khớp theo luật `matches()`.
   Và chọn dữ liệu mẫu **có kiểm tra tiền đề** (buổi học phải đã diễn ra và lớp còn học viên;
   ảnh phải đủ điều kiện gửi duyệt), thay vì lấy phần tử đầu danh sách.

4. **Gọi đúng thủ tục, và nhớ `@($null).Count = 1`.**
   `academics.classes.workspace` là màn **cấu hình lớp** (`info`, `groupOptions`, `phases`) —
   nó **không** có `roster`. Danh sách học viên của lớp nằm ở `academics.classes.get`.
   Gọi nhầm thì `$ws.roster` là `$null`, mà trong PowerShell `@($null).Count` bằng **1**,
   nên phép đếm "sĩ số > 0" vẫn đúng và lỗi chỉ lộ ra ở bước sau dưới dạng khó hiểu
   (`Expected string, received null`). Luôn kiểm tra `$null -ne $x.truong` **trước** khi đếm.


## 8. Lưu ý khi chạy lại nhiều lần

- Hai lần chạy cách nhau **dưới 1 giây** sẽ đụng mã trung tâm QA (mã sinh theo `ddHHmmss`).
  Thực tế không xảy ra vì một lần chạy mất vài chục giây.
- Bộ A dùng hết hạn mức chống dò của địa chỉ IP đang chạy: **15 phút** cho cổng phụ huynh,
  **1 giờ** cho OTP. Chạy lại ngay thì hai kiểm tra đó vẫn đạt (đang bị chặn sẵn), nhưng
  kiểm thử tay trên cùng máy sẽ bị chặn — chờ hết khoảng đó hoặc khởi động lại `pnpm dev`.
- Mỗi lần chạy đủ bộ B tạo thêm **một trung tâm QA**. Xoá bớt định kỳ theo mục 6 của báo cáo.
- Bộ A để lại một ảnh lớp QA trong kho của lớp. Ảnh này được đánh dấu *ảnh chung cả lớp* nên
  đủ điều kiện gửi duyệt và **không** làm hỏng luồng kho → gửi duyệt → loại → khôi phục mà
  bộ D kiểm thử; vẫn nên xoá bớt sau vài lần chạy.
- Báo cáo mặc định ghi đè tệp cũ. Muốn giữ lịch sử thì truyền `-Out` kèm ngày.


## 9. Kiểm tra menu quản trị (`kiem-tra-menu.ps1`)

Kịch bản riêng, chỉ đọc (không tạo dữ liệu), kiểm tra cây menu mới (docs/KIEN-TRUC-MENU.md) trên máy chủ thật với **7 tài khoản mẫu**
(cookie `x-dev-actor`, cần `ALLOW_DEV_ACTOR=1` như các bộ khác). Cây menu đọc từ `scripts/kiem-thu/menu-manifest.json`
— tệp sinh từ `packages/core/src/nav/menu.ts`, bộ test core báo lỗi nếu tệp cũ.

```powershell
# Trước lần chạy đầu sau khi đổi menu: build lại core (apps/web đọc @satarobo/core từ dist/)
pnpm --filter @satarobo/core build

# Chạy cả 7 tài khoản, báo cáo ghi cạnh kịch bản (scripts\kiem-thu\bao-cao-kiem-tra-menu.md)
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kiem-tra-menu.ps1

# Một tài khoản, máy chủ khác, nơi ghi báo cáo khác
powershell -ExecutionPolicy Bypass -File scripts\kiem-thu\kiem-tra-menu.ps1 -Only teacher1 `
  -BaseUrl http://localhost:3001 -Out D:\bao-cao\menu-2026-09-22.md
```

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `-BaseUrl` | `http://localhost:3000` | Gốc địa chỉ máy chủ |
| `-Out` | `scripts\kiem-thu\bao-cao-kiem-tra-menu.md` | Báo cáo Markdown |
| `-Manifest` | `scripts\kiem-thu\menu-manifest.json` | Bản kê cây menu |
| `-Only` | *(trống = cả 7)* | Tên ngắn (`teacher1`, `ketoan.cs1`…) hoặc email của một tài khoản |

Với mỗi tài khoản:

1. Mở `/viec-hom-nay`, đọc các `data-nav-href` trong sidebar = **mục menu người đó được thấy** (layout đã lọc quyền; nhóm thu gọn vẫn có trong HTML).
2. Mở **mọi mục** → phải `200`, HTML không có dấu hiệu lỗi (`__next_error__`, `Application error`, lỗi máy chủ `data-dgst`), và **không** báo
   "không có quyền" (menu hiện mà trang từ chối = lệch quyền). Đọc dải chip (`data-nav-tab`) của trang trung tâm và mở **mọi chip** theo cùng tiêu chí.
3. Mọi đường dẫn của cây menu mà người đó **không** thấy → phải bị từ chối: `401/403/404`, chuyển về `/login`, trang *"chưa có quyền xem mục này"*,
   *"Không có quyền truy cập"* hoặc lỗi `FORBIDDEN` từ service. Trang ẩn mà vẫn mở ra bình thường = **FAIL (có thể lộ dữ liệu)**.
   Ngoại lệ có chủ đích (chỉ ẩn khỏi menu): `/bao-cao/sau-go-live`, `/bao-cao/chat-pilot` → SKIP.
4. Mọi đường cũ trong bảng chuyển hướng (`/hoc-ba`, `/report-cards`) → `307/308` đúng đích; thử thêm `?student=` / `?class=` phải được giữ nguyên
   trên đích; đích mở được (hoặc từ chối đúng với người không có quyền học bạ).
5. Trang rời sidebar nhưng vẫn dùng (`/bao-mat`) → `200`.

Báo cáo gồm bảng theo tài khoản (mục thấy, chip, trang ẩn đã thử, PASS / FAIL), danh sách FAIL, SKIP và toàn bộ kết quả. Mã thoát `1` khi có FAIL.
Lần chạy đầu trên `pnpm dev` chậm vì Next biên dịch từng trang (mỗi trang tối đa 180 giây).
