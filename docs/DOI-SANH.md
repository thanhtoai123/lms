# Đối sánh chức năng — Sata Robo Admin mới

Cập nhật: 09/2026. So sánh với (1) hệ thống cũ admin.satarobo.vn (theo menu đã khảo sát trong `ADMIN-SPEC.md`), (2) nhóm phần mềm quản lý trung tâm đào tạo phổ biến ở Việt Nam, (3) yêu cầu pháp lý & nền tảng liên quan.

## 1. Độ phủ so với hệ thống cũ

Toàn bộ mục menu của admin.satarobo.vn đã có trang tương ứng, cùng đường dẫn (xem `apps/web/src/lib/admin-nav.ts`, không còn mục "đang phát triển").

## 2. So với phần mềm quản lý trung tâm phổ biến

Các nhóm tính năng thường được giới thiệu (CloudEMS, Getfly Education, MISA EMIS, Easy Edu, Edusoft, EduCRM, Mona eLMS, Halozend…):

| Nhóm tính năng | Thị trường | Sata Robo mới | Ghi chú |
|---|---|---|---|
| Hồ sơ học viên, nhập Excel | Có | Có | Nhập khách hàng / giao dịch cũ có xem trước |
| Lịch lớp, chống trùng phòng / GV | Có | Có | Kèm ngày nghỉ, tự dời buổi |
| Điểm danh, học bù | Có | Có | Sửa hồi tố có nhật ký; học bù theo yêu cầu |
| Điểm danh QR | Easy Edu | Có | Thẻ QR ký HMAC, cấp lại thẻ, GV quét bằng camera, có mặt / đi muộn tự động |
| Thu học phí, công nợ, trả góp | Có | Có | Phiếu thu liên tục, SePay tự khớp, hoàn tiền theo buổi |
| Hoá đơn điện tử | MISA, Halozend | Có (chờ ký nhà cung cấp) | Lập nháp từ phiếu thu, phát hành qua bộ chuyển HTTP, khoá sau phát hành, điều chỉnh / thay thế, tra cứu công khai, đối soát. Đang chạy nhà cung cấp thử nghiệm — cần hợp đồng với nhà cung cấp HĐĐT thật |
| CRM tuyển sinh, phễu, chia lead | Getfly, EduCRM | Có | Kanban, SLA, chia vòng tròn, bàn giao |
| Email / SMS / Zalo tự động | Có | Một phần | Email + mẫu theo sự kiện; Zalo OA tin tư vấn; ZNS mới ở mức cấu hình; chưa có SMS brandname |
| Landing page, UTM, đo chiến dịch | Getfly | Có | Tracking first-party, CPL/CPA/ROAS, phễu 10 bước |
| App phụ huynh / GV | Easy Edu | Có | GV: PWA; PH: cổng /ph đăng nhập OTP (lịch, chuyên cần, bài tập, học bạ, học phí + hoá đơn, tin nhắn, đồng ý). Chưa có push |
| E-learning, bài tập, SCORM | Mona eLMS | Có | SCORM 1.2/2004, bài tập nộp qua link |
| Nhân sự, chấm công, tuyển dụng | 1Office, VnResource | Có | GPS chấm công, bảng công, đơn từ, tuyển dụng |
| Kho học cụ, cho thuê | Ít có | Có | Đặc thù trung tâm robotics |
| Điểm thưởng / đổi quà | Ít có | Có | SataCoin có hạn mức theo vai trò |
| Báo cáo đa cơ sở | Có | Có | Cohort, churn, doanh thu vs mục tiêu, hiệu suất GV |
| Phân quyền theo cơ sở | Có | Có | Policy engine thống nhất, nhật ký bất biến |

## 3. Pháp lý & nền tảng

| Chủ đề | Quy định / chính sách | Cách hệ thống đáp ứng |
|---|---|---|
| Bảo vệ dữ liệu cá nhân | Luật BVDLCN 2025 + NĐ 356/2025 (thay NĐ 13/2023 từ 01/01/2026): phản hồi tiếp nhận 2 ngày làm việc; xem / sửa 10 ngày; rút đồng ý / hạn chế / phản đối 15 ngày; xoá 20 ngày; gia hạn 1 lần | Sổ yêu cầu với hạn theo loại, gia hạn có lý do, xuất bản sao JSON, ẩn danh có mã xác nhận |
| Vi phạm dữ liệu | Thông báo trong 72 giờ | Sổ sự cố, hạn thông báo, không đóng khi chưa báo (mức trung bình / nghiêm trọng) |
| Lưu chứng từ kế toán | Luật Kế toán — 10 năm | Xoá dữ liệu phụ huynh có đơn chỉ ẩn danh thông tin liên hệ |
| Facebook Messenger | Trả lời trong 24 giờ; thẻ HUMAN_AGENT tới 7 ngày cho người thật trả lời | Chặn gửi ngoài cửa sổ, tự gắn thẻ, kiểm tra chữ ký webhook |
| Zalo OA | Tin tư vấn trong 7 ngày kể từ tương tác cuối; ngoài ra dùng ZNS theo mẫu | Chặn gửi quá 7 ngày, hướng dẫn dùng ZNS |
| Hoá đơn điện tử | NĐ 123/2020, NĐ 70/2025: lập khi thu tiền; đã phát hành sai → điều chỉnh / thay thế kèm văn bản thoả thuận | Khoá hoá đơn đã phát hành ở CSDL, điều chỉnh / thay thế có lý do + thoả thuận, cảnh báo quá hạn lập. Cần nhà cung cấp thật |

## 4. Việc còn lại (đề xuất thứ tự)

1. Nhập dữ liệu thật + đối soát với hệ thống cũ; chạy song song 1–2 tuần ở cơ sở pilot.
2. Ký hợp đồng nhà cung cấp HĐĐT, chuyển từ sandbox sang bộ chuyển HTTP (đã xong phần hệ thống).
3. Đăng ký mẫu ZNS (OTP đăng nhập PH, nhắc học phí, lịch học), SMS brandname dự phòng; push cho cổng PH.
4. In và phát thẻ QR cho học viên cơ sở pilot.
5. Rà soát pháp lý điều khoản đồng ý và quy trình bởi luật sư.

## Nguồn

- [Nghị định 356/2025/NĐ-CP — LuatVietnam](https://luatvietnam.vn/thong-tin/nghi-dinh-356-2025-nd-cp-quy-dinh-chi-tiet-luat-bao-ve-du-lieu-ca-nhan-422896-d1.html)
- [NĐ 13/2023 hết hiệu lực từ 01/01/2026 — Thư viện Pháp luật](https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/chinh-sach-moi/102230/nghi-dinh-13-2023-nd-cp-ve-bao-ve-du-lieu-ca-nhan-het-hieu-luc-tu-01-01-2026)
- [Messenger Platform policy — Meta](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy)
- [Chính sách gửi tin Zalo OA](https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099)
- [Top 10 phần mềm quản lý đào tạo — CloudGO](https://cloudgo.vn/phan-mem-quan-ly-dao-tao)
- [Tính năng phần mềm quản lý trung tâm — Halozend](https://thuhocphi.com/phan-mem-quan-ly-trung-tam-dao-tao/)
- [Hoá đơn học phí điện tử — MISA meInvoice](https://www.meinvoice.vn/tin-tuc/4543/hoa-don-hoc-phi-nganh-giao-duc/)
