# Zalo CRM — khảo sát nền tảng & kế hoạch cải tiến

_Khảo sát ngày 24/09/2026: đọc tài liệu chính thức `developers.zalo.me` và rà soát toàn bộ mã Zalo
trong hệ thống. Tài liệu này là căn cứ để sửa — không phải mô tả cái đang có._

## 1. Bốn thay đổi của nền tảng Zalo mà hệ thống ta đang hiểu SAI

| Điều hệ thống đang làm | Thực tế nền tảng (09/2026) | Hậu quả |
|---|---|---|
| `replyWindow()` cho Zalo = **7 ngày** kể từ tin đến cuối | Từ **01/01/2026** tin Tư vấn miễn phí **không giới hạn trong khung 48 giờ**; ngoài khung phải dùng tin theo mẫu | Nhân viên gõ trả lời ở giờ thứ 50, hệ thống cho gửi, Zalo từ chối → tin `failed`, khách không nhận được mà không ai biết |
| Token đọc thẳng từ `ZALO_OA_ACCESS_TOKEN` trong `.env` | Access token sống **25 giờ**; refresh token sống **3 tháng**, **dùng một lần và xoay vòng** (dùng xong bị vô hiệu, Zalo trả token mới) | Sau 25 giờ toàn bộ tin Zalo chết im lặng. Phải sửa `.env` + khởi động lại mỗi ngày |
| ZNS gọi `business.openapi.zalo.me/message/template`, coi như dịch vụ riêng | Từ **01/01/2026** ZNS hợp nhất vào **ZBS Template Message**. Endpoint giữ nguyên, nhưng phản hồi nay trả **`data.quota.dailyQuota` / `remainingQuota`** và **`sending_mode`** | Ta không biết hạn mức ngày còn bao nhiêu → đến chiều hết quota là hàng loạt tin lỗi, không cảnh báo trước |
| Webhook chỉ xử lý `user_send_*` | Còn `follow` / `unfollow` (biết ai còn quan tâm OA), `user_submit_info` (khách bấm nút chia sẻ tên + SĐT), `user_received_message` (ZNS đã tới máy) | Không biết ai rời OA; không nhận được SĐT khách tự gửi; không bao giờ biết tin ZNS có tới nơi không |

Chi tiết token (bản ghi chính thức, dùng để lập trình):

```
POST https://oauth.zaloapp.com/v4/oa/access_token
Content-Type: application/x-www-form-urlencoded
Header:  secret_key: <app secret>
Body:    app_id, grant_type=refresh_token, refresh_token=<token hiện có>
Trả về:  { access_token (25 giờ), refresh_token (MỚI, 3 tháng), expires_in }
```

Quy tắc sống còn: **refresh token cũ bị vô hiệu ngay sau khi refresh thành công** — nên phải lưu
token mới vào CSDL trong cùng một giao dịch, và **không được để hai tiến trình cùng refresh**
(cái chạy sau sẽ nhận lỗi và làm hỏng chuỗi token, phải đi xin lại `authorization_code` bằng tay).

## 2. Mười khoảng trống trong hệ thống ta

| # | Khoảng trống | Ở đâu | Mức |
|---|---|---|---|
| 1 | Không có vòng đời token (không refresh, không lưu, không cảnh báo sắp hết hạn) | `services/messaging.ts`, `services/delivery.ts` | **Chặn chạy thật** |
| 2 | Cửa sổ trả lời Zalo sai (7 ngày thay vì 48 giờ) | `core/outreach/rules.ts` | **Chặn chạy thật** |
| 3 | Đồng ý nhận tin không được thực thi: `marketingOptOut` có `select` nhưng **không dùng** trong vòng gửi; `sendBroadcast` cũng không lọc | `services/delivery.ts`, `services/care.ts` | **Pháp lý** (NĐ 13/2023, Luật BVDLCN 2025) |
| 4 | Hàng đợi ZNS **không khoá dòng** (`for update skip locked`) | `services/delivery.ts` | Hai worker = gửi trùng, mất tiền |
| 5 | Tin OA gửi ra **không có hàng đợi, không retry, không nút gửi lại** | `services/messaging.ts` | Mất tin khi mạng chớp |
| 6 | Không nhận callback trạng thái ZNS ⇒ `sent` không đồng nghĩa "đã tới" | webhook Zalo | Không đối soát được chi phí |
| 7 | Chạy lại webhook không hỗ trợ nguồn `zalo` (UI có chip, `replayWebhook` không có nhánh) | `services/admin.ts` | Sự kiện lỗi là mất vĩnh viễn |
| 8 | `conversations` / `messages` **thiếu `tenant_id`** | `db/schema/outreach.ts` | Rò dữ liệu giữa các trung tâm nhượng quyền |
| 9 | Hết cửa sổ không có lối ra: hệ thống bảo "hãy dùng ZNS" nhưng màn `/tin-nhan` không có nút gửi ZNS | `tin-nhan/client.tsx` | Nhân viên phải mở tab khác, gõ lại |
| 10 | Mẫu tin nằm trong JSON `app_settings`, gõ `template_id` bằng tay, không đồng bộ từ Zalo | `services/delivery.ts` | Sai một ký tự là cả loạt tin hỏng |

