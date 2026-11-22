<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ReservationController;
use App\Http\Controllers\Api\RoomStatusController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceOrderController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])
         ->middleware('throttle:10,15');
    Route::post('/login', [AuthController::class, 'login'])
         ->middleware('throttle:20,15');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

// Module Quản lý Dịch vụ (Services)
Route::prefix('services')->group(function (): void {
    Route::get('/', [ServiceController::class, 'index']);
    Route::get('/{id}', [ServiceController::class, 'show']);
    Route::post('/', [ServiceController::class, 'store'])
         ->middleware('role:admin');
});

// Module Đơn dịch vụ (Service Orders)
Route::prefix('service-orders')->group(function (): void {
    Route::get('/', [ServiceOrderController::class, 'index'])
         ->middleware('role:service_staff,receptionist,admin,manager');
    Route::post('/', [ServiceOrderController::class, 'store'])
         ->middleware('role:guest,receptionist,admin,manager');
    Route::patch('/{id}/status', [ServiceOrderController::class, 'updateStatus'])
         ->middleware('role:service_staff,receptionist,admin,manager');
    Route::post('/{id}/pay', [ServiceOrderController::class, 'pay'])
         ->middleware('role:billing,receptionist,admin,manager');
});

// Module Bảng kê, Phụ thu trả phòng muộn & Hóa đơn theo Booking
Route::prefix('bookings/{booking_id}')->group(function (): void {
    Route::get('/invoice/preview', [InvoiceController::class, 'preview'])
         ->middleware('role:guest,receptionist,billing,admin,manager');
    Route::post('/late-checkout', [InvoiceController::class, 'calculateLateCheckout'])
         ->middleware('role:billing,receptionist,admin,manager');
    Route::post('/invoice', [InvoiceController::class, 'generate'])
         ->middleware('role:billing,receptionist,admin,manager');
});

// Module Quản lý Hóa đơn & Thanh toán (Invoices & Billing)
Route::prefix('invoices')->group(function (): void {
    Route::get('/', [InvoiceController::class, 'index'])
         ->middleware('role:guest,billing,receptionist,admin,manager');
    Route::get('/{id}', [InvoiceController::class, 'show'])
         ->middleware('role:guest,billing,receptionist,admin,manager');
    Route::post('/{id}/pay', [InvoiceController::class, 'recordPayment'])
         ->middleware('role:billing,receptionist,admin,manager');
    Route::post('/{id}/close', [InvoiceController::class, 'closeInvoice'])
         ->middleware('role:billing,admin,manager');
});

// Module Phòng & Trạng thái phòng (Rooms & Housekeeping)
Route::prefix('rooms')->group(function (): void {
    Route::get('/', [ReservationController::class, 'index']);
    Route::get('/available', [ReservationController::class, 'getAvailableRooms']);
    Route::get('/{id}', [ReservationController::class, 'showRoom']);
    Route::patch('/{id}/status', [RoomStatusController::class, 'update'])
         ->middleware('role:housekeeping,admin,manager');
});

// Module Đặt phòng (Bookings, Check-in, Check-out & Hủy hoàn cọc BR-06)
Route::prefix('bookings')->group(function (): void {
    Route::get('/', [ReservationController::class, 'indexBookings'])
         ->middleware('role:guest,receptionist,admin,billing,manager');
    Route::post('/', [ReservationController::class, 'createBooking'])
         ->middleware('role:guest,receptionist,admin,billing,manager');
    Route::get('/{id}', [ReservationController::class, 'showBooking'])
         ->middleware('role:guest,receptionist,admin,billing,manager');
    Route::patch('/{id}', [ReservationController::class, 'updateBooking'])
         ->middleware('role:guest,receptionist,admin,billing,manager');
    Route::post('/{id}/cancel', [ReservationController::class, 'cancelBooking'])
         ->middleware('role:guest,receptionist,admin,billing,manager');
    Route::post('/{id}/check-in', [ReservationController::class, 'checkIn'])
         ->middleware('role:receptionist,admin,manager');
    Route::post('/{id}/check-out', [ReservationController::class, 'checkOut'])
         ->middleware('role:receptionist,admin,manager');
});
