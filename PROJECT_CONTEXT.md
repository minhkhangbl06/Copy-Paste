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

## 🚀 4. DANH SÁCH TOÀN BỘ API HỆ THỐNG (API REFERENCE)

### A. Phân hệ Đặt phòng & Buồng phòng (Trịnh Thị Tiểu Muội & Housekeeping)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/rooms` | Lấy danh sách tất cả các phòng (filter `?room_type=Deluxe&status=available`) |
| `GET` | `/api/rooms/{id}` | Xem chi tiết 1 phòng |
| `PATCH`| `/api/rooms/{id}/status` | Đổi trạng thái phòng cho Housekeeping (`clean`, `available`, `dirty`, `maintenance`) |
| `GET` | `/api/rooms/available` | Tra cứu phòng trống theo ngày (`?check_in_date=...&check_out_date=...&room_type=...`) |
| `GET` | `/api/bookings` | Lấy danh sách toàn bộ đặt phòng (hỗ trợ search tên/SĐT/mã phòng, lọc status, check_in_date) |
| `POST` | `/api/bookings` | Đặt phòng (hỗ trợ single/multi-room, multi-night, chống double-booking, phụ thu cuối tuần +15%, tính cọc theo BR-04/05) |
| `GET` | `/api/bookings/{id}` | Xem chi tiết đơn đặt phòng kèm thông tin phòng liên kết |
| `PATCH`| `/api/bookings/{id}` | Sửa booking / đổi ngày hoặc đổi phòng có kiểm tra trùng lịch |
| `POST` | `/api/bookings/{id}/cancel` | Hủy booking & tự động tính hoàn cọc theo BR-06 (>=48h: 100%, 24-48h: 50%, <24h: 0%) |
| `POST` | `/api/bookings/{id}/check-in` | Nhận phòng (Check-in), chuyển booking sang `checked_in`, phòng sang `occupied` |
| `POST` | `/api/bookings/{id}/check-out` | Trả phòng (Check-out), ghi nhận `actual_checkout_at`, đổi booking sang `checked_out`, phòng sang `dirty` |

### B. Phân hệ Dịch vụ, Hóa đơn & Thu ngân (Khang)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/services` | Danh mục dịch vụ khách sạn |
| `GET` | `/api/services/{id}` | Chi tiết dịch vụ |
| `POST` | `/api/services` | Thêm dịch vụ mới |
| `GET` | `/api/service-orders` | Danh sách đơn gọi dịch vụ phòng |
| `POST` | `/api/service-orders` | Đặt món/dịch vụ tại phòng |
| `PATCH`| `/api/service-orders/{id}/status` | Cập nhật trạng thái đơn dịch vụ |
| `POST` | `/api/service-orders/{id}/pay` | Thanh toán riêng cho đơn dịch vụ |
| `GET` | `/api/bookings/{booking_id}/invoice/preview` | Xem trước bảng kê chi phí phòng, dịch vụ, phụ thu muộn |
| `POST` | `/api/bookings/{booking_id}/late-checkout` | Tính phụ thu trả phòng muộn độc lập |
| `POST` | `/api/bookings/{booking_id}/invoice` | Phát hành hóa đơn chính thức cho booking |
| `GET` | `/api/invoices` | Danh sách toàn bộ hóa đơn cho thu ngân (hỗ trợ search, filter status) |
| `GET` | `/api/invoices/{id}` | Chi tiết hóa đơn kèm đơn dịch vụ và thanh toán |
| `POST` | `/api/invoices/{id}/pay` | Ghi nhận thanh toán hóa đơn |
| `POST` | `/api/invoices/{id}/close` | Đóng hóa đơn và hoàn tất check-out |

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

### 📌 Phạm Quang Duy - Phân hệ Staff Frontend / Management Portal

- **Vị trí source code**: `HotelReservation/frontend/staff/`.

