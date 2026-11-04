<?php

namespace App\Services;

use App\Models\Booking;
use Carbon\Carbon;

class LateCheckoutService
{
    /**
     * Tính phụ thu trả phòng muộn cho một Booking.
     * Quy tắc chuẩn:
     * - Giờ checkout quy định: 12:00 trưa ngày check_out_date.
     * - Ân hạn (Grace period): 30 phút (trước 12:30 không tính phí).
     * - 12:30 -> 15:00: Phụ thu 30% giá phòng 1 đêm.
     * - 15:00 -> 18:00: Phụ thu 50% giá phòng 1 đêm.
     * - Sau 18:00: Phụ thu 100% giá phòng 1 đêm (thêm 1 đêm).
     */
    public function calculate(Booking $booking, ?Carbon $actualCheckoutTime = null): array
    {
        $actualCheckoutTime = $actualCheckoutTime ?? now();
        $standardCheckout = Carbon::parse($booking->check_out_date)->setTime(12, 0, 0);

        // Lấy giá phòng 1 đêm (nếu có room relation hoặc tính từ total_room_amount)
        $nightlyPrice = $booking->room?->price_per_night 
            ?? ($booking->total_room_amount > 0 ? $booking->total_room_amount : 500000);

        if ($actualCheckoutTime->lte($standardCheckout->copy()->addMinutes(30))) {
            return [
                'is_late' => false,
                'minutes_late' => max(0, $actualCheckoutTime->diffInMinutes($standardCheckout, false)),
                'fee_rate' => 0,
                'late_fee' => 0.0,
                'note' => 'Trả phòng đúng giờ hoặc trong thời gian ân hạn 30 phút.',
            ];
        }

        $checkoutHour = $actualCheckoutTime->hour + ($actualCheckoutTime->minute / 60);
        $minutesLate = (int) $standardCheckout->diffInMinutes($actualCheckoutTime);

        if ($checkoutHour <= 15.0) {
            $rate = 0.30;
            $fee = round($nightlyPrice * $rate, 2);
            $note = 'Trả phòng từ 12:30 - 15:00: Phụ thu 30% tiền phòng 1 đêm.';
        } elseif ($checkoutHour <= 18.0) {
            $rate = 0.50;
            $fee = round($nightlyPrice * $rate, 2);
            $note = 'Trả phòng từ 15:00 - 18:00: Phụ thu 50% tiền phòng 1 đêm.';
        } else {
            $rate = 1.00;
            $fee = round($nightlyPrice * $rate, 2);
            $note = 'Trả phòng sau 18:00: Phụ thu 100% tiền phòng 1 đêm.';
        }

        return [
            'is_late' => true,
            'minutes_late' => $minutesLate,
            'fee_rate' => $rate,
            'nightly_price' => $nightlyPrice,
            'late_fee' => $fee,
            'note' => $note,
        ];
    }
}
