# Phiếu đánh giá buổi học thử

Sau buổi học thử, giáo viên hoặc tư vấn điền nhanh một phiếu nhận xét học sinh. Hệ thống phát hành phiếu thành **một đường link riêng gửi phụ huynh** (mở trên điện thoại qua Zalo, không cần đăng nhập) và **in / lưu PDF khổ A4**.

Mục đích:

- Phụ huynh nhận được kết quả buổi thử **cụ thể, dễ đọc, mang nhận diện Sata Robo** ngay trong ngày — thay cho lời kể qua điện thoại.
- Tư vấn có "cái cớ" chính đáng để gọi chốt, và biết phụ huynh **đã mở phiếu chưa, mở mấy lần, có bấm đăng ký tư vấn không**.
- Nhận xét của giáo viên được lưu lại trên lead, dùng tiếp khi xếp lớp chính thức.

---

## 1. Luồng nghiệp vụ

```
GV / tư vấn điền phiếu ──► Tư vấn phát hành ──► Gửi link qua Zalo / email ──► Phụ huynh xem trên điện thoại
      (drawer một chạm)        (sinh token)        (tin nhắn soạn sẵn)              │
                                                                                   ▼
                     Tư vấn nhận việc ◄── Thông báo + việc "Gọi tư vấn lộ trình" ◄── PH bấm "Đăng ký tư vấn lộ trình"
```

1. **Mở phiếu (một chạm).** Ở **Lớp Trial → Học thử buổi lẻ** (lượt đã ghi "Bé đã đến học") và ở **chi tiết lớp trải nghiệm** (từng học viên), bấm **"Phiếu đánh giá"**. Drawer mở ra: nếu buổi đó đã có phiếu thì mở phiếu đó, chưa có thì tạo bản nháp **điền sẵn** tên bé, khoá trải nghiệm, ngày giờ buổi, giáo viên, cơ sở. Trang chi tiết lead có khối **"Phiếu đánh giá học thử"** liệt kê phiếu của lead và nút **"Lập phiếu"** cho buổi thử diễn ra ngoài hệ thống.
2. **Điền.** Mỗi tiêu chí là một hàng **3 nút lớn** (chạm một lần là chọn, chạm lại để bỏ). Ba ô nhận xét, chọn khoá học đề xuất + cấp độ + lý do, kết quả 3 mức, hai công tắc phụ. Nút **"Lưu nháp"**, **"Xem trước"** (xem đúng giao diện phụ huynh sẽ thấy), **"Phát hành & sao chép link"**, **"In / Lưu PDF"**.
3. **Phát hành.** Hệ thống kiểm đủ nội dung, sinh token, ghi mốc phát hành, **sao chép link** vào bộ nhớ tạm, ghi hoạt động "Đã gửi phiếu đánh giá học thử" trên lead; lead có email thì xếp thư mẫu `TRIAL_REPORT_PUBLISHED`.
4. **Gửi.** Drawer hiện ô link, nút **"Chia sẻ"** (Web Share API trên điện thoại — mở thẳng Zalo; máy tính thì sao chép), **tin nhắn soạn sẵn**: *"Sata Robo gửi anh/chị kết quả buổi học thử của bé {tên}: {link}"*.
5. **Phụ huynh xem** `/pdg/<token>` — mỗi lần mở tăng lượt xem và ghi mốc xem gần nhất.
6. **Phụ huynh bấm "Đăng ký tư vấn lộ trình"** → ghi `parent_response = consult_requested` (**mỗi link chỉ ghi nhận một lần**, bấm lại thì báo "Trung tâm đã nhận yêu cầu"), tạo hoạt động trên lead, tạo việc **"Gọi tư vấn lộ trình"** hạn 2 giờ cho tư vấn phụ trách, gửi thông báo loại `trial.consult_requested` (ưu tiên cao, có đẩy). Lead chưa có người phụ trách thì báo quản lý + tư vấn của cơ sở. Nút **"Gọi cho cơ sở"** là `tel:` số điện thoại của cơ sở.
7. **Việc hôm nay** có nhóm **"Phiếu đánh giá học thử chưa gửi"**: buổi thử đã diễn ra quá 24 giờ (lượt thử lẻ đã ghi "đến học" / học viên lớp trải nghiệm đã có mặt) mà chưa có phiếu phát hành, trong 30 ngày gần nhất. Bấm "Điền phiếu" mở thẳng drawer của đúng buổi đó.