## 3. Cơ hội CRM mà nền tảng cho phép nhưng ta chưa dùng

- **Nút "chia sẻ thông tin" ngay trong chat** (`template_type: request_user_info`): khách bấm một lần,
  Zalo gửi về `user_submit_info` kèm **tên + số điện thoại**. Biến một hội thoại ẩn danh thành **lead
  có SĐT, có đồng ý**, không phải hỏi tay. Đây là tính năng đáng giá nhất trong cả danh sách.
- **`follow` / `unfollow`**: gắn `zalo_id` vào hồ sơ phụ huynh ngay khi họ quan tâm OA ⇒ về sau gửi
  tin theo `user_id` (miễn phí trong 48 giờ) thay vì ZNS theo SĐT (mất phí).
- **Hạn mức ngày trả về theo từng lần gửi**: hiển thị "còn 320/500 tin hôm nay" và **tự dừng khi sắp
  cạn**, thay vì gửi tới khi Zalo chặn.
- **`quota_type`** (`reply` / `welcome_msg` / `sub_quota`): biết tin vừa rồi tiêu vào nguồn nào —
  căn cứ để báo cáo chi phí thật thay vì ước lượng.

## 4. Kế hoạch ba đợt

**Đợt 1 — Không có thì không chạy thật được** (ưu tiên tuyệt đối)

1. Bảng `zalo_tokens` (OA id, access token + hạn, refresh token, cập nhật lúc nào, lần lỗi cuối) +
   dịch vụ `zaloToken()` tự refresh khi còn < 2 giờ, khoá bằng `pg_advisory_lock` để không refresh đôi;
   màn `/tich-hop` hiện hạn token và nút "Làm mới ngay".
2. Sửa cửa sổ Zalo **48 giờ**, kèm đồng hồ đếm ngược trong `/tin-nhan` ("còn 6 giờ 20 phút").
3. Thực thi `marketingOptOut` ở **cả ba** đường gửi (hàng đợi, broadcast, tin tư vấn) + kiểm thử.
4. `for update skip locked` cho `parent_notifications`.

**Đợt 2 — Đúng nghiệp vụ CRM**

5. Webhook nhận `follow` / `unfollow` / `user_submit_info` / `user_received_message`; ghi `zalo_id`,
   cập nhật trạng thái "đã tới máy" cho ZNS, tạo lead từ thông tin khách tự chia sẻ.
6. Nút **"Xin thông tin"** trong `/tin-nhan` (gửi `request_user_info`).
7. Nút **gửi ZNS ngay trong hội thoại** khi quá 48 giờ; hàng đợi + retry cho tin OA; nút gửi lại tin lỗi.
8. Chạy lại webhook cho nguồn `zalo`.

**Đợt 3 — Vận hành & tiền**

9. Bảng mẫu tin thật (đồng bộ danh sách + trạng thái duyệt từ Zalo), thay cho JSON gõ tay.
10. Bảng điều khiển hạn mức + chi phí ngày/tháng theo `quota_type`, cảnh báo khi còn < 20% hạn mức.
11. `tenant_id` cho `conversations` / `messages` + lọc theo trung tâm.

## 5. Nguồn

- Xác thực & ủy quyền OA (token 25 giờ, refresh xoay vòng 3 tháng): developers.zalo.me — "Xác thực và ủy quyền cho Ứng dụng".
- Tin Tư vấn dạng văn bản (khung 48 giờ từ 01/01/2026, `quota_type`): developers.zalo.me — "Gửi tin Tư vấn dạng văn bản".
- Tin Tư vấn mẫu xin thông tin (`request_user_info`): developers.zalo.me — cùng mục Tin Tư vấn.
- ZBS Template Message (hợp nhất ZNS từ 01/01/2026, `dailyQuota` / `remainingQuota`): developers.zalo.me — "API Gửi tin".
- Sự kiện người dùng nhận thông báo (`user_received_message`, chữ ký `X-ZEvent-Signature`): developers.zalo.me — mục Webhook.
