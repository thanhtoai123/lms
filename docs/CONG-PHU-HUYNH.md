# Cổng phụ huynh `/ph` — đa thiết bị và an toàn thông tin

_Khảo sát và dựng lại 26/09/2026. Người dùng: phụ huynh, đăng nhập bằng số điện thoại + mã một lần,
mở chủ yếu từ đường dẫn trong tin Zalo. Dữ liệu hiển thị là dữ liệu của trẻ em — đó là lý do phần
bảo mật ở đây siết hơn trang quản trị ở vài chỗ._

## 1. Đã thao tác thật những gì

Đăng nhập bằng một phụ huynh mẫu trên bản chạy nội bộ (0911000001, mã thử hiện trên giao diện ở
môi trường phát triển) rồi đi hết các màn: Hôm nay · Lịch học (tháng/tuần) · Học phí · Yêu cầu ·
Tin nhắn · Thông báo · Tài khoản · Hành trình học của con. Xem ở ba khổ: 375×812 (điện thoại),
768×1024 (máy tính bảng), 1440×900 (máy tính).

Kết luận gọn: **nội dung đã đúng và đủ, khung hình thì chỉ có một khổ.**

## 2. Những chỗ hỏng đã sửa

### 2.1 Khung khoá cứng ở 448px

`app/ph/layout.tsx` bọc toàn bộ cổng trong `max-w-md`. Trên máy tính 1440px, cổng là một dải hẹp
giữa hai mảng trắng chiếm ~70% màn hình; lịch tháng bị bóp trong 7 cột hẹp còn danh sách buổi phải
cuộn rất dài. Đây không phải lỗi thẩm mỹ: phụ huynh mở trên máy tính ở cơ quan là chuyện thường.

Nay khung chia ba khổ, cùng một mã nguồn:

| Khổ | Điều hướng | Bề rộng nội dung | Bố cục trang |
|---|---|---|---|
| < 768px (điện thoại) | thanh đáy 5 mục, chừa mép cong máy | sát mép, 1 cột | như cũ, không đổi thói quen |
| ≥ 768px (máy tính bảng) | thanh bên cố định 240px, thanh đáy ẩn | tối đa 960px | lưới 2 cột ở Học phí, Tài khoản |
| ≥ 1024px (máy tính) | như trên, thêm mô tả từng mục | tối đa 960px | Hôm nay / Lịch / Yêu cầu tách cột chính – cột phụ |

Giới hạn bề rộng chuyển từ **khung** xuống **từng trang** (`PhMain`, `PhTwoCol` trong
`components/ph-ui.tsx`), nên thêm trang mới không phải nhớ lại luật lề.

### 2.2 Lỗ hổng giả mạo yêu cầu (CSRF) khi thiếu header `Origin`

`sameOrigin()` cũ trả **`true`** khi yêu cầu không có header `Origin`. Mọi route ghi của cổng
(`/api/ph/login`, `/requests`, `/react`, `/messages`, `/account`, `/push`, `/logout`) đều gác bằng
hàm này, nên chỉ cần gửi POST không kèm `Origin` là qua được — mà cookie phiên thì trình duyệt tự
đính vào vì `SameSite=Lax` cho phép POST điều hướng từ trang khác trong một số luồng.

Nay `nguonHopLe()` (`packages/core/src/security/congPhuHuynh.ts`, có kiểm thử):

- `Sec-Fetch-Site: cross-site` hoặc `same-site` → **chặn**;
- có `Origin` → phải khớp host của cổng, hoặc khớp `NEXT_PUBLIC_APP_URL` khi chạy sau proxy;
- `Origin: null` (iframe sandbox, tệp cục bộ) → **chặn**;
- không có `Origin` → chỉ nhận khi `Sec-Fetch-Site` là `same-origin` hoặc `none` (người dùng tự gõ
  địa chỉ / mở từ dấu trang);
- không có cả hai → **chặn**.

### 2.3 Cookie phiên có thể bị miền con ghi đè

Cookie tên `ph_session` không có tiền tố bảo vệ. Một miền con bị chiếm (trang tin, trang tuyển
dụng chạy riêng) đặt được cookie cùng tên cho miền cha và ép phiên của phụ huynh.

Bản chạy thật nay dùng **`__Host-ph_session`** — trình duyệt chỉ nhận khi cookie có `Secure`,
`Path=/` và **không** có `Domain`, tức là không miền con nào ghi được. Bản phát triển chạy
`http://localhost` nên trình duyệt từ chối tiền tố đó, vẫn giữ tên thường. Khi đọc, cổng chấp nhận
cả hai tên; khi đặt hoặc xoá thì dọn cả hai, nên lần triển khai đổi tên không làm rớt ai.

### 2.4 Phiên sống 30 ngày dù không ai dùng

Hạn phiên là 30 ngày tuyệt đối, không có mốc ngưng theo mức dùng. Máy tính bảng để ở nhà, máy
mượn của người thân, máy tính cơ quan — mở một lần rồi bỏ đó vẫn vào thẳng được cả tháng.

