# Trình chiếu an toàn (ứng dụng máy tính)

Chiếu giáo án bằng một cửa sổ **hệ điều hành loại khỏi mọi lệnh chụp/quay màn hình**.

## Vì sao cần

Trang web không chặn được chụp/quay màn hình, và đây không phải lỗi của hệ thống:

- Phần mềm quay (OBS, Bandicam, Teams, Zoom, Meet) lấy hình từ **bộ đệm màn hình của Windows**, không hề chạm vào trang web — trang không có cách nào biết mình đang bị quay.
- `PrintScreen` và `Win+Shift+S` bị **Windows nuốt trước**, trình duyệt thường không nhận được phím nên mọi đoạn JavaScript "chặn PrintScreen" đều không chạy.
- Điện thoại chụp màn chiếu thì không phần mềm nào chặn được.

Chặn thật chỉ có ở mức hệ điều hành: `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` trên Windows 10 2004+ và `NSWindow.sharingType = none` trên macOS. Ứng dụng này bật đúng cờ đó (`win.setContentProtection(true)`).

**Kết quả:** phần mềm quay/chụp và chia sẻ màn hình Teams/Zoom chỉ thu được **màn đen**; máy chiếu nối dây HDMI vẫn hiện bài bình thường.
**Vẫn không chặn được:** điện thoại/máy ảnh chụp màn chiếu, thiết bị bắt tín hiệu HDMI. Vì vậy chữ mờ tên người xem và nhật ký truy cập vẫn giữ nguyên.

## Cài và chạy (máy dạy)

```powershell
cd tools\trinh-chieu
npm install        # tải Electron, chỉ làm một lần, ~100MB
npm start
```

Ứng dụng nằm **ngoài** workspace pnpm, nên `pnpm install` của dự án chính không tải Electron.

## Cấu hình

`cau-hinh.json` cạnh `main.cjs`:

| Khoá | Nghĩa |
|---|---|
| `baseUrl` | Địa chỉ hệ thống, ví dụ `https://lms.trungtam.vn` (mặc định `http://localhost:3000`) |
| `kiosk` | `true` = khoá cứng toàn màn hình, không có thanh tiêu đề |
| `lessonId` | Mở thẳng một buổi; để trống thì vào trang `/scorm` chọn buổi |
| `chuKyQuet` | Số giây giữa hai lần quét phần mềm quay màn hình (0 = tắt quét) |
| `chanTuXa` | `true` = không chiếu khi máy đang bị điều khiển từ xa (Remote Desktop) |
| `chanPhanMem` | Danh sách tên tiến trình bị chặn. Để `[]` dùng danh sách mặc định (OBS, Bandicam, Camtasia, ShareX, Snagit, XSplit, ActivePresenter…). Thêm `"zoom.exe"`, `"ms-teams.exe"` nếu trung tâm không dạy online bằng hai phần mềm đó |

Ghi đè nhanh bằng biến môi trường `SATA_URL`, `SATA_KIOSK=1`, hoặc tham số dòng lệnh `--buoi=<lessonId>`.

## Canh gác phần mềm quay màn hình

Cứ vài giây ứng dụng đọc danh sách tiến trình đang chạy. Thấy một phần mềm quay/chụp trong danh sách
chặn (hoặc máy đang ở phiên Remote Desktop) thì **ẩn hẳn cửa sổ bài giảng** và hiện lời nhắc; tắt phần
mềm đó thì bài tự hiện lại sau vài giây. Mỗi lần chặn được ghi vào nhật ký truy cập học liệu của hệ thống.

Đây là lớp *ngăn chặn*, không phải lớp *không thể vượt*: ai đó đổi tên `obs64.exe` thành `abc.exe` là
qua được. Lớp chặn thật vẫn là content protection của Windows ở trên (cửa sổ ra màn đen trong mọi phần
mềm quay, kể cả phần mềm đổi tên).

## Ứng dụng làm gì ngoài content protection

- Phiên đăng nhập **lưu lại** (`persist:sata-trinh-chieu`) — giáo viên đăng nhập một lần. Ứng dụng không bao giờ tự điền mật khẩu.
- Huỷ mọi lượt **tải tệp**.
- Từ chối mọi **quyền** (camera, mic, ghi màn hình, thông báo) và chặn cả API chia sẻ màn hình của trang.
- Không **DevTools**, chặn `Ctrl+P` / `Ctrl+S` / `Ctrl+U` / `F12`.
- Chỉ đi lại trong đúng `baseUrl`; link ra ngoài mở bằng trình duyệt hệ thống (ngoài vùng bảo vệ).
- `F11` bật/tắt toàn màn hình, `Ctrl+Shift+Q` thoát ứng dụng.

## Đóng gói cho nhiều máy

```powershell
npm install --save-dev electron-builder
npm run dong-goi      # ra dist\SataRobo-TrinhChieu <phiên bản>.exe (portable)
```

Chép tệp `.exe` kèm `cau-hinh.json` đã sửa `baseUrl` sang các máy dạy.

## Đã kiểm chứng trên máy thật

Đo trên máy dạy (Windows, màn 1536×960) bằng chính API mà phần mềm chụp dùng
(`Graphics.CopyFromScreen`) và đọc cờ cửa sổ bằng `GetWindowDisplayAffinity`:

| Lần đo | Cờ cửa sổ | Ảnh chụp thu được |
|---|---|---|
| Bật content protection **một lần** lúc tạo cửa sổ | `0x0` — **không được bảo vệ** | chụp ra nội dung bình thường |
| Bật lại ở mọi mốc (`show`, `focus`, `restore`, đổi fullscreen, `move`, `resize`) + soát lại mỗi 3 giây | `0x11` = `WDA_EXCLUDEFROMCAPTURE` | **cửa sổ biến mất khỏi ảnh chụp** |

Đây là lý do `main.cjs` gọi `setContentProtection(true)` nhiều lần chứ không gọi một lần: cờ này
gắn vào HWND, mà Electron dựng lại HWND khi đổi trạng thái cửa sổ.

## Kiểm chứng đã bật đúng

Mở ứng dụng, chiếu một giáo án, rồi bấm `Win+Shift+S` hoặc bật OBS/Teams chia sẻ màn hình: vùng cửa sổ ứng dụng phải **đen hoàn toàn**. Nếu vẫn thấy nội dung thì máy đang chạy Windows cũ hơn 10 phiên bản 2004 — nâng Windows hoặc chấp nhận chỉ còn lớp chữ mờ + nhật ký.
