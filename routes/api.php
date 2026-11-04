<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ReservationController;

/*
|--------------------------------------------------------------------------
| API Routes - Module Reservation (Phụ trách: Trịnh Thị Tiểu Muội)
|--------------------------------------------------------------------------
*/

Route::prefix('rooms')->group(function () {
    Route::get('/', [ReservationController::class, 'index']); // Danh sách tất cả phòng & lọc
    Route::get('/available', [ReservationController::class, 'getAvailableRooms']); // Tra cứu phòng trống
    Route::get('/{id}', [ReservationController::class, 'showRoom']); // Xem chi tiết phòng
});

Route::prefix('bookings')->group(function () {
    Route::post('/', [ReservationController::class, 'createBooking']); // Đặt phòng (chống double-booking)
    Route::get('/{id}', [ReservationController::class, 'showBooking']); // Chi tiết booking
    Route::patch('/{id}', [ReservationController::class, 'updateBooking']); // Sửa booking / đổi ngày
    Route::post('/{id}/cancel', [ReservationController::class, 'cancelBooking']); // Hủy booking & hoàn cọc
});
