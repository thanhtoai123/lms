# Duyệt giảm giá & ba quyền tinh vi

Hai chốt kiểm soát thêm vào tháng 09/2026: một chốt **tiền** (giảm giá vượt ngưỡng phải được duyệt)
và một chốt **dữ liệu** (đổi mã học viên, đè dữ liệu khi nhập, rút danh sách ra tệp).

## 1. Giảm giá: trần và ngưỡng là hai thứ khác nhau

| | Trần giảm (`maxLineDiscountPercent`, mặc định 50%) | Ngưỡng duyệt (`discountApprovalPercent`, mặc định 20%) |
|---|---|---|
| Vượt thì sao | **Không tạo được đơn** | Tạo được đơn, nhưng đơn vào *Chờ duyệt giảm giá* |
| Ai gỡ | Đổi cấu hình vận hành | Người có `finance:approve` bấm duyệt |
| Vì sao có | Chặn sai sót gõ nhầm (giảm 90%) | Sale vẫn chốt được khách tại quầy, trung tâm vẫn kiểm soát được tiền |

Cả hai đặt ở **Cấu hình vận hành → Thanh toán**, theo từng cơ sở. Đặt ngưỡng `100` = tắt hẳn việc duyệt.

Mẫu số là **giá niêm yết** (tổng trước giảm), không phải tiền sau giảm: giảm 1,8 triệu trên 6 triệu là
30%, không phải 43%. Tính trên **cả đơn** (giảm theo dòng + giảm cấp đơn cộng lại), vì chia nhỏ thành
nhiều dòng là cách lách ngưỡng hiển nhiên nhất.

## 2. Vòng đời

```
Tạo đơn  ──(giảm < ngưỡng)──►  none        → thu tiền bình thường
         └─(giảm ≥ ngưỡng)──►  pending     → KHÔNG ghi nhận thu được
                                  ├─ duyệt   → approved → thu tiền bình thường
                                  └─ từ chối → rejected → phải sửa mức giảm / tạo đơn khác
```

- `recordPayment` từ chối thẳng khi đơn ở `pending` hoặc `rejected` (`paymentBlockedBy` ở core) — chốt
  nằm ở **máy chủ**, không phải chỉ ẩn nút.
- **Người tạo đơn không tự duyệt được đơn của mình.** Tự duyệt thì cái chốt không còn nghĩa gì.
- Từ chối **bắt buộc ghi lý do**; mọi quyết định vào `order_events` + nhật ký kiểm toán, và người tạo
  đơn nhận thông báo.

## 3. Người dùng thấy gì

| Màn hình | Thấy gì |
|---|---|
| Tạo đơn | Cảnh báo **trước khi bấm tạo**: "Giảm 30% ≥ ngưỡng 20% — đơn sẽ vào Chờ duyệt giảm giá" |
| Danh sách đơn | Dải cảnh báo đếm số đơn chờ duyệt (bấm để lọc, `?duyet=cho`) + chip trạng thái trên từng dòng |
| Chi tiết đơn | Khối duyệt / từ chối ngay đầu trang; nút ghi nhận thu **biến mất** khi chưa duyệt |

## 4. Ba quyền tinh vi (KT-32)

| Quyền | Chặn việc gì | Vai trò có sẵn |
|---|---|---|
| `student:change_code` | Đổi **mã học viên** — mã là căn cứ đối chiếu hệ cũ, phiếu thu, bảng điểm danh đã in | Quản lý cơ sở trở lên (`student:*`). Quản lý lớp và CSM sửa hồ sơ được nhưng **không** đổi mã |
| `lead:overwrite` | Tick "Đè" khi nhập file: lấy dữ liệu file thay dữ liệu cũ | CSM (`lead:*`). Sale Hội sở nhập được nhưng không đè được |
| `student:export` / `lead:export` | Rút hàng loạt danh sách kèm liên hệ ra tệp | Theo `student:*` / `lead:*`. **Kiểm toán (`*:read`) xem được tất cả nhưng không xuất được** — đúng bản chất vai trò đọc |

Kiểm ở máy chủ (`updateStudent`, `commitLeadImport`, `exportStudents`, `exportLeads`); giao diện chỉ
ẩn nút cho đỡ bực mình, không phải lớp bảo vệ.

## 5. Điều chưa làm

- **Ưu đãi theo khoá** (bảng `course_discounts`, gợi ý mức giảm khi chọn khoá) — tách thành việc riêng.
- Sửa học phí hợp đồng (`updateEnrollmentFee`) đổi tổng tiền mà không đi qua ngưỡng duyệt. Chấp nhận
  được vì thủ tục đó đã đòi `finance:confirm` (kế toán / quản lý) và ghi nhật ký riêng.
- Xuất CSV của các màn khác (công nợ, hoa hồng, nhân sự…) vẫn chỉ cần quyền đọc màn đó.
