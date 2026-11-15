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
});

// Tra cứu phòng & dịch vụ 
Route::get('/rooms', [ReservationController::class, 'index']);
Route::get('/rooms/available', [ReservationController::class, 'availableRooms']);
Route::get('/services', [ServiceController::class, 'index']);
Route::get('/services/{id}', [ServiceController::class, 'show']);

Route::middleware('auth:sanctum')->group(function (): void {

    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    // ĐẶT PHÒNG (GUEST, RECEPTIONIST, ADMIN)
    Route::middleware('role:guest,receptionist,admin,billing')->group(function (): void {
        Route::post('/bookings', [ReservationController::class, 'store']);
        Route::patch('/bookings/{id}', [ReservationController::class, 'update']);
        Route::post('/bookings/{id}/cancel', [ReservationController::class, 'cancel']);
    });

    // DỌN PHÒNG & BẢO TRÌ (HOUSEKEEPING, ADMIN)
    Route::patch('/rooms/{id}/status', [RoomStatusController::class, 'update'])
         ->middleware('role:housekeeping,admin');

    // DỊCH VỤ PHÒNG
    Route::post('/service-orders', [ServiceOrderController::class, 'store'])
         ->middleware('role:guest,receptionist,admin');

    Route::middleware('role:service_staff,receptionist,admin')->group(function (): void {
        Route::get('/service-orders', [ServiceOrderController::class, 'index']);
        Route::patch('/service-orders/{id}/status', [ServiceOrderController::class, 'updateStatus']);
    });

    Route::post('/services', [ServiceController::class, 'store'])
         ->middleware('role:admin');

    // HÓA ĐƠN & THANH TOÁN (BILLING, RECEPTIONIST, ADMIN)
    Route::middleware('role:billing,receptionist,admin')->group(function (): void {
        Route::post('/service-orders/{id}/pay', [ServiceOrderController::class, 'pay']);
        Route::get('/bookings/{booking_id}/invoice/preview', [InvoiceController::class, 'preview']);
        Route::post('/bookings/{booking_id}/late-checkout', [InvoiceController::class, 'calculateLateCheckout']);
        Route::post('/bookings/{booking_id}/invoice', [InvoiceController::class, 'generate']);
        Route::post('/invoices/{id}/pay', [InvoiceController::class, 'recordPayment']);
        Route::post('/invoices/{id}/close', [InvoiceController::class, 'closeInvoice']);
    });
});
