# Chống chụp / quay màn hình học liệu — làm được tới đâu

Tài liệu này trả lời đúng một câu hỏi: **muốn học liệu không bị chụp, bị quay, bị mang ra ngoài thì
làm được tới đâu, và giá của từng mức là gì.** Viết ra để không ai kỳ vọng nhầm và không ai mua nhầm.

## 1. Sự thật gốc: nội dung đã hiện lên màn hình là đã ra khỏi tầm kiểm soát

Máy tính phải vẽ bài giảng ra màn hình thì người học mới xem được. Ở khoảnh khắc đó, hình đã nằm trong
bộ đệm màn hình của hệ điều hành và nằm trên tấm kính trước mặt người xem. Từ đây có bốn đường sao chép,
và chúng **khác hẳn nhau về mức chặn được**:

| Đường sao chép | Ai làm được | Chặn được không |
|---|---|---|
| Tải thẳng tệp gốc (link PDF, gói SCORM) | Ai có link | **Chặn được hoàn toàn** |
| Chụp/quay bằng phần mềm trên chính máy đó | Người ngồi trước máy | **Chặn được** — nếu chạy bằng ứng dụng máy tính, không phải web |
| Quay bằng thiết bị bắt tín hiệu HDMI | Người có bộ capture rời | Không |
| Chụp bằng điện thoại / máy ảnh | Bất kỳ ai nhìn thấy màn hình | Không — **không hệ thống nào trên đời chặn được** |

Netflix, Coursera, Udemy, các nền tảng DRM đắt tiền cũng chỉ chặn được hai dòng đầu. Khác biệt duy nhất
giữa "hệ thống bảo vệ tốt" và "hệ thống bảo vệ kém" nằm ở chỗ: **chặn sạch hai dòng đầu, và làm cho hai
dòng sau để lại dấu vết truy được người.**

## 2. Năm lớp đang có trong hệ thống

| Lớp | Chặn gì | Mức |
|---|---|---|
| **1. Không giao tệp gốc** | Slide phát qua đường dẫn gắn phiên đăng nhập, `no-store`, không link tải; gói SCORM chỉ phát từng tệp con | Chặn tuyệt đối đường "gửi link cho người ngoài" |
| **2. Vẽ slide ra `<canvas>`** | Không còn trình xem PDF của trình duyệt ⇒ không có nút tải/in/mở tab mới, **không có lớp text để bôi–chép**, và chữ mờ **vẽ thẳng vào ảnh trang** nên xoá phần tử cũng không bóc ra được | Chặn mọi cách sao chép "một cú nhấp" |
| **3. Rào thao tác** | Chuột phải, kéo–thả, `Ctrl+P` / `Ctrl+S` / `Ctrl+U`, in giấy, PrintScreen (che màn ~1,5 s) | Rào người dùng phổ thông; **không** chặn được phần mềm quay |
| **4. Ứng dụng trình chiếu (Electron)** | `setContentProtection` ⇒ Windows loại cửa sổ khỏi **mọi** lệnh chụp/quay: OBS, Bandicam, Snipping Tool, chia sẻ màn hình Teams/Zoom đều chỉ thu được **màn đen**. Thêm canh gác: thấy phần mềm quay đang chạy hoặc máy đang bị điều khiển từ xa thì **ẩn bài** và ghi nhật ký | **Đây là lớp chặn thật** |
| **5. Truy nguồn** | Chữ mờ mang tên + liên hệ đã che + giờ của chính người đang xem, vẽ vào ảnh trang; mọi lượt mở và mọi thao tác nghi vấn vào `document_access_logs`; trang `/scorm` có bảng "nghi vấn sao chép 30 ngày" kèm mức cảnh báo | Biến "ảnh lọt ra ngoài" thành "biết của ai, lúc nào" |

Đo thực tế trên máy dạy (Windows, `Graphics.CopyFromScreen` — đúng API phần mềm chụp dùng):
cửa sổ ứng dụng có cờ `0x11` = `WDA_EXCLUDEFROMCAPTURE` và **biến mất khỏi ảnh chụp**, trong khi màn
hình thật và máy chiếu HDMI vẫn hiện bài bình thường.

## 3. Vì sao trình duyệt không thể làm lớp 4

Ba lý do kỹ thuật, không phải do chưa làm tới:

1. Phần mềm quay đọc **bộ đệm màn hình của hệ điều hành**, không đi qua trang web. Trang không có bất kỳ
   API nào để biết mình đang bị quay — kể cả `visibilitychange`, `getDisplayMedia` cũng chỉ biết khi
   *chính trang đó* xin chia sẻ màn hình.
2. `PrintScreen` và `Win+Shift+S` bị **Windows nuốt trước**; trình duyệt thường không nhận được phím,
   nên mọi đoạn mã "chặn PrintScreen" có khi không chạy lần nào.
3. Người dùng có thể mở Công cụ nhà phát triển và xoá bất kỳ lớp phủ nào — đó là lý do chữ mờ phải
   được **vẽ vào ảnh trang**, không phải đắp bằng thẻ HTML.

Kết luận thẳng: **muốn chặn thật thì phải chiếu bằng ứng dụng máy tính.** Web dùng cho mọi việc còn lại.

## 4. Nếu cần siết thêm nữa — bốn hướng, kèm giá

| Hướng | Được gì | Giá phải trả |
|---|---|---|
| **Bắt buộc chiếu bằng ứng dụng** (chặn `/scorm/buoi/...` khi User-Agent không phải ứng dụng) | Không ai còn chiếu bài bằng trình duyệt trần | Mỗi máy dạy phải cài ứng dụng; giáo viên xem trước ở nhà cũng phải cài |
| **Chữ mờ pháp y theo từng người** (chèn mã rất mờ / lệch pixel theo `userId` vào ảnh trang) | Ảnh bị cắt hết chữ mờ vẫn truy ra người làm rò | Phải rasterise slide ở máy chủ, tốn CPU; cần công cụ giải mã khi cần đối chứng |
| **Phát từng trang ảnh, hết hạn theo phút** (không bao giờ gửi cả tệp PDF xuống máy) | Kể cả lấy được bộ nhớ đệm cũng chỉ có vài trang rời | Chiếu chậm hơn, tốn băng thông; offline không xem được |
| **DRM thương mại (Widevine/PlayReady)** | Bảo vệ ở mức phần cứng cho **video** | Rất đắt, chỉ dùng được cho video, không dùng được cho PDF/SCORM; vẫn không chặn được điện thoại chụp |

Khuyến nghị theo thứ tự: **(1) bắt buộc dùng ứng dụng** cho lớp học tại trung tâm → **(2) chữ mờ pháp y**
nếu đã từng có vụ rò thật → (3) phát từng trang chỉ khi bán khoá học online cho người ngoài.

## 5. Điều hệ thống không hứa

- Không chặn được điện thoại chụp màn chiếu, máy quay ngoài, thiết bị bắt HDMI.
- Không biết được máy đang bị quay bằng phần mềm lạ đã đổi tên tiến trình (canh gác chỉ đọc tên).
- Trên Windows cũ hơn bản 10 phiên bản 2004 thì `setContentProtection` không có tác dụng — máy đó chỉ
  còn chữ mờ và nhật ký.

Vì vậy lớp cuối cùng luôn là **quy định nội bộ + bằng chứng**: người dùng biết mình để lại dấu vết, và
quản trị có nhật ký đủ để xử lý. Đó là phần bảo vệ bền nhất, không phụ thuộc vào công nghệ nào.
