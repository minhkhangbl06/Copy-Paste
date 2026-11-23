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
     * Hỗ trợ cả multi-room (booking_rooms + room_nights) và single-room.
     */
    public function calculateBookingCharges(
        Booking $booking, 
        ?Carbon $checkoutTime = null, 
        float $otherSurcharges = 0.0,
        float $taxRate = 0.08,
        bool $requireConfirmedDeposit = false // Thuế VAT mặc định 8%
    ): array {
        $invoiceItems = [];

        // 1. Tiền phòng & danh sách chi tiết các đêm (room_nights)
        $roomCharges = 0.0;
        $hasBookingRooms = false;

        if ($booking->relationLoaded('bookingRooms')) {
            $hasBookingRooms = $booking->bookingRooms->isNotEmpty();
        } elseif ($booking->exists && method_exists($booking, 'bookingRooms')) {
            try {
                $hasBookingRooms = $booking->bookingRooms()->exists();
            } catch (\Throwable) {
                $hasBookingRooms = false;
            }
        }

        if ($hasBookingRooms) {
            $bookingRooms = $booking->relationLoaded('bookingRooms') 
                ? $booking->bookingRooms 
                : $booking->bookingRooms()->with(['room', 'roomNights'])->get();

            foreach ($bookingRooms as $br) {
                $roomNumber = $br->room?->room_number ?? 'Phòng ' . $br->room_id;
                $hasNights = false;

                if ($br->relationLoaded('roomNights')) {
                    $hasNights = $br->roomNights->isNotEmpty();
                } elseif ($br->exists && method_exists($br, 'roomNights')) {
                    try {
                        $hasNights = $br->roomNights()->exists();
                    } catch (\Throwable) {
                        $hasNights = false;
                    }
                }

                if ($hasNights) {
                    $nights = $br->relationLoaded('roomNights') ? $br->roomNights : $br->roomNights()->get();
                    foreach ($nights as $rn) {
                        $price = (float) ($rn->price ?? $rn->rate);
                        $roomCharges += $price;

                        $stayDate = Carbon::parse($rn->stay_date)->format('d/m/Y');
                        $invoiceItems[] = [
                            'item_type'       => 'room_night',
                            'booking_room_id' => $br->id,
                            'room_id'         => $br->room_id,
                            'description'     => "Tiền phòng: Phòng {$roomNumber} - Đêm {$stayDate}",
                            'quantity'        => 1,
                            'unit_price'      => $price,
                            'amount'          => $price,
                        ];
                    }
                } else {
                    // Tự sinh các đêm nếu chưa có dòng room_nights chi tiết
                    $in = Carbon::parse($br->check_in_date);
                    $out = Carbon::parse($br->check_out_date);
                    $pricePerNight = (float) $br->price_per_night;
                    [$quotedTotal] = ReservationPricing::quote($in, $out, $pricePerNight);
                    $usesQuotedPricing = abs($quotedTotal - (float) $br->total_room_amount) < 0.005;

                    for ($d = $in->copy(); $d->lt($out); $d->addDay()) {
                        $price = $usesQuotedPricing
                            ? ReservationPricing::quote($d, $d->copy()->addDay(), $pricePerNight)[0]
                            : $pricePerNight;

                        $roomCharges += $price;
                        $invoiceItems[] = [
                            'item_type'       => 'room_night',
                            'booking_room_id' => $br->id,
                            'room_id'         => $br->room_id,
                            'description'     => "Tiền phòng: Phòng {$roomNumber} - Đêm " . $d->format('d/m/Y'),
                            'quantity'        => 1,
                            'unit_price'      => $price,
                            'amount'          => $price,
                        ];
                    }
                }
            }
        }

        // Nếu không có booking_rooms hoặc chưa có tổng tiền từ booking_rooms, dùng total_room_amount của booking
        if ($roomCharges <= 0) {
            $roomCharges = (float) $booking->total_room_amount;

            if ($booking->room && $booking->check_in_date && $booking->check_out_date) {
                $in = Carbon::parse($booking->check_in_date);
                $out = Carbon::parse($booking->check_out_date);
                $nightsCount = max(1, $in->diffInDays($out));
                $nightlyPrice = (float) ($booking->room->price_per_night ?? ($roomCharges / $nightsCount));

                for ($d = $in->copy(); $d->lt($out); $d->addDay()) {
                    $invoiceItems[] = [
                        'item_type'       => 'room_night',
                        'booking_room_id' => null,
                        'room_id'         => $booking->room_id,
                        'description'     => "Tiền phòng: Phòng {$booking->room->room_number} - Đêm " . $d->format('d/m/Y'),
                        'quantity'        => 1,
                        'unit_price'      => $nightlyPrice,
                        'amount'          => $nightlyPrice,
                    ];
                }
            }
        }

        // 2. Tiền dịch vụ phòng ghi nợ chưa trả (charge_to_room = true && is_paid = false && status != cancelled)
        $unpaidServiceOrders = $booking->serviceOrders()
            ->where('charge_to_room', true)
            ->where('is_paid', false)
            ->where('status', '!=', 'cancelled')
            ->with('items.service')
            ->get();

        $serviceCharges = 0.0;

        foreach ($unpaidServiceOrders as $order) {
            $isObj = is_object($order);
            $orderTotal = $isObj ? (float) $order->total_amount : (float) ($order['total_amount'] ?? 0);
            $serviceCharges += $orderTotal;

            $bookingRoomId = $isObj ? ($order->booking_room_id ?? null) : ($order['booking_room_id'] ?? null);
            $orderRoomId = $isObj ? ($order->room_id ?? null) : ($order['room_id'] ?? null);
            $orderCode = $isObj ? ($order->order_code ?? '') : ($order['order_code'] ?? '');

            $roomNum = 'Chung';
            if ($isObj && $bookingRoomId && method_exists($order, 'bookingRoom') && $order->bookingRoom?->room) {
                $roomNum = $order->bookingRoom->room->room_number;
            } elseif ($isObj && $order->room) {
                $roomNum = $order->room->room_number;
            } elseif ($booking->room) {
                $roomNum = $booking->room->room_number;
            }

            $items = $isObj ? ($order->items ?? []) : ($order['items'] ?? []);
            foreach ($items as $item) {
                $isItemObj = is_object($item);
                $serviceName = $isItemObj ? ($item->service?->name ?? 'Dịch vụ phòng') : ($item['service']['name'] ?? 'Dịch vụ phòng');
                $qty = (int) ($isItemObj ? $item->quantity : ($item['quantity'] ?? 1));
                $unitPrice = (float) ($isItemObj 
                    ? ($item->unit_price ?: ($item->price_at_order ?: 0)) 
                    : ($item['unit_price'] ?? ($item['price_at_order'] ?? 0)));
                $amt = (float) ($isItemObj 
                    ? ($item->amount ?: ($item->subtotal ?: ($qty * $unitPrice))) 
                    : ($item['amount'] ?? ($item['subtotal'] ?? ($qty * $unitPrice))));

                $invoiceItems[] = [
                    'item_type'       => 'service',
                    'booking_room_id' => $bookingRoomId,
                    'room_id'         => $orderRoomId,
                    'description'     => "Dịch vụ: {$serviceName} (Phòng {$roomNum})" . ($orderCode ? " - {$orderCode}" : ""),
                    'quantity'        => $qty,
                    'unit_price'      => $unitPrice,
                    'amount'          => $amt,
                ];
            }
        }

        // 3. Phụ thu trả phòng muộn
        $lateCheck = $this->lateCheckoutService->calculate($booking, $checkoutTime);
        $lateCheckoutFee = (float) $lateCheck['late_fee'];

        if ($lateCheckoutFee > 0) {
            $note = $lateCheck['note'] ?? 'Trả phòng muộn';
            $invoiceItems[] = [
                'item_type'       => 'late_checkout',
                'booking_room_id' => null,
                'room_id'         => $booking->room_id,
                'description'     => "Phụ thu trả phòng muộn ({$note})",
                'quantity'        => 1,
                'unit_price'      => $lateCheckoutFee,
                'amount'          => $lateCheckoutFee,
            ];
        }

        // 4. Phụ thu phát sinh khác
        if ($otherSurcharges > 0) {
            $invoiceItems[] = [
                'item_type'       => 'surcharge',
                'booking_room_id' => null,
                'room_id'         => null,
                'description'     => 'Phụ thu phát sinh',
                'quantity'        => 1,
                'unit_price'      => $otherSurcharges,
                'amount'          => $otherSurcharges,
            ];
        }

        // 5. Chiết khấu / Giảm giá (nếu có)
        $discount = (float) ($booking->discount_amount ?? 0);
        if ($discount > 0) {
            $invoiceItems[] = [
                'item_type'       => 'discount',
                'booking_room_id' => null,
                'room_id'         => null,
                'description'     => 'Giảm giá / Ưu đãi booking',
                'quantity'        => 1,
                'unit_price'      => -$discount,
                'amount'          => -$discount,
            ];
        }

        // 6. Tiền cọc đã cọc trước
        $depositDeducted = $requireConfirmedDeposit && $hasBookingRooms && !$booking->deposit_received_at
            ? 0.0
            : (float) $booking->deposit_amount;

        // 7. Tạm tính trước thuế
        $subtotal = $roomCharges + $serviceCharges + $lateCheckoutFee + $otherSurcharges - $discount;

        // 8. Tiền thuế VAT
        $taxAmount = round(max(0, $subtotal - $depositDeducted) * $taxRate, 2);

        // 9. Tổng cộng phải thanh toán cuối cùng
        $totalAmount = max(0.0, round(($subtotal - $depositDeducted) + $taxAmount, 2));

        return [
            'booking_id'   => $booking->id,
            'booking_code' => $booking->booking_code,
            'guest_name'   => $booking->guest_name,
            'room'         => $booking->room ? [
                'id'          => $booking->room->id,
                'room_number' => $booking->room->room_number,
                'room_type'   => $booking->room->room_type,
            ] : null,
            'charges'      => [
                'room_charges'      => $roomCharges,
                'service_charges'   => $serviceCharges,
                'late_checkout_fee' => $lateCheckoutFee,
                'other_surcharges'  => $otherSurcharges,
                'discount'          => $discount,
                'deposit_deducted'  => $depositDeducted,
                'subtotal'          => $subtotal,
                'tax_rate'          => $taxRate,
                'tax_amount'        => $taxAmount,
                'total_amount'      => $totalAmount,
            ],
            'late_checkout_detail' => $lateCheck,
            'unpaid_service_orders' => $unpaidServiceOrders,
            'invoice_items'        => $invoiceItems,
        ];
    }
}
