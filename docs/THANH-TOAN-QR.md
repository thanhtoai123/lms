# Thanh toán QR → SePay → khoản thu tự xác nhận

Tài liệu kỹ thuật cho luồng thu học phí bằng chuyển khoản. Danh sách việc trước ngày chạy thật ở cuối tệp.

## 1. Luồng

```
Kế toán khai TK nhận (Phương thức thanh toán: BIN + số TK + chủ TK, theo cơ sở hoặc dùng chung)
  → Đơn hàng → "Xuất QR" theo đợt (mã có hạn, mặc định 24 giờ; cổng phụ huynh /ph/hoc-phi cũng hiện QR)
  → Phụ huynh quét bằng app ngân hàng: số TK, số tiền, nội dung "THSTEAM DH26000012" điền sẵn
  → Tiền vào TK ngân hàng → SePay đọc biến động → POST https://<miền>/api/webhooks/sepay
  → Xác thực (HMAC hoặc API Key) → chống trùng theo id → đọc mã đơn trong nội dung → đối khớp
  → Khớp: khoản thu "Đã xác nhận" + số phiếu thu + bút toán sổ cái + QR "Đã dùng" + tính lại trạng thái đơn + báo người tạo đơn
  → Không khớp: Biến động số dư → "Chưa khớp" / "Cần kiểm tra", báo kế toán gắn tay
```

## 2. Mã QR (packages/core/src/finance/vietqr.ts)

- Tự sinh theo chuẩn VietQR (NAPAS 247, EMVCo): mã động `010212`, GUID `A000000727`, dịch vụ `QRIBFTTA`
  (chuyển tới tài khoản), tiền tệ 704, số tiền, nội dung ở `62.08`, CRC-16/CCITT-FALSE. Ảnh là SVG
  `data:` vẽ bằng bộ mã QR thuần TypeScript — **không còn gọi `img.vietqr.io`**.
- Kiểm bằng chuỗi mẫu công bố (TPBank 970423 → CRC `AB76`) và giải mã lại ảnh bằng OpenCV.
- Nội dung chuyển khoản: `THSTEAM <mã đơn bỏ gạch>` — chỉ chữ không dấu và số (ngân hàng hay cắt ký tự lạ).
- Mã xuất trước đây (lưu link img.vietqr.io) được dựng lại ảnh từ BIN / số TK / số tiền / nội dung đã lưu.
- Tài khoản khai sai (BIN không đủ 6 số, số TK có ký tự lạ / dài quá 19) → không vẽ QR, vẫn hiện số TK + nội dung
  để chuyển tay; màn Phương thức thanh toán chặn lưu và có ô **Chọn nhanh ngân hàng** điền BIN.

## 3. Đọc mã đơn trong nội dung (`extractOrderRef`)

- Có tiền tố `THSTEAM` (hoặc `SATA` của mã cũ): lấy đúng `DH yy nnnnnn` / `ORD yymmdd nnnnnn` ngay sau, kể cả khi
  ngân hàng bỏ dấu cách và nối số tài khoản / mã giao dịch phía sau (`…THSTEAMDH260000129876…`).
- Không có tiền tố: chỉ nhận khi mã đứng riêng, không dính thêm chữ số (tránh đọc nhầm).
- Không đọc được → "Chưa khớp", kế toán gắn tay ở Biến động số dư.

## 4. Webhook SePay (apps/web/src/app/api/webhooks/sepay/route.ts)

Theo tài liệu SePay (developer.sepay.vn → SePay Webhooks, tra cứu 21/10/2026):

