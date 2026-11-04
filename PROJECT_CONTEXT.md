# 🏨 HOTEL RESERVATION SYSTEM - PROJECT CONTEXT & VIBE CODING GUIDE

> **Dành cho AI & Developers (Vibe Coding Guide)**  
> *Đọc kỹ tài liệu này trước khi code bất kỳ tính năng nào để đảm bảo tính nhất quán, không gây conflict và ra sản phẩm nhanh nhất.*

---

## 👥 1. BẢNG PHÂN CÔNG NHIỆM VỤ NHÓM
- **Khanh**: Database core, Migration + Seed users/roles, API Auth (`/api/register`, `/api/login`, `/api/logout`), Phân quyền (Guest, Receptionist, Admin, Housekeeping), Rate limit & Bảo mật.
- **Muội** *(Đã hoàn thành 100%)*: API Booking core (`/api/rooms/available`, đặt phòng, tính tiền multi-night/multi-room, chống double-booking, sửa/hủy đặt phòng, tính cọc và hoàn cọc).
- **Khang** *(Đã hoàn thành mẫu)*: API Quản lý dịch vụ (`/api/services`), Đơn gọi dịch vụ (`/api/service-orders`), Tính phụ thu trả phòng muộn (Late checkout), Tổng hợp & Đóng hóa đơn (`/api/invoices`), Thanh toán (`/api/invoices/{id}/pay`).
- **Lễ**: Unit test & Integration test cho toàn bộ hệ thống (Availability, Cancellation, Late checkout, Invoice calculation, Setup GitHub Actions CI).
- **Kiêng**: Giao diện Guest (React/Vue/Blade: Home, Search phòng, Room Detail, Booking, Room Service, Invoice, My Bookings).
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

## Cập nhật — Kiêng — Guest Frontend — 04/11/2026

- Thêm giao diện Guest bằng HTML/CSS/JavaScript tại
  `HotelReservation/frontend/guest/`.
- Thay trang `index.html` mẫu bằng trang chủ Copy Paste Hotel.
- Thêm các thư mục `assets/`, `auth/`, `components/` và `guest/`
  từ giao diện đã xây dựng.
- Giữ cấu trúc đường dẫn của giao diện gốc.
- Phạm vi lần cập nhật: đưa giao diện vào repository để review;
  chưa xác nhận tích hợp với API Laravel.
- Không sửa backend hoặc giao diện Staff.
