# 🏨 Hotel Reservation System - Full Backend Module
**Sinh viên:** Trịnh Thị Tiểu Muội (MSSV: 52400290)  
**Môn học:** Công nghệ phần mềm - Đại học Tôn Đức Thắng (TDTU)  
**Đề tài 14:** Hospitality Industry - Hotel Management Platform  
**Công nghệ:** PHP 8.2+ / Laravel 12  

---

## 📂 Danh mục cấu trúc thư mục trọn vẹn
```text
.
├── app/
│   ├── Http/Controllers/
│   │   └── ReservationController.php   # Toàn bộ logic API đặt phòng & hủy cọc
│   └── Models/
│       ├── Room.php                    # Model Room
│       └── Booking.php                 # Model Booking
├── bootstrap/
│   └── app.php                         # Khởi động ứng dụng Laravel 12
├── database/
│   ├── migrations/
│   │   ├── 2026_11_04_000001_create_rooms_table.php
│   │   └── 2026_11_04_000002_create_bookings_table.php
│   └── seeders/
│       └── DatabaseSeeder.php          # Seeder 30 phòng mẫu chuẩn
├── routes/
│   ├── api.php                         # Khai báo tất cả routes RESTful API
│   └── console.php                     # Khai báo console commands
├── tests/
│   ├── TestCase.php                    # Base test case
│   └── Feature/
│       └── ReservationModuleTest.php   # Bộ Test tự động hoàn chỉnh
├── PROJECT_CONTEXT.md                  # Tài liệu kiến trúc & nhật ký dự án
├── composer.json                       # Cấu hình dependency PHP
└── .env.example                        # Mẫu file môi trường
```

## 🚀 Hướng dẫn khởi chạy từ đầu (Zero to Hero)

1. **Cài đặt thư viện:**
   ```bash
   composer install
   ```

2. **Cấu hình môi trường:**
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```

3. **Tạo Database và nạp 30 phòng mẫu:**
   ```bash
   touch database/database.sqlite
   php artisan migrate:fresh --seed
   ```

4. **Khởi động máy chủ:**
   ```bash
   php artisan serve
   ```
   Hệ thống sẽ chạy tại: `http://localhost:8000`.

5. **Chạy toàn bộ Feature Test tự động:**
   ```bash
   php artisan test
   ```