- **Các hạng mục đã triển khai**:

  - **Dashboard tổng quan** (`index.html`, `js/main.js`):
    - Xây dựng giao diện quản trị tổng quan dành cho nhân viên khách sạn.
    - Tổ chức bố cục Sidebar, Topbar và khu vực nội dung quản trị.
    - Hiển thị các thông tin tổng quan và điều hướng đến các phân hệ Staff.

  - **API Client dùng chung** (`js/api.js`):
    - Xây dựng tầng kết nối HTTP tập trung (`StaffAPI`) giao tiếp với Backend Laravel.
    - Sử dụng URL gốc `http://127.0.0.1:8000/api`.
    - Chuẩn hóa cấu trúc request/response theo convention `{ status, message, data }`.
    - Xử lý timeout, lỗi mạng và thông báo lỗi API.
    - Hỗ trợ API Mode và Mock Mode chủ động; không tự động chuyển sang dữ liệu giả khi API thật gặp lỗi.
    - Lưu trữ dữ liệu mô phỏng bằng `localStorage`.

  - **Quản lý đặt phòng** (`bookings.html`, `js/bookings.js`, `css/bookings.css`):
    - Hiển thị và thống kê danh sách đặt phòng.
    - Tìm kiếm theo mã booking, tên khách, số điện thoại và số phòng.
    - Lọc theo trạng thái và ngày nhận phòng.
    - Tạo booking mới, tính toán số đêm, tiền phòng, phụ thu và tiền cọc theo BR-04/BR-05.
    - Xem chi tiết booking.
    - Hủy booking theo chính sách BR-06:
      - `UT-CAN-01`: Hoàn 100% tiền cọc khi hủy trước hoặc đúng 48 giờ.
      - `UT-CAN-02`: Hoàn 50% tiền cọc khi hủy từ 24 giờ đến dưới 48 giờ.
      - `UT-CAN-03`: Không hoàn tiền khi hủy dưới 24 giờ hoặc No-show.
    - Hiển thị số tiền hoàn dự kiến và cảnh báo chưa thực hiện giao dịch tài chính thật.

  - **Check-in / Check-out** (`checkin.html`, `js/checkin.js`, `css/checkin.css`):
    - Triển khai giao diện và JavaScript phục vụ nghiệp vụ nhận phòng, trả phòng.

  - **Housekeeping** (`housekeeping.html`, `js/housekeeping.js`, `css/housekeeping.css`):
    - Triển khai giao diện quản lý công việc buồng phòng.
  - **Room Service** (`services.html`, `js/services.js`, `css/services.css`):
    - Triển khai giao diện quản lý hàng đợi dịch vụ phòng.

  - **Billing** (`billing.html`, `js/billing.js`, `css/billing.css`):
    - Triển khai giao diện quản lý thanh toán và hóa đơn.

  - **Reports** (`reports.html`, `js/reports.js`, `css/reports.css`):
    - Triển khai giao diện báo cáo và thống kê dành cho nhân viên quản trị.

- **Phong cách thiết kế**:
  - Kế thừa ngôn ngữ thiết kế Guest Frontend của Tống Phước Kiêng.
  - Sử dụng bảng màu navy `#233e57`, slate `#708090`, font Be Vietnam Pro / Roboto.
  - Bố cục quản trị riêng với Sidebar, Topbar và các khu vực chức năng độc lập.

#### Cập nhật ngày 23/11/2026