| Điểm | Xử lý |
|---|---|
| Thành công | HTTP 200 + body **đúng** `{"success": true}` trong 30 giây. Trước đây trả thêm trường `duplicate`, `status` → có thể bị SePay tính là thất bại; đã sửa |
| Gửi lại | 7 lần trong ~33 phút khi lỗi; trả 500 khi lỗi xử lý để SePay gửi lại; quá 33 phút dùng Replay / Đối soát trên SePay |
| Chống trùng | Khoá duy nhất (nguồn, id giao dịch SePay); gửi lại / phát lại trả 200, không tạo khoản thu thứ hai |
| Xác thực HMAC (khuyến nghị) | `SEPAY_WEBHOOK_SECRET`; kiểm `X-SePay-Signature: sha256=<hex>` của `${X-SePay-Timestamp}.${body thô}`, cửa sổ 60 phút |
| Xác thực API Key | `SEPAY_API_KEY` (≥ 24 ký tự), header `Authorization: Apikey <khoá>`; bị bỏ qua khi đã đặt HMAC |
| Tài khoản ảo (VA) | Khớp theo `accountNumber`; không thấy thì thử `subAccount` (trung tâm khai số VA) |
| Nhật ký | Mọi lần gọi ở Hệ thống → Chạy lại webhook; header Authorization được che |
| IP SePay | 172.236.138.20, 172.233.83.68, 171.244.35.2, 151.158.108.68, 151.158.109.79, 103.255.238.139, 45.57.137.67 (có thể đổi — chặn IP ở tường lửa là tuỳ chọn, không bắt buộc) |

## 5. Quy tắc đối khớp (`decideBankMatch`, không đổi)

Tiền ra → Bỏ qua · TK nhận chưa khai → Cần kiểm tra · không có mã đơn / mã không tồn tại → Chưa khớp ·
TK nhận không thuộc cơ sở của đơn → Cần kiểm tra · đơn đã huỷ / hoàn / đã thu đủ → Cần kiểm tra ·
trùng số tiền một khoản sale đã ghi → xác nhận khoản đó · vượt số còn thiếu → Cần kiểm tra · còn lại → tự tạo khoản thu.

## 6. Kiểm thử đầu-cuối

```
pnpm thu-thanh-toan        # máy dev: gửi 8 webhook giả lập đúng định dạng SePay tới localhost:3000 rồi đối chiếu CSDL
```

Từ chối chạy khi `NODE_ENV=production` hoặc CSDL không ở máy này. Tạo một khoản thu kiểm thử 10.000đ (ghi chú KIEM THU).

## 7. Trước ngày thu tiền thật

1. Máy chủ có tên miền + HTTPS; `NODE_ENV=production`; không bật `ALLOW_DEV_ACTOR`; không chạy `db:seed`.
2. Phương thức thanh toán: khai **tài khoản ngân hàng thật** (chọn ngân hàng → BIN tự điền), đúng số TK SePay báo về;
   tắt / xoá phương thức mẫu `0000000000`.
3. SePay: liên kết tài khoản ngân hàng → Tích hợp → Webhooks → Thêm: URL `https://<miền>/api/webhooks/sepay`,
   sự kiện **Tiền vào**, bật **Tự gửi lại**, chọn đúng tài khoản; Bảo mật **HMAC-SHA256** → chép Secret Key vào
   `SEPAY_WEBHOOK_SECRET` (hoặc API Key → `SEPAY_API_KEY`); bật cảnh báo khi lỗi liên tiếp. Không bật
   "Bỏ qua giao dịch không có mã" trừ khi đã cấu hình cấu trúc mã thanh toán trên SePay khớp `THSTEAM`.
4. Bấm **Gửi thử** trên SePay → Hệ thống → Chạy lại webhook phải thấy một dòng "processed" (dữ liệu giả của SePay, vào Chưa khớp hoặc Cần kiểm tra — bình thường).
5. Thử thật: đơn 10.000đ → Xuất QR → quét bằng app ngân hàng → khoản thu tự xác nhận trong vài giây → huỷ / hoàn đơn thử.
6. Kiểm `/tich-hop` và `/van-hanh` đều xanh; sao lưu hằng đêm + thử khôi phục một lần.
