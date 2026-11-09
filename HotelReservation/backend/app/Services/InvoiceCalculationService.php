<?php

namespace App\Services;

use App\Models\Booking;
use Carbon\Carbon;

class InvoiceCalculationService
{
    public function __construct(
        protected LateCheckoutService $lateCheckoutService
    ) {}

    /**
     * Tổng hợp và tính toán chi tiết toàn bộ hóa đơn cho booking.
     */
    public function calculateBookingCharges(
        Booking $booking, 
        ?Carbon $checkoutTime = null, 
        float $otherSurcharges = 0.0,
        float $taxRate = 0.08 // Thuế VAT mặc định 8%
    ): array {
        // 1. Tiền phòng
        $roomCharges = (float) $booking->total_room_amount;

        // 2. Tiền dịch vụ phòng ghi nợ chưa trả (charge_to_room = true && is_paid = false && status != cancelled)
        $unpaidServiceOrders = $booking->serviceOrders()
            ->where('charge_to_room', true)
            ->where('is_paid', false)
            ->where('status', '!=', 'cancelled')
            ->with('items.service')
            ->get();

        $serviceCharges = (float) $unpaidServiceOrders->sum('total_amount');

        // 3. Phụ thu trả phòng muộn
        $lateCheck = $this->lateCheckoutService->calculate($booking, $checkoutTime);
        $lateCheckoutFee = (float) $lateCheck['late_fee'];

        // 4. Tiền cọc đã cọc trước
        $depositDeducted = (float) $booking->deposit_amount;

        // 5. Tạm tính trước thuế
        $subtotal = $roomCharges + $serviceCharges + $lateCheckoutFee + $otherSurcharges;

        // 6. Tiền thuế VAT
        $taxAmount = round(max(0, $subtotal - $depositDeducted) * $taxRate, 2);

        // 7. Tổng cộng phải trả cuối cùng
        $totalAmount = max(0.0, round(($subtotal - $depositDeducted) + $taxAmount, 2));

        return [
            'booking_id' => $booking->id,
            'booking_code' => $booking->booking_code,
            'guest_name' => $booking->guest_name,
            'room' => $booking->room ? [
                'id' => $booking->room->id,
                'room_number' => $booking->room->room_number,
                'room_type' => $booking->room->room_type,
            ] : null,
            'charges' => [
                'room_charges' => $roomCharges,
                'service_charges' => $serviceCharges,
                'late_checkout_fee' => $lateCheckoutFee,
                'other_surcharges' => $otherSurcharges,
                'deposit_deducted' => $depositDeducted,
                'subtotal' => $subtotal,
                'tax_rate' => $taxRate,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
            ],
            'late_checkout_detail' => $lateCheck,
            'unpaid_service_orders' => $unpaidServiceOrders,
        ];
    }
}
