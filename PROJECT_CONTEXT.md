# 🏨 HOTEL RESERVATION SYSTEM - PROJECT CONTEXT & VIBE CODING GUIDE

> **Dành cho AI & Developers (Vibe Coding Guide)**  
> *Đọc kỹ tài liệu này trước khi code bất kỳ tính năng nào để đảm bảo tính nhất quán, không gây conflict và ra sản phẩm nhanh nhất.*

---

## 👥 1. BẢNG PHÂN CÔNG NHIỆM VỤ NHÓM
- **Khanh**: Database core, Migration + Seed users/roles, API Auth (`/api/register`, `/api/login`, `/api/logout`), Phân quyền (Guest, Receptionist, Admin, Housekeeping), Rate limit & Bảo mật.
- **Muội** *(Đã hoàn thành 100%)*: API Booking core (`/api/rooms/available`, đặt phòng, tính tiền multi-night/multi-room, chống double-booking, sửa/hủy đặt phòng, tính cọc và hoàn cọc).
- **Khang** *(Đã hoàn thành mẫu)*: API Quản lý dịch vụ (`/api/services`), Đơn gọi dịch vụ (`/api/service-orders`), Tính phụ thu trả phòng muộn (Late checkout), Tổng hợp & Đóng hóa đơn (`/api/invoices`), Thanh toán (`/api/invoices/{id}/pay`).
- **Lễ**: Unit test & Integration test cho toàn bộ hệ thống (Availability, Cancellation, Late checkout, Invoice calculation, Setup GitHub Actions CI).
- **Kiêng** *(Đã hoàn thành 100% UI/UX Guest)*: Giao diện Guest (HTML/CSS/JS thuần: Home, Search phòng, Room Detail, Booking & Payment, Room Service & Food Menu, Invoice, My Bookings, Profile & Review). Hiện đang chạy dữ liệu giả lập (mock simulation), sẽ nối API Laravel ở giai đoạn tích hợp chung.
- **Duy**: Giao diện Staff (Dashboard, Quản lý Booking, Check-in/Check-out, Room Service Queue, Billing, Báo cáo).

---

## 🛠️ 2. QUY ƯỚC CỐT LÕI (CONVENTIONS)
1. **Framework**: PHP 8.2+ & Laravel 12 (thư mục: `HotelReservation/backend`).
2. **Database**: SQLite (phát triển cục bộ) / MySQL (triển khai production). File db cục bộ nằm ở `database/database.sqlite`.
3. **Quy chuẩn tên bảng**: Luôn là số nhiều, `snake_case` (vd: `rooms`, `bookings`, `services`, `service_orders`, `invoices`, `payments`).
4. **Quy chuẩn khóa ngoại**: `{tên_bảng_số_ít}_id` (vd: `booking_id`, `room_id`, `invoice_id`).
5. **Quy chuẩn định dạng Response API**:
   - Thành công:
     ```json
     {
       "status": "success",
       "message": "Thông báo ngắn gọn (nếu có)",
       "data": { ... }
     }
     ```
   - Thất bại:
     ```json
     {
       "status": "error",
       "message": "Mô tả lỗi cụ thể"
     }
     ```

---

## 🗄️ 3. CƠ SỞ DỮ LIỆU ĐÃ ĐỊNH NGHĨA (DATABASE SCHEMA)

### A. `rooms` (Phòng)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigIncrements | Khóa chính |
| `room_number` | string, unique | Số phòng (101, 102, 201,...) |
| `room_type` | string | Loại phòng: Standard, Deluxe, Family, Suite |
| `price_per_night` | decimal(12,2) | Đơn giá 1 đêm phòng |
| `status` | string | `available`, `occupied`, `maintenance`, `dirty` |

### B. `bookings` (Đơn đặt phòng)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigIncrements | Khóa chính |
| `booking_code` | string, unique | Mã đặt phòng (BK-20261104-001) |
| `room_id` | foreignId | Khóa ngoại sang `rooms.id` |
| `guest_name` | string | Tên khách |
| `guest_phone` | string | SĐT khách |
| `check_in_date` | date | Ngày nhận phòng |
| `check_out_date` | date | Ngày trả phòng quy định (12:00 trưa) |
| `actual_checkout_at` | dateTime, nullable | Thời điểm trả phòng thực tế |
| `total_room_amount` | decimal(12,2) | Tổng tiền phòng |
| `deposit_amount` | decimal(12,2) | Tiền đã đặt cọc trước |
| `status` | enum | `pending`, `confirmed`, `checked_in`, `checked_out`, `cancelled` |

---

