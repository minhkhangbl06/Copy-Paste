# API khách sạn

Backend dùng Python 3.11+, Flask và MySQL 8.4. Các migration V004–V005 mở rộng schema v2. Database tiếp tục dùng khóa số và giữ quy tắc chống đặt trùng phòng, chốt giá theo từng đêm và đối soát thanh toán của v2.

## Cài đặt

1. **Database mới**: chạy V001 đến V005 theo thứ tự trong [README](README.md). Chạy thêm `v2/seed.sql` nếu cần dữ liệu demo. **Database v2 đã chạy V001–V003**: sao lưu, chạy riêng V004 rồi V005 một lần bằng tài khoản triển khai. Chạy trên staging trước khi áp dụng vào dữ liệu thật vì DDL MySQL tự commit.
2. Tạo tài khoản riêng cho HTTP API bằng tài khoản quản trị MySQL. Câu lệnh dưới đây yêu cầu MySQL sinh mật khẩu. Giữ mật khẩu sinh ra ở nơi lưu bí mật của môi trường.

   ```sql
   CREATE USER 'hotel_api'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
   GRANT 'hotel_v2_api'@'%' TO 'hotel_api'@'127.0.0.1';
   SET DEFAULT ROLE 'hotel_v2_api'@'%' TO 'hotel_api'@'127.0.0.1';
   ```

3. Từ thư mục dự án trên PowerShell, tạo môi trường Python và cài thư viện.

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

4. Cấu hình `HOTEL_DB_USER` và `HOTEL_DB_PASSWORD` trong môi trường chạy. Mặc định server MySQL là `127.0.0.1:3306`. Dùng `HOTEL_DB_HOST`, `HOTEL_DB_PORT` để đổi, và `HOTEL_DB_SSL_CA` để xác thực chứng thư khi kết nối tới MySQL từ xa. Khởi động HTTP API:

   ```powershell
   .\.venv\Scripts\waitress-serve.exe --listen=127.0.0.1:8000 --max-request-body-size=4096 --call hotel_api.app:create_app
   ```

   Khi mở ra ngoài máy, đặt dịch vụ sau reverse proxy HTTPS. Bộ đếm IP mặc định dùng địa chỉ kết nối mà Waitress cung cấp. Nếu đi qua proxy, cấu hình danh sách proxy tin cậy và chuyển đúng địa chỉ client ở tầng WSGI. Nếu chưa cấu hình, các client qua cùng proxy chia sẻ hạn mức IP.

## Tài khoản và dữ liệu mẫu

Dùng **tài khoản triển khai MySQL** trong biến môi trường của một terminal riêng để chạy các lệnh dưới đây. Công cụ hỏi và xác nhận mật khẩu qua terminal. Đặt thông tin kết nối của tài khoản giới hạn `hotel_api` cho tiến trình HTTP.

```powershell
# Chạy sau v2/seed.sql trên database demo mới.
.\.venv\Scripts\python.exe -m hotel_api.manage seed-demo

# Tạo quản trị viên cho môi trường sử dụng thực tế.
.\.venv\Scripts\python.exe -m hotel_api.manage create-staff --role ADMIN --email admin@example.com --name "Quản trị khách sạn"
```

Seed demo tạo `an@example.test`, `admin@hotel.example.test`, `receptionist@hotel.example.test`, `housekeeping@hotel.example.test` và `service_staff@hotel.example.test` với mật khẩu demo do người chạy nhập. Seed gắn tài khoản An với booking `DEMO-STAY`, giao một công việc dọn phòng, gán đơn dịch vụ và thêm đánh giá, thông báo.

Đăng ký công khai với email đã có trong `guests` trả `409` để bảo vệ lịch sử đặt phòng. Sau khi xác minh danh tính khách, tài khoản triển khai có thể tạo và liên kết tài khoản Guest bằng lệnh sau. Ví dụ dùng mã hồ sơ 42.

```powershell
.\.venv\Scripts\python.exe -m hotel_api.manage link-guest --guest-id 42
```

## Endpoint và quyền

