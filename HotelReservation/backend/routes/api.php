<?php
use App\Http\Controllers\Api\ReservationController;

use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceOrderController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - Hotel Reservation System
|--------------------------------------------------------------------------
| Module nhiệm vụ của Khang: Dịch vụ phòng, Đơn dịch vụ, Hóa đơn, Thanh toán,
| Phụ thu trả phòng muộn và Đóng hóa đơn checkout.
*/

// 1. Module Quản lý Dịch vụ (Services)
Route::prefix('services')->group(function () {
    Route::get('/', [ServiceController::class, 'index']);
    Route::get('/{id}', [ServiceController::class, 'show']);
    Route::post('/', [ServiceController::class, 'store']);
});

// 2. Module Đơn dịch vụ (Service Orders)
Route::prefix('service-orders')->group(function () {
    Route::get('/', [ServiceOrderController::class, 'index']);
    Route::post('/', [ServiceOrderController::class, 'store']);
    Route::patch('/{id}/status', [ServiceOrderController::class, 'updateStatus']);
    Route::post('/{id}/pay', [ServiceOrderController::class, 'pay']);
});

// 3. Module Hóa đơn & Trả phòng (Invoices, Late Checkout & Checkout)
Route::prefix('bookings/{booking_id}')->group(function () {
    Route::get('/invoice/preview', [InvoiceController::class, 'preview']);
    Route::post('/late-checkout', [InvoiceController::class, 'calculateLateCheckout']);
    Route::post('/invoice', [InvoiceController::class, 'generate']);
});

Route::prefix('invoices')->group(function () {
    Route::post('/{id}/pay', [InvoiceController::class, 'recordPayment']);
    Route::post('/{id}/close', [InvoiceController::class, 'closeInvoice']);
});

// --- Reservation Module (Trịnh Thị Tiểu Muội) ---
Route::get('/rooms', [ReservationController::class, 'index']);
Route::get('/rooms/available', [ReservationController::class, 'availableRooms']);
Route::post('/bookings', [ReservationController::class, 'store']);
Route::patch('/bookings/{id}', [ReservationController::class, 'update']);
Route::post('/bookings/{id}/cancel', [ReservationController::class, 'cancel']);

// --- Module 4: Phân hệ Đặt phòng (Trịnh Thị Tiểu Muội) ---
Route::prefix('rooms')->group(function () {
    Route::get('/', [ReservationController::class, 'index']);
    Route::get('/available', [ReservationController::class, 'availableRooms']);
});

Route::prefix('bookings')->group(function () {
    Route::post('/', [ReservationController::class, 'store']);
    Route::patch('/{id}', [ReservationController::class, 'update']);
    Route::post('/{id}/cancel', [ReservationController::class, 'cancel']);
});
