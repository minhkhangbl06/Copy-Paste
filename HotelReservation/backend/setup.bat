@echo off
chcp 65001 > nul
echo ========================================================
echo 🏨 HOTEL RESERVATION - TỰ ĐỘNG THIẾT LẬP DỰ ÁN
echo ========================================================

cd /d "%~dp0"

echo.
echo [1/5] Tạo file cấu hình môi trường .env...
if not exist .env (
    copy .env.example .env > nul
    echo  -> Đã tạo .env thành công.
) else (
    echo  -> File .env đã tồn tại, bỏ qua.
)

echo.
echo [2/5] Cài đặt thư viện dependencies (composer install)...
call composer install --no-interaction
if %ERRORLEVEL% NEQ 0 (
    echo [LỖI] Chưa cài Composer hoặc lệnh composer gặp lỗi!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/5] Tạo App Key cho Laravel...
call php artisan key:generate --force

echo.
echo [4/5] Khởi tạo cơ sở dữ liệu SQLite...
if not exist database\database.sqlite (
    type nul > database\database.sqlite
    echo  -> Đã tạo file database\database.sqlite.
)

echo.
echo [5/5] Thực thi Migration và Seed dữ liệu mẫu...
call php artisan migrate:fresh --seed --force

echo.
echo ========================================================
echo 🎉 THIẾT LẬP HOÀN TẤT!
echo 👉 Để bật server, bạn chỉ cần gõ:
echo    php artisan serve
echo 👉 Hoặc truy cập API: http://127.0.0.1:8000/api/services
echo ========================================================
echo.
pause