---

## 2. Cải tiến so với mẫu tham khảo

Chủ dự án đưa một mẫu phiếu của đơn vị khác làm tham khảo **cấu trúc**. Phiếu của Sata Robo giữ ý tưởng (thông tin tổng quan → đánh giá công nghệ → kỹ năng mềm → mức độ yêu thích → kết quả → lộ trình → đề xuất thêm), **không** dùng tên, logo, linh vật, huy hiệu, hotline, website, khẩu hiệu hay hoạ tiết của đơn vị đó.

| # | Mẫu tham khảo | Phiếu Sata Robo |
|---|---|---|
| 1 | Thang "Tốt / Chưa tốt / Trung bình" — sai thứ tự, "Chưa tốt" nặng nề | 3 mức **tăng dần, ngôn từ tích cực**: "Cần hỗ trợ thêm / Khá / Tốt"; tốc độ "Cần thêm thời gian / Vừa / Nhanh"; yêu thích "Đang làm quen / Thích / Rất thích". Trên phiếu là **thanh 3 nấc tô màu**, mức đã chọn in đậm |
| 2 | Chỉ có ô chọn, không có lời nhận xét | **Nhận xét của giáo viên** bằng lời (bắt buộc ít nhất một ô ≥ 20 ký tự): "Điểm nổi bật của bé", "Bé có thể phát triển thêm", "Sản phẩm bé làm được trong buổi" — đặt **ngay sau phần thông tin** |
| 3 | "Pathway có / không" | **Khoá học đề xuất cụ thể** chọn từ danh mục khoá học, kèm cấp độ bắt đầu và lý do ngắn; giữ 2 cờ phụ "Định hướng Pathway chứng chỉ quốc tế" và "Tiềm năng đội tuyển thi đấu" |
| 4 | Kết quả "Đáp ứng / Chưa đáp ứng" | **3 mức hành động được**: "Sẵn sàng vào học chính thức" / "Nên học thêm một buổi trải nghiệm" / "Chưa phù hợp ở thời điểm này" |
| 5 | Để trống "Ngày sinh", lọt chữ giữ chỗ kiểu "VD: #…" | **Ẩn trường không có dữ liệu**; mã học sinh chỉ hiện khi bé đã là học viên thật, chưa có thì hiện mã phiếu |
| 6 | Phiếu tĩnh, phụ huynh đọc xong không làm gì tiếp | **Kêu gọi hành động** ngay trên link: "Đăng ký tư vấn lộ trình" (ghi vào lead, báo tư vấn) và "Gọi cho cơ sở" |
| 7 | Lỗi chính tả (vd "địnnh hướng") | Mọi nhãn tiếng Việt chuẩn, tập trung ở một chỗ trong `packages/core` |
| 8 | Mẫu cố định | **Mẫu tiêu chí cấu hình ở một chỗ** (`TRIAL_REPORT_TEMPLATE`); khi lưu phiếu **chụp lại cả mẫu lẫn giá trị** vào JSONB — đổi mẫu sau này không làm đổi phiếu đã gửi |
| — | Không có tóm tắt | Dòng tóm tắt nhanh, ví dụ **"5/6 tiêu chí đạt mức Tốt"** |

Thứ tự trên phiếu (mobile-first): đầu phiếu (logo + "Phiếu đánh giá buổi học thử" + mã phiếu + ngày) → thẻ thông tin bé → **nhận xét của giáo viên** → tóm tắt nhanh → hai nhóm tiêu chí (thanh 3 nấc) → mức độ yêu thích → kết quả + khoá đề xuất (thẻ nổi bật) → hai đề xuất phụ → khối hành động → chân phiếu (tên, địa chỉ, SĐT cơ sở lấy từ bảng `centers`).

