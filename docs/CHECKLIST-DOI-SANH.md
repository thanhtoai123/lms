# Đối sánh Sata Robo Admin — bản gốc vs bản mới

_Đối chiếu bốn mặt: giao diện & trải nghiệm, nghiệp vụ & backend, bảo mật, triển khai & vận hành._
_Bản gốc = admin.satarobo.vn (khảo sát ở chế độ chỉ đọc, 122 màn hình). Bản mới = repo này._

## Tổng kết

| Chỉ số | Số lượng |
| --- | --- |
| Hạng mục đối chiếu | 49 |
| Ngang bản gốc | 21 |
| Bản mới làm hơn | 24 |
| Còn thiếu | 2 |
| Chờ hợp đồng bên ngoài | 2 |
| Đạt hoặc vượt bản gốc | 92% |

## Giao diện & trải nghiệm

_Người dùng hằng ngày: tư vấn, giáo vụ, kế toán, giáo viên._

| Hạng mục | Bản gốc | Bản mới | Kết luận |
| --- | --- | --- | --- |
| **Menu và đường dẫn** | 122 màn hình, menu theo nhóm nghiệp vụ. | 147 trang quản trị, giữ nguyên đường dẫn cũ nên nhân sự không phải học lại. | Ngang bản gốc |
| **Tìm kiếm** | Ô tìm ở thanh trên, bấm là sang danh sách Lead. | Ctrl + K: gõ không dấu ra trang, tìm học viên, lead, lớp, mã đơn, số điện thoại — chỉ trong phạm vi quyền, số luôn che. | Bản mới làm hơn |
| **Bộ lọc danh sách** | Leads lọc theo sale, nguồn, khoảng ngày; chọn cột hiển thị. | Đủ các bộ lọc đó, thêm phân trang và chọn số dòng; buổi học, lớp, ghi danh cũng lọc được.<br>_Lưu ý: Bản mới chưa có 'chọn cột hiển thị' như bản gốc._ | Ngang bản gốc |
| **Nhập khách hàng nhanh** | Phiếu nhập ở lại trang, có nút lưu và nhập tiếp. | Giống vậy, thêm bảng “đã nhập trong phiên” và cảnh báo trùng số điện thoại ngay khi nhập. | Ngang bản gốc |
| **Nhập danh sách từ Excel** | Đọc trực tiếp file .xlsx, cột cố định, có file mẫu. | Đọc CSV hoặc dán thẳng từ Excel; luồng xem trước, sửa tại chỗ, cột “đè” thì giống.<br>_Lưu ý: Thiếu thư viện đọc .xlsx — cần bổ sung phụ thuộc rồi bật lại._ | Còn thiếu |
| **Xuất dữ liệu** | Xuất lead và hoa hồng từ máy chủ. | Xuất CSV cho lead, nhật ký thao tác, tài khoản phụ huynh — số điện thoại đã che.<br>_Lưu ý: Bản mới xuất trang đang xem, chưa xuất toàn bộ kết quả lọc._ | Ngang bản gốc |
| **Ứng dụng giáo viên** | Trang web thường, cần mạng. | Cài được lên màn hình chính; điểm danh khi mất mạng, tự gửi khi có mạng; quét thẻ QR bằng camera. | Bản mới làm hơn |
| **Cổng phụ huynh** | Nằm ngoài khu quản trị (đường dẫn chuyển sang nơi khác). | Trong cùng hệ thống: lịch học, chuyên cần, bài tập, học bạ, học phí kèm QR, tin nhắn, thông báo đẩy.<br>_Lưu ý: Chưa xem được cổng phụ huynh của bản gốc để so từng màn._ | Bản mới làm hơn |
| **Dùng bằng bàn phím, hỗ trợ tiếp cận** | Không rõ. | Liên kết bỏ qua menu, nhãn cho ô lọc, điều khiển bảng lệnh bằng phím. | Bản mới làm hơn |
| **In ấn** | Phiếu thu, thẻ học viên. | Phiếu thu, thẻ QR theo lớp, bảng công — có kiểu in riêng. | Ngang bản gốc |

## Nghiệp vụ & backend

_Quy tắc chạy phía sau: tiền, lớp, buổi, công._