- **Xác thực Staff**. Portal kết nối API đăng nhập, kiểm tra phiên và đăng xuất của Khanh. Yêu cầu API gửi Bearer token sau khi kiểm tra phiên. Giao diện hiển thị tên và vai trò thật, giới hạn menu và chuyển hướng theo vai trò. Test trên Windows xác nhận lễ tân mở được Dashboard và tài khoản buồng phòng được chuyển về Housekeeping Board khi mở Hóa đơn.
- **Booking nhiều phòng và Dashboard**. Lễ tân tạo một mã cho nhiều phòng, tìm lại được toàn bộ phòng trong đơn. API Staff lưu booking và các dòng `booking_rooms` trong một transaction, kiểm tra trùng lịch cả booking đơn cũ và phòng liên kết. Dashboard đếm ID phòng khác nhau có khách đang ở, bỏ qua phòng chỉ mới đặt và hỗ trợ booking cũ dùng `room_id`.
- **Thu cọc, nhận phòng và dịch vụ**. Migration `2026_11_23_000001_add_deposit_received_at_to_bookings.php` bổ sung thời điểm thu cọc. Lễ tân xác nhận đã thu cọc trước khi nhận phòng cho cả đơn. Đơn dịch vụ lưu `booking_room_id` cho phòng được chọn và kiểm tra phòng thực sự thuộc booking.
- **Hóa đơn chung**. Checkout lập bảng kê tiền phòng, dịch vụ, phụ thu, VAT và cọc đã thu. Một giao dịch ghi nhận phần còn phải thu, đóng một hóa đơn và hoàn tất trả phòng. Gửi lại checkout trả hóa đơn đã chốt và giữ nguyên số khoản thu.
- **Dọn phòng**. Dùng schema và model housekeeping của Khanh để tạo một task cho từng phòng khi checkout. Task ghi lịch sử khởi tạo, bắt đầu và hoàn tất, kèm người cập nhật và thời điểm. Khi hoàn tất, riêng phòng của task chuyển sang Trống – sạch.
- **Kiểm thử**. Laravel đạt 49 bài test, 294 assertions, có kiểm tra trùng lịch, quyền backend, thanh toán lặp và dọn riêng từng phòng. Luồng trên Windows đã thử từ đăng nhập đến booking hai phòng, thu cọc, nhận phòng, ghi dịch vụ cho 902, đóng một hóa đơn 1.171.800 đ và tạo hai việc dọn. Tài khoản buồng phòng hoàn tất dọn 902 trong khi 901 vẫn chờ dọn. API từ chối yêu cầu cập nhật task của lễ tân với HTTP 403. Giao diện lễ tân hiện vẫn hiển thị nút đó khi xem bảng phòng.
- **Tích hợp Git**. Nhánh thử của Duy dựa trên `Khanh` tại `567b5db`. Khi schema của Khanh có mặt trên `main`, đối chiếu tab Files changed để PR vào `main` chỉ chứa phần Duy. Admin thực hiện merge.

### 📌 Lê Minh Khang - Phân hệ Dịch vụ phòng, Hóa đơn & Thu ngân Backend (Đã hoàn thành 100% nhiệm vụ)
- **Gắn SERVICE_ORDERS vào booking_room_id**:
  - Bổ sung `booking_room_id` vào `service_orders` để xác định chính xác dịch vụ/món ăn được gọi từ phòng nào trong booking đa phòng.
  - `ServiceOrderController::store`: tự động xác thực và liên kết với `booking_room_id` hoặc suy từ `room_id`/đơn đặt phòng.
  - Lưu chi tiết món, số lượng, đơn giá (`unit_price`) và thành tiền (`amount`) trong `SERVICE_ORDER_ITEMS`.
- **Tạo một INVOICE cho cả booking & Bảng INVOICE_ITEMS**:
  - Tạo bảng và Model `InvoiceItem` (`invoice_items`) lưu chi tiết từng đêm phòng (`room_night`), dịch vụ theo từng phòng (`service`), phụ thu trả phòng muộn (`late_checkout`), phụ thu phát sinh (`surcharge`) và giảm giá (`discount`).
  - Hỗ trợ quan hệ `booking_room_id` và `room_id` trên từng dòng `invoice_items` để Guest và Staff xem chi tiết chi phí của từng phòng.
  - Tạo duy nhất 1 hóa đơn `invoices` cho toàn bộ booking (`booking_id` unique).
- **Logic tính hóa đơn tổng hợp**:
  - `InvoiceCalculationService`: tổng hợp tiền phòng từ `room_nights` của tất cả các phòng trong booking (hoặc fallback tính theo đêm), cộng dồn các đơn dịch vụ chưa thanh toán theo phòng, phụ thu trả phòng muộn qua `LateCheckoutService`, phụ thu khác, trừ tiền cọc đã thanh toán và tính thuế VAT 8%.
- **Chặn đóng hóa đơn khi chưa thu đủ**:
  - `InvoiceController::closeInvoice`: kiểm tra tổng số tiền đã thanh toán qua `payments` (`status = success`). Nếu chưa đủ số tiền hóa đơn (`totalPaid < total_amount`), trả mã lỗi `422` và chặn không cho đóng hóa đơn.
  - Khi đã thu đủ tiền, đóng hóa đơn thành công, cập nhật trạng thái booking sang `checked_out` và chuyển toàn bộ các phòng trong booking sang trạng thái `dirty` chờ dọn dẹp.
- **Kiểm thử tự động**:
  - Toàn bộ test suite PHPUnit (45 tests, 284 assertions) bao gồm `KhangServiceAndBillingTest` đạt 100% pass.