---

## 3. Dữ liệu

Bảng `trial_reports` (schema `packages/db/src/schema/admissions.ts`, ràng buộc ở `packages/db/sql/0010_phieu_danh_gia_hoc_thu.sql`):

| Nhóm | Cột |
|---|---|
| Khoá | `id`, `tenant_id` (trigger `fill_tenant_id` tự điền theo cơ sở), `center_id`, `lead_id`, `child_id` → `lead_children`, `trial_booking_id` (buổi thử lẻ), `trial_class_enrollment_id` (lớp trải nghiệm), `course_id` (khoá trải nghiệm), `teacher_id` |
| Mã, trạng thái | `code` duy nhất `PDG-<mã cơ sở>-<yy>-<6 số>`, `status` `draft` / `published` / `revoked`, `child_name` (chụp lúc tạo), `session_at` |
| Nội dung | `answers` JSONB (bản chụp mẫu + giá trị), `strengths`, `growth`, `product_note`, `readiness` (`ready` / `one_more_trial` / `not_yet`), `recommended_course_id`, `recommended_level`, `recommendation_note`, `pathway`, `competition_potential` |
| Chia sẻ | `share_token` (unique), `share_expires_at`, `published_at/by`, `revoked_at/by`, `revoke_reason` |
| Theo dõi | `view_count`, `first_viewed_at`, `last_viewed_at`, `parent_response` (`consult_requested`), `parent_responded_at` |
| Nhật ký | `created_by`, `updated_by`, `created_at`, `updated_at` |

Chỉ mục: `(lead_id)`, `(center_id, status, created_at)`, unique `(share_token)`, `(trial_booking_id)`, `(trial_class_enrollment_id)`, `(tenant_id)`. Ràng buộc CHECK: trạng thái, kết quả, định dạng mã, định dạng token, phát hành phải có token + hạn + mốc, thu hồi phải có mốc + lý do, độ dài ô chữ, `view_count ≥ 0`.

Mẫu tiêu chí: `packages/core/src/admissions/trialReport.ts` — `TRIAL_REPORT_TEMPLATE` (nhóm → tiêu chí → mức có thứ tự). Đổi mẫu = sửa hằng số đó và tăng `version`. Hàm thuần có kiểm thử: `validateTrialReport`, `snapshotAnswers`, `applyValues`, `trialReportCode`, `isShareLinkUsable`, `summarizeLevels`.

---

## 4. Quyền

| Việc | Quyền (tại cơ sở của phiếu) |
|---|---|
| Xem phiếu, xem danh sách | `trials:view` (GV: buổi mình dạy) hoặc `lead:read` (tư vấn: lead của mình) hoặc một trong các quyền bên dưới |
| Mở / điền / sửa | `trials:attendance` (GV đứng buổi) **hoặc** `trials:manage` **hoặc** `lead:update` |
| Phát hành, thu hồi, gia hạn link | `trials:manage` **hoặc** `lead:update` |

- Mọi truy vấn danh sách có `tenantCond`; nạp theo id có `assertTenant`; mọi thao tác ghi có `writeAudit` **trong transaction**.
- Sửa phiếu **đã phát hành** được phép (sửa lỗi chính tả, bổ sung nhận xét) nhưng phải còn đủ điều kiện phát hành, được ghi nhật ký với lý do "Sửa phiếu đã phát hành cho phụ huynh" và ghi hoạt động trên lead. Phiếu **đã thu hồi** không sửa được — bấm "Lập phiếu mới" (bản nháp mới chép lại nội dung cũ).
- API: `admissions.trialReports.{list, get, open, update, publish, revoke, extend}`.

---

## 5. Bảo mật link

