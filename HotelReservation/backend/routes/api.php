<?php

use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ReservationController;
use App\Http\Controllers\Api\RoomStatusController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceOrderController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - Hotel Reservation System
|--------------------------------------------------------------------------
*/

// =========================================================================
// 1. Phân hệ của Khang: Dịch vụ phòng, Đơn dịch vụ, Hóa đơn & Thanh toán
// =========================================================================

// Module Quản lý Dịch vụ (Services)
Route::prefix('services')->group(function () {
    Route::get('/', [ServiceController::class, 'index']);
    Route::get('/{id}', [ServiceController::class, 'show']);
    Route::post('/', [ServiceController::class, 'store']);
});

// Module Đơn dịch vụ (Service Orders)
Route::prefix('service-orders')->group(function () {
    Route::get('/', [ServiceOrderController::class, 'index']);
    Route::post('/', [ServiceOrderController::class, 'store']);
    Route::patch('/{id}/status', [ServiceOrderController::class, 'updateStatus']);
    Route::post('/{id}/pay', [ServiceOrderController::class, 'pay']);
});

// Module Bảng kê, Phụ thu trả phòng muộn & Hóa đơn theo Booking
Route::prefix('bookings/{booking_id}')->group(function () {
    Route::get('/invoice/preview', [InvoiceController::class, 'preview']);
    Route::post('/late-checkout', [InvoiceController::class, 'calculateLateCheckout']);
    Route::post('/invoice', [InvoiceController::class, 'generate']);
});

// Module Quản lý Hóa đơn & Thanh toán (Invoices & Billing)
Route::prefix('invoices')->group(function () {
    Route::get('/', [InvoiceController::class, 'index']);
    Route::get('/{id}', [InvoiceController::class, 'show']);
    Route::post('/{id}/pay', [InvoiceController::class, 'recordPayment']);
    Route::post('/{id}/close', [InvoiceController::class, 'closeInvoice']);
});

// =========================================================================
// 2. Phân hệ của Trịnh Thị Tiểu Muội: Quản lý Phòng & Đặt phòng (Reservation)
// =========================================================================

// Module Phòng & Trạng thái phòng (Rooms & Housekeeping)
Route::prefix('rooms')->group(function () {
    Route::get('/', [ReservationController::class, 'index']);
    Route::get('/available', [ReservationController::class, 'getAvailableRooms']);
    Route::get('/{id}', [ReservationController::class, 'showRoom']);
    Route::patch('/{id}/status', [RoomStatusController::class, 'update']);
});

// Module Đặt phòng (Bookings, Check-in, Check-out & Hủy hoàn cọc BR-06)
Route::prefix('bookings')->group(function () {
    Route::get('/', [ReservationController::class, 'indexBookings']);
    Route::post('/', [ReservationController::class, 'createBooking']);
    Route::get('/{id}', [ReservationController::class, 'showBooking']);
    Route::patch('/{id}', [ReservationController::class, 'updateBooking']);
    Route::post('/{id}/cancel', [ReservationController::class, 'cancelBooking']);
    Route::post('/{id}/check-in', [ReservationController::class, 'checkIn']);
    Route::post('/{id}/check-out', [ReservationController::class, 'checkOut']);
});

