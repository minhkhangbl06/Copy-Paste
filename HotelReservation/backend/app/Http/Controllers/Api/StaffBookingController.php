<?php

namespace App\Http\Controllers\Api;

use App\Models\Booking;
use App\Models\Room;
use App\Services\ReservationPricing;
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

    private function success(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['status' => 'success', 'data' => $data], $status);
    }
}