## 🚀 4. DANH SÁCH TOÀN BỘ API PHÂN HỆ ĐẶT PHÒNG (RESERVATION MODULE)

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/rooms` | Lấy danh sách tất cả các phòng (filter `?room_type=Deluxe&status=available`) |
| `GET` | `/api/rooms/{id}` | Xem chi tiết 1 phòng |
| `GET` | `/api/rooms/available` | Tra cứu phòng trống theo ngày (`?check_in_date=...&check_out_date=...&room_type=...`) |
| `POST` | `/api/bookings` | Đặt phòng (hỗ trợ single/multi-room, multi-night, chống double-booking, phụ thu cuối tuần +15%, tính cọc theo BR-04/05) |
| `GET` | `/api/bookings/{id}` | Xem chi tiết đơn đặt phòng kèm thông tin phòng liên kết |
| `PATCH` | `/api/bookings/{id}` | Sửa booking / đổi ngày hoặc đổi phòng có kiểm tra trùng lịch |
| `POST` | `/api/bookings/{id}/cancel` | Hủy booking & tự động tính hoàn cọc theo BR-06 (>=48h: 100%, 24-48h: 50%, <24h: 0%) |

---

## 📝 5. NHẬT KÝ THỰC HIỆN TÍNH NĂNG (CHANGE LOG)

### 📌 Trịnh Thị Tiểu Muội - Module Reservation Backend (Đã hoàn thành 100%)
- **Model**: `app/Models/Room.php` và `app/Models/Booking.php` hoàn chỉnh với relationships.
- **Controller**: `app/Http/Controllers/ReservationController.php`.
- **Routes**: `routes/api.php` đăng ký đầy đủ các route cho `/api/rooms` và `/api/bookings`.
- **Database**: Cung cấp migration tạo bảng `rooms`, `bookings` và seeder khởi tạo sẵn 30 phòng mẫu theo đề tài.
- **Tests**: `tests/Feature/ReservationModuleTest.php` với 5 kịch bản kiểm thử toàn diện, đạt 100% assertions.

### 📌 Tống Phước Kiêng - Giao diện Guest Frontend (Đã hoàn thành 100% UI/UX & Đã Merge vào `main`)
- **Vị trí source code**: `HotelReservation/frontend/guest/`.
- **Danh mục các màn hình đã hoàn thành**:
  - **Trang chủ (`index.html`)**: Giới thiệu khách sạn, các hạng phòng, tiện ích và thanh tìm kiếm nhanh.
  - **Tra cứu & Danh sách phòng (`guest/rooms.html`)**: Bộ lọc phòng theo ngày check-in/out, số lượng khách, hạng phòng, sắp xếp theo giá và hiển thị số lượng phòng trống.
  - **Chi tiết phòng (`guest/room-detail.html`)**: Thông tin chi tiết, tiện nghi, chọn số đêm & số lượng phòng, ước tính chi phí.
  - **Quy trình đặt phòng & Thanh toán (`guest/booking.html`, `guest/booking-payment.html`, `guest/booking-detail.html`)**: Nhập thông tin khách, chọn dịch vụ bổ sung, hướng dẫn chuyển khoản cọc và hiển thị mã đơn đặt phòng.
  - **Dịch vụ & Gọi món tại phòng (`guest/services.html`, `guest/food-menu.html`, `guest/food-cart.html`)**: Xem dịch vụ giặt ủi, xe đưa đón và thực đơn gọi món ăn kèm giỏ hàng.
  - **Hóa đơn (`guest/invoice.html`)**: Bảng kê chi tiết các khoản chi phí phòng, dịch vụ, khấu trừ tiền cọc.
  - **Lịch sử đặt phòng (`guest/my-bookings.html`)**: Quản lý các đơn đặt phòng theo trạng thái (Chờ xác nhận, Đang ở, Đã hoàn tất, Đã hủy) kèm tính năng thanh toán/đánh giá.
  - **Tính năng bổ trợ**: Đăng nhập/Đăng ký (`auth/login.html`, `auth/register.html`), Hồ sơ cá nhân (`guest/profile.html`), Đánh giá phòng (`guest/review.html`).
- **Trạng thái kỹ thuật hiện tại**:
  - Giao diện xây dựng bằng HTML5, CSS3 hiện đại, Vanilla JS dạng modular, có responsive cho mobile/desktop.
  - Đang chạy độc lập với **dữ liệu giả lập (Mock data / `sessionStorage`)**, có thể trải nghiệm toàn bộ luồng nghiệp vụ trên trình duyệt mà không phụ thuộc backend.
  - **Khuyến nghị xem giao diện**: Mở qua Live Server (VS Code) hoặc bất kỳ local web server nào để tránh lỗi CORS khi tải linh kiện chung (`components/header.html`, `components/footer.html`).
  - **Kế hoạch tiếp theo**: Sau khi các thành viên hoàn tất Auth và CSDL chung, nhóm sẽ tiến hành đấu nối các API Laravel (`/api/rooms`, `/api/bookings`, `/api/services`, `/api/invoices`) vào frontend.
