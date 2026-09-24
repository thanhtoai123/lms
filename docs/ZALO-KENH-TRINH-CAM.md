# Tích hợp Zalo CRM vào hệ thống — khảo sát các trình cắm (plugin) và kiến trúc kênh

_Khảo sát 24/09/2026. Căn cứ: ảnh màn hình công cụ trung tâm đang dùng + tài liệu chính thức của Zalo
+ mã nguồn/tài liệu của các công cụ Zalo CRM phổ biến. Tài liệu này để **chốt đường đi**, chưa phải mô
tả cái đã có._

## 1. Công cụ trong ảnh là loại nào

Giao diện anh gửi (Dashboard · Tin nhắn · Bạn bè · Khách hàng · Lịch hẹn · Kho ảnh · Marketing · Báo
cáo, bộ lọc "Chưa trả lời / Bot trả lời (No Sale) / Sale đã trả lời", "Điểm & Trạng thái", "Sinh nhật
7 ngày tới", "Lịch hẹn 24h tới") trùng khớp với **ZCRM v3.4** (mã nguồn mở `ZaloCRM`, AGPL-3.0).

Điều quan trọng nhất: **nó chạy trên Zalo cá nhân, không phải Zalo OA.** Nó đăng nhập nick Zalo của
nhân viên qua thư viện `zca-js` (giả lập Zalo Web), nên mới có "Bạn bè", "Kho ảnh", quét nhóm — những
thứ OA không có. Kèm theo là ba ràng buộc:

| Ràng buộc | Chi tiết |
|---|---|
| **Không phải API chính thức** | Chính tài liệu `zca-js` ghi: *dùng API này có thể khiến tài khoản bị khoá, chúng tôi không chịu trách nhiệm*. ZCRM ghi rõ có thể **vi phạm điều khoản Zalo**, người dùng tự chịu trách nhiệm |
| **Hạn mức tự đặt ~200 tin/ngày/nick** | Chính ZCRM chặn để giảm nguy cơ bị khoá |
| **Mỗi nick chỉ một phiên nghe** | Mở Zalo Web trên trình duyệt là phiên nghe của công cụ bị ngắt |

Điểm sáng: ZCRM **có sẵn cửa tích hợp** — REST API (`X-API-Key`) và webhook. Đây chính là chỗ hệ
thống của mình cắm vào:

```
API   GET/POST /api/public/contacts        · POST /api/public/messages/send
      POST     /api/v1/conversations/:id/attachments
      GET      /api/public/appointments
Webhook  message.received · message.sent · contact.created · zalo.connected · zalo.disconnected
```

> Giấy phép AGPL-3.0 chỉ ràng buộc nếu ta **nhúng mã** của nó. **Gọi HTTP API của nó thì không dính** —
> đây là lý do kỹ thuật lẫn pháp lý để tích hợp qua API chứ không bê mã vào hệ thống.

## 2. Bốn đường vào Zalo — chọn đúng việc cho đúng đường

| Đường | Nhắn được cho ai | Chi phí | Chính thức | Hợp với việc gì ở trung tâm |
|---|---|---|---|---|
| **OA — tin Tư vấn** | Người đã nhắn OA, trong **48 giờ** kể từ tin cuối của họ | Miễn phí, không giới hạn số tin | ✅ | Trả lời phụ huynh hỏi khoá học, chăm lead nóng |
| **ZNS / ZBS Template** | Bất kỳ số điện thoại nào (có mẫu duyệt) | Tính phí mỗi tin, mẫu duyệt 1–3 ngày | ✅ | Nhắc học phí, nhắc lịch học, mã OTP, học bạ |
| **Zalo Bot API** | Người đã bấm chat với bot | Miễn phí (chưa công bố hạn mức) | ✅ | Tự động hỏi đáp, tra cứu lịch học/công nợ, gửi nhắc cho khách đã chat bot |
| **Zalo cá nhân** (ZCRM/zca-js, Pancake "Zalo cá nhân") | Bạn bè trong nick nhân viên | Miễn phí, ~200 tin/ngày/nick | ❌ rủi ro khoá nick | Bán hàng 1-1 như đang làm, kết bạn phụ huynh, chat nhóm lớp |

Zalo Bot (mới, kiểu Telegram) đáng chú ý vì nó **chính thức mà vẫn tự động hoá được**:

```
Tạo bot: mở Zalo → OA "Zalo Bot Manager" → Tạo bot → nhận Bot Token qua tin nhắn
Gọi API: POST https://bot-api.zaloplatforms.com/bot<TOKEN>/sendMessage   (1–2000 ký tự)
         /getMe · /setWebhook · /getWebhookInfo · /getUpdates
SDK:     Node.js, Python, Java
```

**Kết luận chọn đường:** giữ cả bốn, nhưng mỗi kênh đúng vai — OA và ZNS là kênh chính thức của trung
tâm (đã làm xong Đợt 1), Bot là kênh tự phục vụ, còn Zalo cá nhân là **kênh của nhân viên kinh doanh**
và nên nằm **ngoài** hệ thống (ở ZCRM), chỉ đổ dữ liệu về.

## 3. Nguyên tắc: không bê Zalo cá nhân vào trong hệ thống

Ba lý do, theo thứ tự quan trọng:

1. **Rủi ro khoá nick không được phép làm sập hệ thống sổ sách.** Nếu tiến trình `zca-js` nằm trong máy
   chủ LMS, Zalo siết một cái là kéo theo cả web học vụ (cùng tiến trình, cùng log, cùng cảnh báo).
2. **AGPL-3.0**: nhúng mã ZCRM ⇒ toàn bộ hệ thống phải mở mã nguồn. Gọi API thì không.
3. **Tách trách nhiệm**: ZCRM giỏi việc chat (đa nick, bot, kho ảnh); LMS giỏi việc sổ sách (lead → ghi
   danh → học phí → lớp). Ghép hai vai vào một chỗ là chỗ nào cũng làm nửa vời.

Vậy mô hình là: **ZCRM (hoặc Pancake) = tổng đài chat · LMS = sổ cái**, nối nhau bằng một tầng trình
cắm kênh.

## 4. Kiến trúc trình cắm kênh (channel adapter) trong hệ thống ta

Hệ thống đã có sẵn ba mảnh để làm việc này, không phải xây lại:

- `conversations.channel` (enum `msg_channel`: `portal` · `messenger` · `zalo`) + `conversations_ext_uq`
  (chống trùng theo `channel + external_id`);
- `ingestExternal(db, { channel, senderId, text, messageId, at, attachments })` — **cửa vào chung** đã
  dùng cho Messenger và Zalo OA;
- `webhook_events` (nguồn, chữ ký, trạng thái, chạy lại) + `logWebhook()`.

Phần cần thêm:

**4.1 Thêm kênh.** `MSG_CHANNELS` thêm `zalo_ca_nhan` và `zalo_bot`; nhãn tiếng Việt "Zalo cá nhân",
"Zalo Bot". Kèm migration enum (kiểu như `0015`).

**4.2 Bảng `channel_accounts`** — một trung tâm có nhiều nick Zalo, nhiều OA:

```
id · channel · label ("Nick CS2 - chị Hà") · external_id · center_id
base_url · api_key_enc · webhook_secret_enc   (mã hoá bằng sealWith, không hiện lại)
status (online|offline|error) · last_seen_at · last_error · daily_cap · sent_today
```

**4.3 Giao diện trình cắm** — `packages/api/src/channels/<ten>.ts`, mỗi kênh cài đủ 4 hàm:

```ts
type KenhChat = {
  id: MsgChannel;
  kiemChuKy(raw: string, headers: Headers, acc: ChannelAccount): boolean;
  doiTin(payload: unknown): SuKienVao[];            // → { senderId, text, messageId, at, attachments }
  gui(db, acc, { to, text, attachments }): Promise<{ ok: boolean; externalId?: string; error?: string }>;
  khungTraLoi(conv): { trongKhung: boolean; conLai: string | null };  // OA 48h · cá nhân: không giới hạn
};
```

Webhook vào gom về **một đường duy nhất** `POST /api/webhooks/kenh/[slug]` (slug = id kênh): nhận ➜ tra
`channel_accounts` ➜ `kiemChuKy` ➜ `logWebhook(source = slug)` ➜ `doiTin` ➜ `ingestExternal`. Hai dòng
mã cho mỗi kênh mới, không phải một route mới mỗi lần.

**4.4 Bộ định tuyến gửi ra** (`guiTinThongMinh`): chọn kênh **rẻ và hợp lệ trước**

```
OA còn trong 48h        → gửi OA (miễn phí)
khách đã chat Zalo Bot  → gửi Bot (miễn phí)
có nick Zalo cá nhân kết bạn & chưa chạm hạn mức ngày → đẩy lệnh sang ZCRM (POST /messages/send)
còn lại, tin dịch vụ    → ZNS (tính phí)
tin tiếp thị ngoài khung → KHÔNG gửi (consentBlock đã chặn)
```

Vẫn đi qua hàng đợi có `for update skip locked` và `consentBlock()` đã làm ở Đợt 1 — không mở đường
tắt nào vòng qua phần đồng ý nhận tin.

**4.5 Khớp danh tính.** `contact.created` / `message.received` của ZCRM mang `zalo_id` + tên + (đôi khi)
SĐT. Quy tắc khớp: SĐT chuẩn hoá → `parents.phone` / `leads.phone`; nếu không có SĐT thì để hội thoại ở
trạng thái **"chưa gắn lead"** (màn Zalo CRM đã có ô đếm này) cho nhân viên bấm "Tạo lead từ hội thoại"
— vẫn giữ tick xác nhận khách đồng ý, không tự tạo lead từ người lạ.

**4.6 An toàn nick** (áp cho kênh cá nhân): đếm tin/ngày theo từng nick và dừng ở `daily_cap`; giãn cách
ngẫu nhiên 5–15 giây giữa các tin; **chỉ nhắn người đã nhắn trước hoặc đã là bạn**; không quét/kết bạn
hàng loạt từ hệ thống; nhận `zalo.disconnected` thì bắn cảnh báo lên đúng khối cảnh báo của màn Zalo CRM.

## 5. Dữ liệu trong ZCRM nên chảy về đâu trong LMS

| Bên ZCRM | Về LMS | Dùng để làm gì |
|---|---|---|
| `contact.created` (có SĐT) | `leads` (nguồn = `zalo_ca_nhan`, nick nào là người phụ trách) | Phễu tuyển sinh, chấm SLA phản hồi |
| `message.received` / `message.sent` | `conversations` + `messages` | Giám sát hội thoại, đo thời gian trả lời đầu tiên |
| Lịch hẹn (`/appointments`) | Buổi học thử / lịch tư vấn | Đối chiếu "hẹn rồi có đến không" → tỉ lệ chốt |
| Tag & điểm lead | `leads.status` + nhãn nguồn | Báo cáo chuyển đổi theo nick/nhân viên |
| `zalo.disconnected` | Cảnh báo ở màn Zalo CRM | Không để nick chết cả buổi mà không ai biết |

Chiều ngược lại (LMS → ZCRM) chỉ nên có **một lệnh**: gửi tin theo hội thoại. Mọi thứ khác (quét bạn,
đổi nick, bot) để nguyên bên ZCRM — càng ít đường ghi ngược càng ít rủi ro.

## 6. Ba đợt đề xuất

**Đợt A — đọc một chiều (an toàn, nhìn thấy ngay)** — ✅ **XONG 24/09/2026** (mục 1–2; mục 3 để lại Đợt B)
1. ✅ Kênh `zalo_ca_nhan` + bảng `channel_accounts` (khoá/bí mật mã hoá AES-256-GCM nhãn riêng `kenh`,
   trần tin/ngày mặc định 180 — thấp hơn trần 200 của công cụ — trạng thái nick, ngày đếm) + thẻ khai báo
   trong *Tích hợp*: mỗi nick một đường webhook `/api/webhooks/kenh/<slug>` và một bí mật riêng.
2. ✅ Nhận `message.received` / `message.sent` / `contact.created` / `zalo.connected` / `zalo.disconnected`
   → hội thoại, tin hai chiều, đếm tin/ngày, cảnh báo nick im lặng > 30 phút và sắp chạm hạn mức.
   Chữ ký: bí mật thẳng ở `X-Webhook-Secret` **hoặc** HMAC-SHA256 ở `X-Signature` (so sánh thời gian hằng).
   Hàm đọc payload cố ý dễ tính (nhiều tên trường) và nguyên văn luôn nằm ở `webhook_events`
   (nguồn `zalo_ca_nhan`, `external_id` = slug nick) để mở ra đối chiếu khi công cụ đổi tên trường.
   Màn **Zalo CRM** có khối "Zalo cá nhân": nick, tin hôm nay/hạn mức, tín hiệu gần nhất, hội thoại chưa gắn lead.
3. ⏳ Đồng bộ lịch hẹn (`GET /appointments`) → lịch tư vấn/học thử.

   _Kiểm thử đầu-cuối trên máy thật (24/09): bí mật sai → 401 · tin khách → 200 · bắn lại cùng tin →
   ghi `duplicate`, không nhân đôi · tin nhân viên trả lời bên công cụ → ghi chiều `out` · `zalo.disconnected`
   → nick chuyển `offline` + cảnh báo. CSDL sau kiểm thử: webhook 3 processed / 1 duplicate / 1 rejected;
   1 hội thoại, 2 tin (1 vào, 1 ra)._

**Đợt B — trả lời ngay trong hệ thống**
4. `gui()` cho kênh cá nhân (gọi `POST /messages/send` của ZCRM) + hạn mức/giãn cách.
5. Bộ định tuyến gửi ra (OA → Bot → cá nhân → ZNS) dùng chung cho nhắc học phí, nhắc lịch.
6. Chạy lại webhook cho nguồn `zalo_ca_nhan` (gộp với việc Đợt 2 của tài liệu Zalo CRM).

**Đợt C — kênh chính thức tự phục vụ**
7. Zalo Bot: tra cứu lịch học, công nợ, điểm danh cho phụ huynh (`setWebhook` + `sendMessage`).
8. Báo cáo chi phí kênh: tin miễn phí (OA/Bot/cá nhân) so với tin tính phí (ZNS) theo tháng.

## 7. Rủi ro phải nói trước

- **Khoá nick Zalo**: đây là rủi ro vận hành thật, không phải lý thuyết. Hệ thống nên coi kênh cá nhân là
  *có thể mất bất cứ lúc nào*: mọi lead và hội thoại phải đã nằm trong LMS, mất nick chỉ mất kênh chat.
- **Dữ liệu cá nhân (NĐ 13/2023, Luật BVDLCN 2025)**: đổ danh bạ/bạn bè từ nick cá nhân về hệ thống là
  thu thập dữ liệu cá nhân — chỉ đưa về người **đã nhắn tin cho trung tâm**, kèm dấu đồng ý, đúng như
  `consentBlock()` đang làm; không đồng bộ toàn bộ danh bạ.
- **Khoá API/khoá nick nằm trong hệ thống**: mã hoá như token OA (AES-256-GCM, không hiện lại), và
  webhook phải có chữ ký riêng cho từng tài khoản kênh.
- **Phụ thuộc bên thứ ba**: nếu sau này đổi từ ZCRM sang Pancake (có sẵn kết nối cả Zalo cá nhân lẫn OA
  và có API/webhook mở), chỉ phải viết lại **một tệp adapter** — đó là lý do làm tầng trình cắm ngay từ
  đầu thay vì nối thẳng.

## 8. Nguồn

- ZCRM v3.4 (mã nguồn mở, `zca-js`, AGPL-3.0, REST API + webhook, hạn mức ~200 tin/ngày, cảnh báo ToS):
  github.com/nguyenvanlendev/ZaloCRM
- `zca-js` — API Zalo không chính thức, đăng nhập bằng QR, cảnh báo khoá tài khoản, một phiên nghe/nick:
  github.com/RFS-ADRENO/zca-js
- Zalo Bot (tạo bot trong "Zalo Bot Manager", `bot-api.zaloplatforms.com/bot<TOKEN>/sendMessage`,
  `setWebhook`/`getUpdates`, SDK Node/Python/Java): docs.zaloplatforms.com/zalo-bot và /docs/BOT
- Pancake CRM — kết nối cả Zalo cá nhân lẫn Zalo OA, có webhook/API mở: docs.pancake.biz
- Khung 48 giờ, ZNS/ZBS, token OA 25 giờ: xem `docs/ZALO-CRM.md` (khảo sát developers.zalo.me 24/09/2026).
