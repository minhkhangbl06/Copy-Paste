# 🏨 HOTEL RESERVATION SYSTEM - PROJECT CONTEXT & VIBE CODING GUIDE

> **Dành cho AI & Developers (Vibe Coding Guide)**  
> *Đọc kỹ tài liệu này trước khi code bất kỳ tính năng nào để đảm bảo tính nhất quán, không gây conflict và ra sản phẩm nhanh nhất.*

---

## 👥 1. BẢNG PHÂN CÔNG NHIỆM VỤ NHÓM
- **Khanh**: Database core, Migration + Seed users/roles, API Auth (`/api/register`, `/api/login`, `/api/logout`), Phân quyền (Guest, Receptionist, Admin, Housekeeping), Rate limit & Bảo mật.
- **Muội**: API Booking core (`/api/rooms/available`, đặt phòng, tính tiền multi-night/multi-room, chống double-booking, sửa/hủy đặt phòng).
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
| `room_type` | string | Loại phòng: Standard, Deluxe, Suite,... |
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

### C. `services` (Danh mục dịch vụ)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigIncrements | Khóa chính |
| `name` | string | Tên món/dịch vụ (Phở bò, Coca, Giặt ủi, Spa,...) |
| `category` | string | `food`, `minibar`, `laundry`, `spa`, `transport` |
| `price` | decimal(12,2) | Đơn giá niêm yết |
| `unit` | string | Đơn vị: tô, lon, kg, vé, lần... |
| `is_available` | boolean | Trạng thái còn phục vụ hay không |

### D. `service_orders` (Đơn gọi dịch vụ)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigIncrements | Khóa chính |
| `order_code` | string, unique | Mã đơn (SO-20261104-ABC12) |
| `booking_id` | foreignId | Thuộc booking nào |
| `room_id` | foreignId, nullable | Phòng nào gọi |
| `total_amount` | decimal(12,2) | Tổng tiền đơn dịch vụ |
| `status` | enum | `pending`, `confirmed`, `in_progress`, `delivered`, `cancelled` |
| `charge_to_room` | boolean | `true`: Gộp vào hóa đơn phòng; `false`: Trả riêng |
| `is_paid` | boolean | Đã thanh toán tiền riêng chưa |

### E. `service_order_items` (Chi tiết món)
- `id`, `service_order_id`, `service_id`, `quantity`, `price_at_order` (lưu giá tại thời điểm đặt), `subtotal`.

### F. `invoices` (Hóa đơn tổng kết Check-out)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigIncrements | Khóa chính |
| `invoice_code` | string, unique | Mã hóa đơn (INV-20261104-XYZ) |
| `booking_id` | foreignId | Thuộc booking nào |
| `room_charges` | decimal(12,2) | Tiền phòng |
| `service_charges`| decimal(12,2) | Tiền dịch vụ chưa thanh toán gộp vào |
| `late_checkout_fee`| decimal(12,2) | Phụ thu trả phòng muộn |
| `other_surcharges`| decimal(12,2) | Phụ thu khác (hư hỏng, thêm người) |
| `deposit_deducted`| decimal(12,2) | Khấu trừ tiền cọc đã trả trước |
| `tax_amount` | decimal(12,2) | Thuế VAT (8%) |
| `total_amount` | decimal(12,2) | Tổng số tiền khách cần thanh toán |
| `status` | enum | `unpaid`, `partially_paid`, `paid`, `cancelled` |
| `issued_at`, `paid_at`| dateTime | Thời gian xuất và thanh toán |

### G. `payments` (Lịch sử giao dịch thanh toán)
- `id`, `invoice_id`, `service_order_id`, `amount`, `payment_method` (`cash`, `credit_card`, `bank_transfer`, `vnpay`, `momo`), `transaction_code`, `status`, `notes`.

---

## 🚀 4. DANH SÁCH API KHANG ĐÃ VIẾT (SẴN SÀNG CHO GIAO DIỆN & TEST)

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/services` | Lấy danh mục dịch vụ (filter `?category=food`, search `?search=coca`) |
| `GET` | `/api/services/{id}` | Chi tiết 1 dịch vụ |
| `POST`| `/api/services` | Thêm mới dịch vụ |
| `GET` | `/api/service-orders` | Danh sách đơn dịch vụ (lọc `?booking_id=1&status=pending`) |
| `POST`| `/api/service-orders` | Đặt dịch vụ cho phòng |
| `PATCH`| `/api/service-orders/{id}/status` | Đổi trạng thái (`confirmed`, `in_progress`, `delivered`, `cancelled`) |
| `POST`| `/api/service-orders/{id}/pay` | Khách thanh toán riêng cho đơn dịch vụ |
| `GET` | `/api/bookings/{id}/invoice/preview` | Xem trước bảng kê chi phí chi tiết (tiền phòng + DV + late fee - cọc) |
| `POST`| `/api/bookings/{id}/late-checkout` | Tính phụ thu trả phòng muộn (12h30-15h: +30%, 15h-18h: +50%, sau 18h: +100%) |
| `POST`| `/api/bookings/{id}/invoice` | Xuất hóa đơn thanh toán chính thức |
| `POST`| `/api/invoices/{id}/pay` | Ghi nhận thanh toán hóa đơn (hỗ trợ trả từng phần / toàn bộ) |
| `POST`| `/api/invoices/{id}/close` | Đóng hóa đơn, chuyển booking -> `checked_out`, phòng -> `dirty` |

---

## ⚡ 6. HƯỚNG DẪN KHI CLONE DỰ ÁN VỀ MÁY (DÀNH CHO ĐỒNG ĐỘI)

Do Git tự động bỏ qua thư mục `vendor/`, file `.env` và database theo chuẩn bảo mật, nên khi bạn khác clone project về máy cần làm các bước sau:

### Cách 1: Tự động (Khuyên dùng trên Windows)
1. Mở thư mục `HotelReservation/backend`.
2. Click đúp chuột vào file **`setup.bat`** (hoặc chạy lệnh `.\setup.bat` trong terminal).
3. Script sẽ tự tạo `.env`, chạy `composer install`, tạo database SQLite và seed dữ liệu mẫu tự động 100%.

### Cách 2: Thủ công qua Terminal
```bash
cd HotelReservation/backend

# 1. Tạo file .env
copy .env.example .env

# 2. Cài đặt các gói thư viện
composer install

# 3. Tạo APP_KEY
php artisan key:generate

# 4. Khởi tạo database & nạp dữ liệu mẫu
php artisan migrate:fresh --seed

# 5. Khởi động server
php artisan serve
```

---

## 💡 7. HƯỚNG DẪN CÁC THÀNH VIÊN TIẾP TỤC DỰ ÁN

- **Khanh (Auth & Roles)**: Mở rộng bảng `users` sẵn có (thêm cột `role`: `guest`, `receptionist`, `admin`, `housekeeping`). Viết `AuthController` với Sanctum hoặc Token.
- **Muội (Booking API)**: Dùng trực tiếp 2 bảng `rooms` và `bookings`. Viết logic tìm phòng trống theo `check_in_date` và `check_out_date`, chống trùng lịch (double-booking).
- **Lễ (Test & CI)**: Chạy lệnh `php artisan test` trong thư mục `backend`. Đã có sẵn test mẫu `KhangServiceAndBillingTest.php` với 60 assertions pass 100%. Tiếp tục bổ sung test cho Auth và Booking.
- **Kiêng & Duy (Frontend)**: Backend đã chạy ngon lành tại `http://localhost:8000/api`. Cứ gọi trực tiếp vào các API trên để render giao diện.