- **Token**: 32 byte ngẫu nhiên (`crypto.randomBytes`), mã hoá base64url (43 ký tự) — không đoán được, không suy ra từ mã phiếu hay id.
- **Kiểm định dạng trước khi truy vấn**: trang `/pdg/[token]` và API `/api/public/pdg/[token]` từ chối ngay token sai định dạng.
- **Hạn**: mặc định 90 ngày (biến môi trường `TRIAL_REPORT_SHARE_DAYS`), gia hạn từng 30 ngày, tối đa 365 ngày tính từ hôm nay.
- **Thu hồi** bắt buộc lý do; link ngừng hiệu lực ngay, phụ huynh mở thấy câu lịch sự kèm số điện thoại cơ sở.
- **Không lập chỉ mục**: `robots: noindex, nofollow`, `referrer: no-referrer` (link không lọt sang trang khác qua Referer).
- **Trần tần suất theo IP** (dùng chung giữa các bản sao, bảng `rate_limits`): xem phiếu `trialReportViewIp` 300 lượt / 15 phút; nút đăng ký `trialReportRespondIp` 30 lượt / 15 phút. Nới bằng `RATE_LIMIT_TRIAL_REPORT_VIEW_IP_MAX` / `RATE_LIMIT_TRIAL_REPORT_RESPOND_IP_MAX`. API POST còn chặn gọi từ trang khác (CSRF).
- **Trường không bao giờ lộ ra trang công khai**: số điện thoại, email, tên phụ huynh; id lead / bé / buổi / giáo viên; người phụ trách; token trong nhật ký. Trang chỉ nhận `TrialReportView` — đúng những gì in trên phiếu. Lead đã ẩn danh (NĐ13) hoặc đã xoá → link trả "không tìm thấy".
- Mở link **không** làm đổi `updated_at` của phiếu (đếm lượt xem bằng SQL riêng).

---

## 6. In / lưu PDF

- Trang phụ huynh có nút **"Lưu PDF / In phiếu"**; drawer có **"In / Lưu PDF"** mở trang in nội bộ `/phieu-danh-gia/<id>` (in được cả bản nháp, có dấu "Bản nháp").
- Cả ba nơi (trang phụ huynh, xem trước, trang in) dùng **chung** component `TrialReportSheet` (`apps/web/src/components/trial-report/sheet.tsx`).
- CSS in: `@page { size: A4; margin: 12mm }`, cỡ chữ gốc thu còn 11,5px, hai nhóm tiêu chí xếp 2 cột, giữ màu nền (`print-color-adjust: exact`), không cắt khối ngang trang (`break-inside: avoid`), ẩn nút bấm. Lượng nội dung thông thường vừa **một trang A4**.
- Cách lưu PDF: bấm nút → hộp thoại in của trình duyệt → chọn máy in **"Lưu dưới dạng PDF"** (Chrome/Edge) hoặc **"Lưu thành PDF"** (Safari). Nên bật "Đồ hoạ nền" nếu trình duyệt hỏi.

---

## 7. Xem thử với dữ liệu mẫu

`pnpm db:seed` tạo hai phiếu cho lead giả:

- **Đã phát hành** — Bé Giang (PH Mẫu 06): `http://localhost:3000/pdg/xem-thu-phieu-danh-gia-sata-robo-mau` (lệnh seed in đường link này ở cuối).
- **Bản nháp** — Bé Hà (PH Mẫu 07): mở ở trang chi tiết lead → khối "Phiếu đánh giá học thử".

---

## 8. Hướng mở rộng

- **Đính kèm ảnh sản phẩm của bé** — chỉ khi có đồng ý hình ảnh của phụ huynh (dùng cơ chế đồng ý sẵn có ở `media/consent`), ảnh ký URL có hạn như ảnh lớp.
- **PDF phía máy chủ** (dựng sẵn file PDF để đính kèm email / gửi Zalo OA) — cần thêm thư viện kết xuất, nên làm khi có nhu cầu gửi file thay vì link.
- Gửi thẳng qua Zalo OA / ZNS khi có mẫu tin được duyệt.
- Báo cáo tỉ lệ: phiếu đã gửi / đã xem / đã đăng ký tư vấn / đã chốt — theo cơ sở, theo giáo viên.
- Cho phép cấu hình mẫu tiêu chí theo từng tenant (bảng cấu hình + bản chụp như hiện nay).
