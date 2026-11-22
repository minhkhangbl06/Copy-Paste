# Frontend Guest — tích hợp API

Phạm vi thay đổi chỉ nằm trong `HotelReservation/frontend/guest`. Không thay đổi
controller, route, model, migration hoặc kiểm thử của backend.

## Chạy

Frontend dùng HTML/CSS/JavaScript thuần, không cần npm/build. Từ thư mục gốc repo:

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Mở `http://127.0.0.1:5500/HotelReservation/frontend/guest/`.
Cấu hình URL API tại `assets/js/guest-config.js`; mặc định là
`http://127.0.0.1:8000/api`. Nhóm backend vận hành API và cấu hình CORS cho origin
frontend. Không có migration nào đi kèm phần Guest này.

## Endpoint thực tế đang dùng

| Thao tác | API |
| --- | --- |
| Đăng ký, đăng nhập | `POST /auth/register`, `POST /auth/login` |
| Xác minh phiên, đăng xuất | `GET /auth/me`, `POST /auth/logout` |
| Danh mục, tìm phòng trống | `GET /rooms`, `GET /rooms/available` |
| Đặt nhiều phòng | Một lần `POST /bookings` với `room_ids`, `check_in_date`, `check_out_date`, `guest_name`, `guest_phone` |
| Đọc lại booking | `GET /bookings/{id}` |
| Tìm hóa đơn đã phát hành của booking | `GET /invoices?search={booking_code}`, lọc đúng `booking_id` rồi đọc `GET /invoices/{id}` |
| Bảng kê chưa phát hành hóa đơn | `GET /bookings/{id}/invoice/preview` |
| Gọi dịch vụ | `POST /service-orders` |

Không còn endpoint tự đề xuất `/guest/*` hoặc dữ liệu mẫu dự phòng. Mật khẩu chỉ
gửi đến API, không lưu. Bearer token và thời hạn theo server nằm trong session của tab.

## Đặt nhiều phòng và xem lại

API hiện tại tạo một booking riêng cho từng phòng dù nhận nhiều `room_ids` trong
cùng request. Frontend xử lý toàn bộ mảng kết quả, giữ nguyên các ID/mã booking do
server cấp và hiển thị cùng nhau như một lượt đặt; không tự tạo mã booking giả.
Nếu server trả một booking có `booking_rooms`, frontend cũng đọc phân phòng đó.

Trang đặt phòng kiểm tra lại phòng trống qua API. Giá trước khi gửi là tạm tính
theo giá cơ bản, chưa gồm phụ thu. Tổng tiền chính thức/cọc yêu cầu trên hóa đơn
được lấy từ booking và hóa đơn server trả về.

Do API danh sách booking hiện chưa giới hạn theo tài khoản Guest, frontend không
tải danh sách của toàn bộ khách. `bookingReceipts` chỉ lưu nhóm ID thật của các
booking vừa tạo trong phiên đăng nhập; mỗi lần mở trang đều đọc lại dữ liệu qua API.
Không lưu số tiền, trạng thái hoặc dữ liệu hóa đơn vào kho dữ liệu giả cục bộ.
Danh sách này không phải lịch sử đầy đủ trên thiết bị khác hoặc sau khi đăng xuất.
Receipt phục vụ điều hướng, không thay thế phân quyền ở server.

## Dịch vụ và hóa đơn

Khách chọn lượt đặt rồi chọn phòng đang lưu trú. Request dịch vụ chứa `booking_id`
của phòng đó, `room_id` và `booking_room_id` nếu server có phân phòng. Phần `items`
chứa `service_id`, `quantity`; danh mục và giá lấy từ `GET /services`.

API danh sách đơn dịch vụ hiện dành cho nhân viên. Guest đọc các dịch vụ đang ghi
vào phòng từ `unpaid_service_orders` của bảng kê. Giao diện ghi rõ đây không phải
lịch sử đầy đủ của các đơn đã hủy/thanh toán riêng.

Hóa đơn đã phát hành đọc dòng `items` (bảng `invoice_items`); bảng kê tạm đọc
`invoice_items`. Frontend nhóm theo `booking_room_id` hoặc `room_id`, giữ khoản
chung riêng, không tự dựng dòng hóa đơn theo giá phòng hiện tại. Nếu một hóa đơn
không tải được thì không hiển thị tổng thiếu như thể đã tải đủ.

## Giới hạn dữ liệu backend

- `main` cũ chưa trả `invoice_items`. Chi tiết theo phòng cần backend có cập nhật
  của nhánh `Khang`, commit `20f191c5e112defeef71319e886461c8f0de78a9`. Frontend không
  thay đổi hoặc tự gộp commit đó vào backend của nhóm.
- Backend đã kiểm tra chưa trả xác nhận thu cọc (`deposit_status`,
  `deposit_paid_amount`). Frontend hiển thị chưa có thông tin; không suy ra đã cọc
  từ `deposit_amount`, trạng thái confirmed, hay số tiền API đang khấu trừ.
  Khi server có các trường này, giao diện đọc và hiển thị trực tiếp.
- Backend hiện khấu trừ `deposit_amount` khi tính hóa đơn; đây là chính sách/API
  hiện tại, không phải chứng từ đã nhận cọc do frontend xác nhận.
- Phân quyền sở hữu booking/hóa đơn và lịch sử Guest trên mọi thiết bị cần được
  nhóm backend thực hiện. Không thể bảo đảm việc này chỉ bằng JavaScript.
- Phục hồi mật khẩu, cập nhật hồ sơ và đánh giá chưa có API; frontend không báo
  thành công giả. Hồ sơ hiển thị dữ liệu từ `/auth/me`.

## Kiểm tra

```powershell
node --test HotelReservation/frontend/guest/tests/*.test.cjs
```

Kiểm tra adapter/phiên/nhóm dòng hóa đơn dùng fixture kiểm thử. Đã kiểm tra trình
duyệt với API chạy từ bản sao nguyên trạng nhánh `Khang`: đăng ký, chọn hai phòng,
tạo booking, gọi dịch vụ cho phòng 102, bảng kê và hóa đơn chính thức có chi tiết
đúng phòng. Database và bản sao API kiểm thử tách riêng trong `tests/.runtime/`
(được Git bỏ qua), không thay đổi mã nguồn hoặc database backend ứng dụng.