| Phương thức và đường dẫn | Quyền và kết quả |
|---|---|
| `POST /api/auth/register` | Công khai. JSON `full_name`, `email`, `password`. Tạo Guest và hồ sơ khách trong cùng giao dịch, trả `201`. |
| `POST /api/auth/login` | Công khai. JSON `email`, `password`. Trả `200` với `access_token`, `token_type` và `expires_in` tính bằng giây. |
| `POST /api/auth/logout` | Tài khoản đã đăng nhập. Thu hồi phiên đang dùng, trả `204`. |
| `GET /api/auth/me` | Tài khoản đã đăng nhập. Trả ID, tên, email và vai trò. |
| `GET /api/guest/bookings` | Guest. Chỉ booking của hồ sơ liên kết. |
| `GET /api/reception/bookings` | Receptionist, Admin. Danh sách booking. |
| `GET /api/housekeeping/tasks` | Housekeeping xem việc được giao. Admin xem toàn bộ. |
| `GET /api/service/orders` | Service Staff xem đơn được giao. Admin xem toàn bộ. |
| `GET /api/notifications` | Mỗi tài khoản xem thông báo của mình. |
| `GET /api/admin/audit` | Admin. Xem nhật ký đăng ký, cấp tài khoản, đăng nhập và đăng xuất. |

Các danh sách trả tối đa 100 dòng mới nhất. Phần API nghiệp vụ ở đây cung cấp các tuyến đọc theo vai trò. Thao tác đặt phòng, nhận/trả phòng và thanh toán tiếp tục qua các procedure được mô tả trong README.

Ví dụ kiểm tra bằng tài khoản vừa seed. Biến `$demoPassword` là mật khẩu demo đã nhập.

```powershell
$base = 'http://127.0.0.1:8000/api'
$body = @{ email = 'an@example.test'; password = $demoPassword } | ConvertTo-Json
$login = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body $body
$headers = @{ Authorization = "Bearer $($login.access_token)" }
Invoke-RestMethod "$base/guest/bookings" -Headers $headers
# Gọi /reception/bookings với cùng header phải trả 403.
Invoke-RestMethod "$base/auth/logout" -Method Post -Headers $headers
# Gọi lại /auth/me với cùng header phải trả 401.
```

## Bảo mật và vận hành

- Argon2id dùng salt riêng cho mỗi tài khoản. Mật khẩu đăng ký dài 15–128 ký tự. API kiểm tra trường, kiểu dữ liệu và độ dài, giới hạn JSON 4 KiB và dùng tham số cho truy vấn SQL. [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- Login trả cùng lỗi `401` cho email không tồn tại, mật khẩu sai và tài khoản bị vô hiệu. Hạn mức MySQL dùng chung giữa các tiến trình API theo cửa sổ 15 phút. Đăng ký tối đa 10 lần/IP. Đăng nhập tối đa 30 lần/IP và 10 lần/email. Quá hạn mức trả `429` kèm `Retry-After`. [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- Bearer token sinh ngẫu nhiên, hết hạn sau 8 giờ. Database chỉ lưu SHA-256 của token. Mỗi request kiểm tra lại trạng thái và vai trò tài khoản. Các phản hồi có `Cache-Control: no-store`. Cấu hình proxy và nhật ký HTTP để giữ header Authorization ngoài log.
- Lập lịch dọn các phiên và bộ đếm cũ với tài khoản bảo trì, chạy theo lô nếu dữ liệu lớn.

```sql
DELETE FROM hotel_guest_service_v2.auth_sessions
WHERE expires_at <= UTC_TIMESTAMP(6);
DELETE FROM hotel_guest_service_v2.auth_rate_limits
WHERE window_start < UNIX_TIMESTAMP() - 86400;
```

## Quan hệ triển khai

- `roles 1–N users`, `users 1–0..1 guests` và `users 1–N auth_sessions/notifications/audit_logs`.
- `guests 1–N bookings`. Mỗi review thuộc một booking và đúng khách của booking theo khóa ngoại ghép.
- `rooms 1–N housekeeping_tasks`. Sự kiện có thể trỏ tới task của chính phòng đó. Các khóa tới nhân viên ghi người được giao, người xác nhận hoặc người thực hiện.
- Một booking có nhiều phân phòng và đêm, đơn dịch vụ và khoản thu. Hóa đơn v2 dùng `booking_id` làm khóa chính. Giá được chốt theo đêm và số dư lấy từ các dòng thu, chi. ERD dùng UUID và một số cột tổng hợp riêng. Triển khai này dùng khóa số và giữ mô hình tổng hợp hiện có của v2.