| Hạng mục | Bản gốc | Bản mới | Kết luận |
| --- | --- | --- | --- |
| **Kiến trúc** | Next.js trên Vercel, logic nằm trong trang và server action. | Next.js 16 + tRPC (518 thủ tục) + Drizzle; toàn bộ quy tắc thuần nằm trong một gói riêng 12.600 dòng có 214 kiểm thử.<br>_Lưu ý: Quy tắc tách khỏi giao diện nên sửa một chỗ áp cho cả web, app giáo viên và cổng phụ huynh._ | Bản mới làm hơn |
| **Chốt lead phải có tiền** | Chặn chốt khi chưa ghi nhận thanh toán. | Chặn tương tự: khối thanh toán trên lead, đơn gắn với lead, học bổng toàn phần phải ghi lý do. | Ngang bản gốc |
| **Trùng số điện thoại** | Gộp theo số đã chuẩn hoá, chỉ điền ô trống, giữ trạng thái phễu. | Giống hệt, thêm đếm “nhập lại N lần” và ghi giá trị khác vào ghi chú kèm ngày. | Ngang bản gốc |
| **Chia lead** | Ba chế độ; chỉ máy chia mới tính lượt; có sổ chia và lịch sử. | Giống; một chỗ duy nhất ghi lượt, có sổ chia lead và lịch sử thay đổi pool. | Ngang bản gốc |
| **Đơn hàng và trả góp** | 1–12 đợt, có cọc, sửa được kế hoạch; nhiều con một đơn; giảm theo dòng; hình thức kèm riêng nhân hệ số. | Đủ các mục đó; kế hoạch lệch tổng hoặc xoá đợt đã thu đều bị chặn. | Ngang bản gốc |
| **Hai bước thu tiền** | Sale ghi nhận, kế toán xác nhận / từ chối / điều chỉnh. | Giống; sửa khoản đang chờ, điều chỉnh khoản đã xác nhận sinh bút toán và ghi nhật ký. | Ngang bản gốc |
| **Đối soát ngân hàng** | Tiền về khớp theo mã đơn; gắn tay; chia cho từng con; tiền thừa xử lý tay. | Giống; thêm gỡ gắn có lý do và danh sách tiền thừa chưa xử lý. | Ngang bản gốc |
| **Hoàn tiền** | Đề xuất = đã thu − số buổi đã học × đơn giá, có duyệt và chi. | Giống; tự sinh đề xuất khi học viên nghỉ hẳn, chuyển lớp khác khoá hoặc huỷ lớp. | Bản mới làm hơn |
| **Buổi học** | Điều chỉnh / huỷ từng buổi có lý do, báo giáo viên và phụ huynh. | Giống; huỷ kiểu “dời” giữ đủ tổng buổi (kiểm chứng 24/24); không sửa được buổi đã qua. | Ngang bản gốc |
| **Hoàn tất buổi** | Checklist 9 bước: điểm danh, nhận xét, ảnh. | Điều kiện hoàn tất tính theo dữ liệu thật, bật / tắt yêu cầu ảnh và nhận xét từng em theo cơ sở. | Ngang bản gốc |
| **Chuyển lớp** | Cùng khoá, không vượt tiến độ, hết chỗ vào danh sách chờ, quản lý duyệt. | Giống; duyệt xong sinh ghi danh mới và mang số buổi còn lại sang. | Ngang bản gốc |
| **Huỷ lớp** | Rút ghi danh, huỷ buổi tương lai, tạo yêu cầu hoàn tiền. | Giống, chạy trong một giao dịch, có bản xem trước ảnh hưởng. | Ngang bản gốc |
| **Chấm công** | Công theo ca đã xếp; quét thẻ chỉ sinh cờ để quản lý rà; khoá kỳ. | Giống (đã viết lại đúng nguyên tắc này); thêm kết luận cho từng cờ và cảnh báo khi khoá kỳ còn cờ chưa rà. | Ngang bản gốc |
| **Đơn từ** | 10 loại, duyệt là áp ngay vào lịch và công. | Đủ 10 loại; áp trong giao dịch con, áp lỗi thì đơn quay lại chờ duyệt kèm lý do. | Ngang bản gốc |
| **Phân quyền theo vị trí** | Vị trí gắn bộ vai trò, có hạn hiệu lực, điều động tác nghiệp. | Giống; hết hạn là mất quyền ở lần truy cập kế tiếp. | Ngang bản gốc |
| **Hoá đơn điện tử** | Đang phát hành với nhà cung cấp thật. | Đủ luồng nháp → phát hành → điều chỉnh / thay thế, đang chạy bộ chuyển thử nghiệm.<br>_Lưu ý: Chờ hợp đồng nhà cung cấp hoá đơn._ | Chờ bên ngoài |
| **Zalo ZNS / SMS** | Đang gửi thật. | Đủ khai báo mẫu, giờ yên lặng, trần tin, thử lại và chuyển kênh — chạy ở chế độ giả lập.<br>_Lưu ý: Chờ hợp đồng ZNS và SMS brandname._ | Chờ bên ngoài |
| **Nhập dữ liệu hệ cũ, chạy song song** | Không có (là hệ đang chạy). | Bộ nhập học viên / ghi danh, đối soát tổng và từng em, sổ chạy song song 5 ngày, danh mục go-live. | Bản mới làm hơn |

