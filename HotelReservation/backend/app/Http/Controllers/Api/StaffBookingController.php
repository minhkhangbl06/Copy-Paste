<?php

namespace App\Http\Controllers\Api;

use App\Models\Booking;
use App\Models\Invoice;
use App\Models\Room;
use App\Services\ReservationPricing;
use App\Services\InvoiceCalculationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StaffBookingController
{
    public function index(Request $request): JsonResponse
    {
        $query = Booking::with(['room', 'bookingRooms.room'])->latest('id');
        if ($request->filled('search')) {
            $search = '%'.trim($request->query('search')).'%';
            $query->where(fn ($match) => $match
                ->where('booking_code', 'like', $search)
                ->orWhere('guest_name', 'like', $search)
                ->orWhere('guest_phone', 'like', $search)
                ->orWhereHas('room', fn ($room) => $room->where('room_number', 'like', $search))
                ->orWhereHas('bookingRooms.room', fn ($room) => $room->where('room_number', 'like', $search)));
        }
        if ($request->filled('status') && $request->query('status') !== 'all') {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('check_in_date')) {
            $query->whereDate('check_in_date', '>=', $request->query('check_in_date'));
        }

        return $this->success($query->get());
    }

    public function show(int $id): JsonResponse
    {
        return $this->success(Booking::with(['room', 'bookingRooms.room'])->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'guest_name' => 'required|string|max:255',
            'guest_phone' => 'required|string|max:20',
            'room_ids' => 'required|array|min:1',
            'room_ids.*' => 'required|integer|distinct|exists:rooms,id',
            'check_in_date' => 'required|date|after_or_equal:today',
            'check_out_date' => 'required|date|after:check_in_date',
        ]);

        $booking = DB::transaction(function () use ($data) {
            $rooms = Room::whereKey($data['room_ids'])->orderBy('id')->lockForUpdate()->get();
            abort_unless($rooms->count() === count($data['room_ids']), 409, 'Danh sách phòng đã thay đổi.');
            $start = Carbon::parse($data['check_in_date'])->startOfDay();
            $end = Carbon::parse($data['check_out_date'])->startOfDay();
            $total = $deposit = 0;
            $bookingRooms = [];
            foreach ($rooms as $room) {
                $reserved = Booking::forRoom($room->id)
                    ->overlappingStay($start->toDateString(), $end->toDateString())->lockForUpdate()->exists();
                abort_if($reserved || $room->status === 'maintenance', 409, "Phòng {$room->room_number} không thể đặt.");
                [$price, $requiredDeposit] = ReservationPricing::quote($start, $end, (float) $room->price_per_night);
                $bookingRooms[] = [
                    'room_id' => $room->id,
                    'check_in_date' => $start->toDateString(),
                    'check_out_date' => $end->toDateString(),
                    'price_per_night' => $room->price_per_night,
                    'total_room_amount' => $price,
                    'status' => 'reserved',
                ];
                $total += $price;
                $deposit += $requiredDeposit;
            }

            $booking = Booking::create([
                'guest_name' => $data['guest_name'],
                'guest_phone' => $data['guest_phone'],
                'check_in_date' => $start->toDateString(),
                'check_out_date' => $end->toDateString(),
                'booking_code' => 'BK-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)),
                'room_id' => null,
                'total_room_amount' => $total,
                'deposit_amount' => $deposit,
                'status' => 'confirmed',
            ]);
            $booking->bookingRooms()->createMany($bookingRooms);

            return $booking->load(['room', 'bookingRooms.room']);
        });

        return $this->success($booking, 201);
    }

    public function confirmDeposit(int $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $booking = Booking::lockForUpdate()->findOrFail($id);
            abort_unless(in_array($booking->status, ['pending', 'confirmed']) && $booking->deposit_amount > 0,
                409, 'Đơn này không thể xác nhận thu cọc.');
            if (!$booking->deposit_received_at) {
                $booking->forceFill(['deposit_received_at' => now()->startOfSecond()])->save();
            }

            return $this->success($booking->load(['room', 'bookingRooms.room']));
        });
    }

    public function checkIn(int $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $booking = Booking::lockForUpdate()->findOrFail($id);
            abort_unless(in_array($booking->status, ['pending', 'confirmed']), 409, 'Đơn này không thể nhận phòng.');
            abort_if($booking->deposit_amount > 0 && !$booking->deposit_received_at, 409, 'Hãy xác nhận thu cọc trước.');

            $links = $booking->bookingRooms()->lockForUpdate()->get();
            abort_if($links->contains(fn ($link) => $link->status !== 'reserved'), 409, 'Trạng thái phòng trong đơn đã thay đổi.');
            $ids = $links->isEmpty() ? array_filter([$booking->room_id]) : $links->pluck('room_id')->all();
            $rooms = Room::whereKey($ids)->orderBy('id')->lockForUpdate()->get();
            abort_if(!$ids || $rooms->count() !== count($ids) || $rooms->contains(fn ($room) => $room->status !== 'available'),
                409, 'Tất cả phòng phải sẵn sàng trước khi nhận phòng.');

            Room::whereKey($ids)->update(['status' => 'occupied']);
            $booking->bookingRooms()->update(['status' => 'occupied']);
            $booking->roomNights()->get()->each->update(['status' => 'occupied']);
            $booking->update(['status' => 'checked_in']);

            return $this->success($booking->load(['room', 'bookingRooms.room']));
        });
    }

    public function preview(int $id, InvoiceCalculationService $calculator): JsonResponse
    {
        $booking = Booking::with(['room', 'bookingRooms.room', 'invoice.payments'])->findOrFail($id);
        abort_unless($booking->status === 'checked_in', 409, 'Đơn chưa nhận phòng.');
        $time = $booking->actual_checkout_at ?? now();

        return $this->success($this->checkoutCharges($booking, $time, $calculator));
    }

    public function checkout(Request $request, int $id, InvoiceCalculationService $calculator): JsonResponse
    {
        $data = $request->validate([
            'amount' => 'required|numeric|min:0|decimal:0,2',
            'payment_method' => 'required|in:cash,credit_card,bank_transfer,vnpay,momo',
        ]);

        return DB::transaction(function () use ($request, $id, $data, $calculator) {
            $booking = Booking::lockForUpdate()->findOrFail($id);
            $invoice = $booking->invoice()->lockForUpdate()->first();
            if ($booking->status === 'checked_out' && $invoice?->status === 'paid') {
                return $this->success($invoice->load('payments'));
            }
            abort_unless($booking->status === 'checked_in', 409, 'Đơn chưa nhận phòng.');
            $rooms = $this->roomsForUpdate($booking);
            abort_if($rooms->isEmpty() || $rooms->contains(fn ($room) => $room->status !== 'occupied'), 409,
                'Trạng thái phòng đã thay đổi.');
            $booking->setRelation('invoice', $invoice);
            $time = $booking->actual_checkout_at ?? now();
            $charges = $this->checkoutCharges($booking, $time, $calculator);
            abort_if(abs($charges['remaining'] - (float) $data['amount']) >= 0.005, 409,
                'Số tiền đã thay đổi. Hãy mở lại hóa đơn để kiểm tra.');

            if (!$invoice) {
                $invoice = new Invoice(collect($charges)->only([
                    'room_charges', 'service_charges', 'late_checkout_fee', 'other_surcharges',
                    'deposit_deducted', 'tax_amount', 'total_amount',
                ])->all());
                $invoice->fill([
                    'booking_id' => $booking->id,
                    'invoice_code' => 'INV-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)),
                    'issued_at' => now(),
                ]);
                $invoice->save();
            }
            if ($charges['remaining'] > 0) {
                $invoice->payments()->create([
                    'amount' => $charges['remaining'],
                    'payment_method' => $data['payment_method'],
                    'status' => 'success',
                ]);
            }
            $invoice->update(['status' => 'paid', 'paid_at' => $invoice->paid_at ?? now(), 'closed_at' => now()]);
            $booking->serviceOrders()->where('charge_to_room', true)->where('status', '!=', 'cancelled')->update(['is_paid' => true]);
            $booking->update(['status' => 'checked_out', 'actual_checkout_at' => $time]);
            $booking->bookingRooms()->update(['status' => 'checked_out']);
            $booking->roomNights()->get()->each->update(['status' => 'released']);

            foreach ($rooms as $room) {
                $room->update(['status' => 'dirty']);
                $task = $booking->housekeepingTasks()->create([
                    'room_id' => $room->id,
                    'task_type' => 'checkout_clean',
                    'status' => 'pending',
                    'scheduled_at' => now(),
                ]);
                $task->events()->create([
                    'actor_id' => $request->user()->id,
                    'event_type' => 'task_created',
                    'to_status' => 'pending',
                ]);
            }

            return $this->success($invoice->load('payments'));
        });
    }

    private function checkoutCharges(Booking $booking, Carbon $time, InvoiceCalculationService $calculator): array
    {
        if ($booking->invoice) {
            abort_if($booking->invoice->status === 'cancelled', 409, 'Hóa đơn đã bị hủy.');
            $charges = $booking->invoice->only([
                'room_charges', 'service_charges', 'late_checkout_fee', 'other_surcharges',
                'deposit_deducted', 'tax_amount', 'total_amount',
            ]);
            $paid = $booking->invoice->payments()->where('status', 'success')->sum('amount');
        } else {
            $charges = $calculator->calculateBookingCharges(
                $booking,
                $time,
                requireConfirmedDeposit: true
            )['charges'];
            $paid = 0;
        }
        $charges['remaining'] = max(0, round((float) $charges['total_amount'] - $paid, 2));

        return $charges;
    }

    private function roomsForUpdate(Booking $booking)
    {
        $ids = $booking->bookingRooms()->pluck('room_id')->all();
        if (!$ids && $booking->room_id) {
            $ids = [$booking->room_id];
        }

        return Room::whereKey($ids)->orderBy('id')->lockForUpdate()->get();
    }

    private function success(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['status' => 'success', 'data' => $data], $status);
    }
}