Nay thêm **mốc ngưng 14 ngày không thao tác** (`PH_NGUNG_NGAY`): quá mốc thì `parentFromToken`
thu hồi phiên ngay trong CSDL rồi trả `null`, nên màn "Thiết bị đang đăng nhập" cũng sạch theo.
Màn Tài khoản nói rõ luật này và cảnh báo trước 3 ngày.

### 2.5 Dán nguyên chuỗi User-Agent cho phụ huynh đọc

Màn "Thiết bị đang đăng nhập" in nguyên
`Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 … Chrome/152.0.0.0 …`.
Phụ huynh không đọc được thứ đó nên không bao giờ thu hồi thiết bị lạ — tính năng bảo mật có mà
như không. Nay `tenThietBi()` rút thành **"Chrome trên Android"**, kèm cách đăng nhập ("mã qua
Zalo" / "mã kích hoạt") và số ngày còn lại trước khi tự đăng xuất. Cố ý **không** in số phiên bản
hệ điều hành: phụ huynh không cần, mà in ra thì thừa thông tin cho người nhìn trộm màn hình.

## 3. Những chỗ vốn đã chắc — giữ nguyên

- Token phiên 32 byte ngẫu nhiên, **chỉ lưu bản băm SHA-256** trong `parent_sessions`; CSDL rò
  cũng không dựng lại được token.
- Cookie `HttpOnly` + `Secure` (bản thật) → JavaScript không đọc được phiên.
- CSP có **nonce sinh theo từng yêu cầu** + `strict-dynamic`, `script-src-attr 'none'`, cùng HSTS,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` — gắn ở `proxy.ts` cho mọi phản hồi trang.
- `robots: { index: false }` cho toàn cổng.
- Trần gọi dùng chung giữa các bản sao cho đăng nhập (theo IP **và** theo số điện thoại — đổi IP
  không reset được bộ đếm dò mã của một phụ huynh cụ thể), cho gửi tin và cho thao tác.
- Không tiết lộ số điện thoại có tồn tại hay không khi xin mã.
- Mọi route ghi lấy phạm vi từ **phiên**, không nhận `parentId` từ máy khách.
- Số điện thoại hiển thị đã che (`8491xxx0001`).
- Thu hồi từng thiết bị / tất cả thiết bị, có sẵn từ trước.

## 4. Đối chiếu với cổng học viên hệ cũ (`hocvien.satarobo.vn`)

_Chỉ xem, không thao tác trên hệ cũ. Ghi lại cấu trúc, không sao chép dữ liệu._

Hệ cũ dựng cổng theo kiểu **trang quản trị thu nhỏ**: một thanh bên dài ~16 mục
(Tổng quan · Các bé · Lịch học · Nhận xét · Bài tập · Hình ảnh · Bài thi · Kết quả · Bài giảng ·
Học bạ · Học phí & công nợ · Yêu cầu học bù · Khảo sát trung tâm · Đánh giá trung tâm · SataCoin ·
Thông báo), mỗi mục một trang. Trang chủ là lưới thẻ lối tắt cộng một cột thông báo.

Khác biệt cố ý của cổng mình:

| | Hệ cũ | Cổng `/ph` |
|---|---|---|
| Điều hướng | ~16 mục thanh bên, cùng một khổ cho mọi thiết bị | 5 mục theo **việc phụ huynh làm**; thanh đáy trên điện thoại, thanh bên từ 768px |
| Trang chủ | lưới lối tắt + danh sách thông báo | "Hôm nay của con": buổi học tới, nút xin nghỉ một chạm, phiếu nhận xét mới nhất |
| Nhiều con | vào từng mục rồi chọn | chip đổi con ngay đầu trang, giữ nguyên màn đang xem |
| Nhận xét buổi học | một mục riêng phải tự tìm | đẩy lên trang chủ, kèm thanh 4 nấc từng tiêu chí và nút phản hồi cảm xúc |
| Thiết bị đăng nhập | không thấy | có, thu hồi được từng máy |

Những mục hệ cũ có mà `/ph` gộp lại chứ không bỏ: *Bài tập · Hình ảnh · Kết quả · Học bạ ·
Bài giảng · SataCoin* nằm trong **Hành trình học của con** (`/ph/be/[id]`); *Khảo sát · Đánh giá
trung tâm* đi theo đường khảo sát riêng (`/ks`) thay vì thành mục thường trực.

## 5. Còn lại, theo thứ tự đáng làm

1. **Hỏi lại mã trước thao tác nhạy cảm** (đăng xuất tất cả thiết bị, đổi đồng ý quyền riêng tư) —
   hiện chỉ cần phiên còn sống.
2. **Nhật ký đăng nhập cho phụ huynh xem** ("đăng nhập lúc nào, từ thiết bị gì") — nay mới có danh
   sách phiên đang mở.
3. **`Cache-Control: no-store` riêng cho trang `/ph`** — trang đã `force-dynamic`, nhưng nói rõ với
   proxy trung gian thì chắc hơn.
4. **Chế độ ít dữ liệu** cho máy dùng chung: ẩn họ tên đầy đủ của trẻ trên màn hình cho tới khi chạm.