## Bảo mật

_Đo bằng chính phản hồi của hai hệ thống và mã nguồn bản mới._

| Hạng mục | Bản gốc | Bản mới | Kết luận |
| --- | --- | --- | --- |
| **Chính sách nội dung trình duyệt (CSP)** | Chỉ ở chế độ báo cáo, cho phép chạy mã nội tuyến và nguồn ngoài. | CSP thật, chặn nguồn ngoài; production không cho eval. | Bản mới làm hơn |
| **Header bảo mật khác** | HSTS, chống dò kiểu tệp, chặn nhúng khung, referrer. | Đủ các mục đó, thêm tách cửa sổ (COOP) và chặn API gọi từ trang khác. | Bản mới làm hơn |
| **Quyền thiết bị** | Camera tắt, định vị bật cho chính trang. | Camera bật cho quét thẻ, định vị bật cho chấm công, còn lại tắt. | Ngang bản gốc |
| **Đăng nhập nhân sự** | Email và mật khẩu. | Thêm xác thực 2 lớp bắt buộc theo vai trò, phiên tự làm mới, mời và đặt lại mật khẩu qua liên kết dùng một lần. | Bản mới làm hơn |
| **Chống dò mật khẩu** | Chưa xác nhận. | Khoá tạm theo tài khoản (5 lần → 15 phút) và theo IP; quản trị mở khoá được; nhật ký đăng nhập giữ 1 năm. | Bản mới làm hơn |
| **Tự đăng xuất khi rời máy** | Chưa xác nhận. | Mặc định 60 phút, cảnh báo trước 2 phút, đồng bộ giữa các tab, máy chủ kiểm tra độc lập. | Bản mới làm hơn |
| **Dữ liệu cá nhân** | Hiển thị đầy đủ số điện thoại trong danh sách. | Che theo vai trò; xem đầy đủ phải ghi lý do và vào nhật ký; CCCD và địa chỉ mã hoá AES-256-GCM. | Bản mới làm hơn |
| **Nhật ký thao tác** | Có trang nhật ký. | Ghi trong cùng giao dịch với nghiệp vụ nên không mất; có nhật ký riêng cho việc xem dữ liệu nhạy cảm. | Bản mới làm hơn |
| **Kiểm soát quyền ở máy chủ** | Có phân quyền theo vai trò và vị trí. | Một bộ luật quyền duy nhất, mọi thủ tục API đều đi qua; phạm vi dữ liệu theo cơ sở; có kiểm thử cho ma trận quyền. | Bản mới làm hơn |
| **Giới hạn tần suất** | Chưa xác nhận. | OTP, quên mật khẩu, xác thực 2 lớp đều có trần theo tài khoản và IP. | Bản mới làm hơn |
| **Trang rà bảo mật** | Không thấy. | Bảo mật hệ thống: khuyến nghị theo mức, tài khoản ngủ trên 90 ngày, IP sai nhiều, chính sách đang áp dụng. | Bản mới làm hơn |
| **Tuân thủ dữ liệu cá nhân** | Có trang tuân thủ. | Sổ yêu cầu chủ thể dữ liệu theo hạn luật định, sổ sự cố 72 giờ, ẩn danh khi xoá mà vẫn giữ chứng từ kế toán.<br>_Lưu ý: Điều khoản đồng ý vẫn nên nhờ luật sư rà trước khi chạy thật._ | Ngang bản gốc |

## Triển khai & vận hành

_Đưa vào chạy và giữ cho chạy._

| Hạng mục | Bản gốc | Bản mới | Kết luận |
| --- | --- | --- | --- |
| **Hạ tầng** | Vercel + Postgres, đã chạy thật nhiều tháng. | Chạy được trên Vercel hoặc tự dựng; kèm Docker compose để chạy tại chỗ; chưa lên môi trường thật.<br>_Lưu ý: Việc còn lại: dựng môi trường chạy thật và tên miền._ | Còn thiếu |
| **Biến môi trường** | Không rõ. | Trang Vận hành liệt kê từng biến, đánh dấu thiếu / yếu / nguy hiểm trước khi bật production. | Bản mới làm hơn |
| **Kiểm thử tự động** | Không rõ. | 214 kiểm thử quy tắc lõi, 5 kiểm thử API, kịch bản khói chạy hơn 100 trang trên máy thật mỗi lần cập nhật. | Bản mới làm hơn |
| **CI** | Không rõ. | GitHub Actions: kiểm tra kiểu, chạy test, dựng lại cơ sở dữ liệu, chạy khói trước khi hợp nhất. | Bản mới làm hơn |
| **Việc chạy nền** | Không rõ. | Worker và cron: hàng đợi thông báo, email, hoá đơn, thông báo đẩy, nhắc bảo lưu, dọn nhật ký. | Bản mới làm hơn |
| **Theo dõi sức khoẻ** | Không rõ. | Nhịp tim worker, hàng đợi, webhook lỗi chạy lại được, sao lưu và thử khôi phục nằm trong danh mục go-live. | Bản mới làm hơn |
| **Dữ liệu mẫu để đánh giá** | Dữ liệu thật. | Bộ dữ liệu giả 301 lead, 125 học viên, 13 lớp, 252 buổi, 121 đơn — chạy lại cho kết quả giống nhau. | Ngang bản gốc |
| **Chuyển đổi và go-live** | Không áp dụng. | Nhập dữ liệu, đối soát, chạy song song 5 ngày khớp, chuyển chính thức, hệ cũ chỉ đọc. | Bản mới làm hơn |
| **Đào tạo nhân sự** | Không thấy trong menu. | Trang hướng dẫn 6 bài theo vai trò có câu hỏi kiểm tra; danh mục go-live tự tick khi nhân sự học xong. | Bản mới làm hơn |

## Việc phải làm trước khi chạy pilot

- [ ] **Dựng dự án Supabase và khai 5 biến đăng nhập** — URL, anon key, service role key, địa chỉ công khai, vai trò bắt buộc 2 lớp
- [ ] **Đặt khoá mã hoá dữ liệu cá nhân** — PII_ENCRYPTION_KEY — đặt một lần, đổi là không đọc được dữ liệu cũ
- [ ] **Đặt các khoá bí mật còn lại** — CRON_SECRET, MEDIA_SIGNING_SECRET, OTP_PEPPER, khoá QR chấm công
- [ ] **Sinh khoá thông báo đẩy (VAPID)** — Chạy một lần, giữ nguyên sau khi phụ huynh đã đăng ký
- [ ] **Tắt đăng nhập bằng tài khoản mẫu** — ALLOW_DEV_ACTOR phải tắt trên môi trường thật
- [ ] **Ký hợp đồng hoá đơn điện tử** — Rồi chuyển từ bộ chuyển thử nghiệm sang nhà cung cấp thật
- [ ] **Đăng ký Zalo OA, mẫu ZNS và SMS brandname** — Khai mẫu trong Cấu hình vận hành → Tin Zalo
- [ ] **Xuất dữ liệu từ hệ cũ** — Học viên, ghi danh, phiếu thu để nhập vào /chuyen-doi
- [ ] **Chọn cơ sở chạy pilot** — Quyết định cơ sở và ngày bắt đầu chạy song song
- [ ] **In và phát thẻ QR cho học viên cơ sở pilot** — In theo lớp từ trang Thẻ học viên
- [ ] **Cho nhân sự học 6 bài hướng dẫn** — Danh mục go-live tự đạt khi mọi tài khoản học xong
- [ ] **Sao lưu và thử khôi phục một lần** — Bắt buộc trong danh mục trước khi chuyển chính thức

---

Bản web tương tác (lọc theo kết luận, tự lưu tiến độ danh mục pilot): xem artifact “Đối sánh Sata Robo Admin”.
