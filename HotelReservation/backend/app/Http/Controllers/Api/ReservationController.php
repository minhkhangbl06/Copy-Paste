<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingRoom;
use App\Models\HousekeepingEvent;
use App\Models\HousekeepingTask;
use App\Models\Room;
use App\Models\RoomNight;
use App\Services\ReservationPricing;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReservationController extends Controller
{
    public function index(Request $request)
    {
        $query = Room::with('roomType');

        if ($request->filled('room_type')) {
            $query->where('room_type', $request->query('room_type'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $rooms = $query->orderBy('room_number', 'asc')->get();

        return response()->json([
            'status'  => 'success',
            'message' => 'Lấy danh sách phòng thành công.',
            'data'    => $rooms
        ], 200);
    }

    public function showRoom($id)
    {
        $room = Room::with('roomType')->find($id);

        if (!$room) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy phòng.'
            ], 404);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Chi tiết phòng.',
            'data'    => $room
        ], 200);
    }

    public function getAvailableRooms(Request $request)
    {
        $request->validate([
            'check_in_date'  => 'required|date|after_or_equal:today',
            'check_out_date' => 'required|date|after:check_in_date',
            'room_type'      => 'nullable|string'
        ]);

        $checkIn = Carbon::parse($request->query('check_in_date'))->toDateString();
        $checkOut = Carbon::parse($request->query('check_out_date'))->toDateString();
        $roomType = $request->query('room_type');

        $busyFromNights = RoomNight::whereIn('status', ['reserved', 'occupied'])
            ->whereDate('stay_date', '>=', $checkIn)
            ->whereDate('stay_date', '<', $checkOut)
            ->whereHas('bookingRoom.booking', function ($q) {
                $q->whereIn('status', ['pending', 'confirmed', 'checked_in']);
            })
            ->pluck('room_id')
            ->toArray();

        $busyFromBookingRooms = BookingRoom::whereIn('status', ['reserved', 'occupied'])
            ->whereDate('check_in_date', '<', $checkOut)
            ->whereDate('check_out_date', '>', $checkIn)
            ->whereHas('booking', function ($q) {
                $q->whereIn('status', ['pending', 'confirmed', 'checked_in']);
            })
            ->pluck('room_id')
            ->toArray();

        $busyLegacy = Booking::whereNotNull('room_id')
            ->overlappingStay($checkIn, $checkOut)
            ->pluck('room_id')
            ->toArray();

        $bookedRoomIds = array_unique(array_merge($busyFromNights, $busyFromBookingRooms, $busyLegacy));

        $availableRooms = Room::whereNotIn('id', $bookedRoomIds)
            ->where('status', '!=', 'maintenance')
            ->when($roomType, function ($q) use ($roomType) {
                $q->where('room_type', $roomType);
            })
            ->orderBy('room_number', 'asc')
            ->get();

        return response()->json([
            'status'  => 'success',
            'message' => 'Tra cứu phòng trống thành công.',
            'data'    => [
                'check_in_date'  => $checkIn,
                'check_out_date' => $checkOut,
                'count'          => $availableRooms->count(),
                'rooms'          => $availableRooms
            ]
        ], 200);
    }

    public function createBooking(Request $request)
    {
        if (!$request->has('room_ids') && $request->filled('room_id')) {
            $request->merge(['room_ids' => [(int) $request->input('room_id')]]);
        }

        $request->validate([
            'guest_name'     => 'required|string|max:255',
            'guest_phone'    => 'required|string|max:20',
            'guest_email'    => 'nullable|email|max:255',
            'notes'          => 'nullable|string',
            'room_ids'       => 'required|array|min:1',
            'room_ids.*'     => 'required|integer|distinct|exists:rooms,id',
            'check_in_date'  => 'required|date|after_or_equal:today',
            'check_out_date' => 'required|date|after:check_in_date',
        ]);

        $checkIn = Carbon::parse($request->input('check_in_date'))->startOfDay();
        $checkOut = Carbon::parse($request->input('check_out_date'))->startOfDay();
        $nights = $checkIn->diffInDays($checkOut);

        if ($nights < 1) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Thời gian lưu trú tối thiểu là 1 đêm.'
            ], 400);
        }

        $roomIds = array_values(array_unique(array_map('intval', $request->input('room_ids'))));
        $user = $request->user('sanctum') ?? $request->user();

        try {
            $booking = DB::transaction(function () use ($request, $roomIds, $checkIn, $checkOut, $user) {
                $rooms = Room::whereKey($roomIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');

                $bookingTotalAmount = 0.0;
                $bookingDepositAmount = 0.0;
                $roomPlans = [];

                foreach ($roomIds as $roomId) {
                    $room = $rooms->get($roomId);
                    if (!$room) {
                        throw new \Exception("Không tìm thấy phòng {$roomId}.");
                    }

                    if ($this->hasRoomConflict($roomId, $checkIn, $checkOut)) {
                        throw new \Exception("Phòng {$room->room_number} đã có người đặt trong khoảng thời gian này.");
                    }

                    if ($room->status === 'maintenance') {
                        throw new \Exception("Phòng " . $room->room_number . " đang bảo trì.");
                    }

                    $nightlyList = ReservationPricing::nightlyRates($checkIn, $checkOut, (float) $room->price_per_night);
                    [$totalRoomAmount, $depositAmount] = ReservationPricing::quote($checkIn, $checkOut, (float) $room->price_per_night);

                    $bookingTotalAmount += $totalRoomAmount;
                    $bookingDepositAmount += $depositAmount;

                    $roomPlans[] = [
                        'room'         => $room,
                        'nightly_list' => $nightlyList,
                        'room_total'   => $totalRoomAmount,
                    ];
                }

                $bookingCode = 'BK-' . now()->format('Ymd') . '-' . strtoupper(substr(uniqid(), -5));

                $booking = Booking::create([
                    'booking_code'      => $bookingCode,
                    'user_id'           => $user?->id,
                    'room_id'           => $roomIds[0],
                    'guest_name'        => $request->input('guest_name'),
                    'guest_phone'       => $request->input('guest_phone'),
                    'guest_email'       => $request->input('guest_email'),
                    'notes'             => $request->input('notes'),
                    'check_in_date'     => $checkIn->toDateString(),
                    'check_out_date'    => $checkOut->toDateString(),
                    'total_room_amount' => round($bookingTotalAmount, 2),
                    'deposit_amount'    => round($bookingDepositAmount, 2),
                    'status'            => 'confirmed',
                ]);

                foreach ($roomPlans as $plan) {
                    $room = $plan['room'];
                    $bookingRoom = BookingRoom::create([
                        'booking_id'        => $booking->id,
                        'room_id'           => $room->id,
                        'check_in_date'     => $checkIn->toDateString(),
                        'check_out_date'    => $checkOut->toDateString(),
                        'price_per_night'   => $room->price_per_night,
                        'total_room_amount' => $plan['room_total'],
                        'status'            => 'reserved',
                    ]);

                    foreach ($plan['nightly_list'] as $night) {
                        RoomNight::create([
                            'booking_room_id' => $bookingRoom->id,
                            'room_id'         => $room->id,
                            'stay_date'       => $night['stay_date'],
                            'rate_applied'    => $night['rate'],
                            'rate'            => $night['rate'],
                            'price'           => $night['rate'],
                            'status'          => 'reserved',
                        ]);
                    }
                }

                return $booking->load(['room', 'bookingRooms.room', 'bookingRooms.roomNights']);
            });

            return response()->json([
                'status'  => 'success',
                'message' => 'Đặt phòng thành công.',
                'data'    => $booking
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage()
            ], 409);
        }
    }

    public function showBooking(Request $request, $id)
    {
        $booking = Booking::with([
            'room',
            'bookingRooms.room',
            'bookingRooms.roomNights',
            'serviceOrders.items.service',
            'invoice.items',
        ])->find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest() && $booking->user_id !== null && $booking->user_id !== $user->id) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Truy cập bị từ chối: Bạn không có quyền xem đơn đặt phòng này.'
            ], 403);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Chi tiết đơn đặt phòng.',
            'data'    => $booking
        ], 200);
    }

    public function updateBooking(Request $request, $id)
    {
        $booking = Booking::with('bookingRooms')->find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest() && $booking->user_id !== null && $booking->user_id !== $user->id) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Truy cập bị từ chối: Bạn không có quyền chỉnh sửa đơn đặt phòng này.'
            ], 403);
        }

        if (in_array($booking->status, ['checked_in', 'checked_out', 'cancelled'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không thể sửa đơn ở trạng thái ' . $booking->status
            ], 400);
        }

        $request->validate([
            'room_id'        => 'nullable|integer|exists:rooms,id',
            'room_ids'       => 'nullable|array|min:1',
            'room_ids.*'     => 'required|integer|distinct|exists:rooms,id',
            'check_in_date'  => 'nullable|date',
            'check_out_date' => 'nullable|date',
            'guest_name'     => 'nullable|string|max:255',
            'guest_phone'    => 'nullable|string|max:20',
            'guest_email'    => 'nullable|email|max:255',
            'notes'          => 'nullable|string',
        ]);

        if ($request->has('room_ids')) {
            $roomIds = array_values(array_unique(array_map('intval', $request->input('room_ids'))));
        } elseif ($request->filled('room_id')) {
            $roomIds = [(int) $request->input('room_id')];
        } elseif ($booking->bookingRooms->isNotEmpty()) {
            $roomIds = $booking->bookingRooms->pluck('room_id')->map(fn ($v) => (int) $v)->all();
        } else {
            $roomIds = [(int) $booking->room_id];
        }

        $checkIn = Carbon::parse($request->input('check_in_date') ?? $booking->check_in_date)->startOfDay();
        $checkOut = Carbon::parse($request->input('check_out_date') ?? $booking->check_out_date)->startOfDay();
        if ($checkIn->gte($checkOut)) {
            throw ValidationException::withMessages([
                'check_out_date' => 'Ngày trả phòng phải sau ngày nhận phòng.',
            ]);
        }

        try {
            $updated = DB::transaction(function () use ($request, $booking, $roomIds, $checkIn, $checkOut) {
                $rooms = Room::whereKey($roomIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');

                $bookingTotalAmount = 0.0;
                $bookingDepositAmount = 0.0;
                $roomPlans = [];

                foreach ($roomIds as $roomId) {
                    $room = $rooms->get($roomId);
                    if (!$room || $room->status === 'maintenance') {
                        throw new \Exception('Phòng được chọn không khả dụng hoặc đang bảo trì.');
                    }

                    if ($this->hasRoomConflict($roomId, $checkIn, $checkOut, $booking->id)) {
                        throw new \Exception('Phòng đã có người đặt trong thời gian sửa đổi này.');
                    }

                    $nightlyList = ReservationPricing::nightlyRates($checkIn, $checkOut, (float) $room->price_per_night);
                    [$totalRoomAmount, $depositAmount] = ReservationPricing::quote($checkIn, $checkOut, (float) $room->price_per_night);

                    $bookingTotalAmount += $totalRoomAmount;
                    $bookingDepositAmount += $depositAmount;

                    $roomPlans[] = [
                        'room'         => $room,
                        'nightly_list' => $nightlyList,
                        'room_total'   => $totalRoomAmount,
                    ];
                }

                RoomNight::whereHas('bookingRoom', function ($q) use ($booking) {
                    $q->where('booking_id', $booking->id);
                })->delete();
                BookingRoom::where('booking_id', $booking->id)->delete();

                $booking->update([
                    'room_id'           => $roomIds[0],
                    'guest_name'        => $request->input('guest_name', $booking->guest_name),
                    'guest_phone'       => $request->input('guest_phone', $booking->guest_phone),
                    'guest_email'       => $request->input('guest_email', $booking->guest_email),
                    'notes'             => $request->input('notes', $booking->notes),
                    'check_in_date'     => $checkIn->toDateString(),
                    'check_out_date'    => $checkOut->toDateString(),
                    'total_room_amount' => round($bookingTotalAmount, 2),
                    'deposit_amount'    => round($bookingDepositAmount, 2),
                ]);

                foreach ($roomPlans as $plan) {
                    $room = $plan['room'];
                    $bookingRoom = BookingRoom::create([
                        'booking_id'        => $booking->id,
                        'room_id'           => $room->id,
                        'check_in_date'     => $checkIn->toDateString(),
                        'check_out_date'    => $checkOut->toDateString(),
                        'price_per_night'   => $room->price_per_night,
                        'total_room_amount' => $plan['room_total'],
                        'status'            => 'reserved',
                    ]);

                    foreach ($plan['nightly_list'] as $night) {
                        RoomNight::create([
                            'booking_room_id' => $bookingRoom->id,
                            'room_id'         => $room->id,
                            'stay_date'       => $night['stay_date'],
                            'rate_applied'    => $night['rate'],
                            'rate'            => $night['rate'],
                            'price'           => $night['rate'],
                            'status'          => 'reserved',
                        ]);
                    }
                }

                return $booking->fresh(['room', 'bookingRooms.room', 'bookingRooms.roomNights']);
            });

            return response()->json([
                'status'  => 'success',
                'message' => 'Cập nhật đơn đặt phòng thành công.',
                'data'    => $updated
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage()
            ], 409);
        }
    }

    public function cancelBooking(Request $request, $id)
    {
        $booking = Booking::find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest() && $booking->user_id !== null && $booking->user_id !== $user->id) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Truy cập bị từ chối: Bạn không có quyền hủy đơn đặt phòng này.'
            ], 403);
        }

        if (in_array($booking->status, ['checked_out', 'cancelled'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Đơn đặt phòng này không thể hủy.'
            ], 400);
        }

        $checkInDateTime = Carbon::parse($booking->check_in_date->format('Y-m-d') . ' 14:00:00');
        $now = now();
        $diffHours = $now->diffInHours($checkInDateTime, false);

        $refundRate = ReservationPricing::refundRate($diffHours);

        $depositAmount = (float) $booking->deposit_amount;
        $refundAmount = $depositAmount * $refundRate;

        DB::transaction(function () use ($booking) {
            $booking->status = 'cancelled';
            $booking->save();

            BookingRoom::where('booking_id', $booking->id)
                ->update(['status' => 'cancelled']);

            RoomNight::whereHas('bookingRoom', function ($q) use ($booking) {
                $q->where('booking_id', $booking->id);
            })->delete();
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Hủy đặt phòng thành công.',
            'data'    => [
                'booking_id'      => $booking->id,
                'booking_code'    => $booking->booking_code,
                'status'          => $booking->status,
                'hours_remaining' => round($diffHours, 1),
                'refund_rate'     => ($refundRate * 100) . '%',
                'deposit_paid'    => $depositAmount,
                'refund_amount'   => $refundAmount
            ]
        ], 200);
    }

    public function indexBookings(Request $request)
    {
        $query = Booking::with(['room', 'bookingRooms.room']);

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest()) {
            $query->where('user_id', $user->id);
        }

        if ($request->filled('status') && $request->query('status') !== 'all') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('check_in_date')) {
            $query->whereDate('check_in_date', '>=', $request->query('check_in_date'));
        }

        if ($request->filled('search')) {
            $search = trim($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->where('booking_code', 'like', "%{$search}%")
                  ->orWhere('guest_name', 'like', "%{$search}%")
                  ->orWhere('guest_phone', 'like', "%{$search}%")
                  ->orWhereHas('room', function ($rq) use ($search) {
                      $rq->where('room_number', 'like', "%{$search}%");
                  })
                  ->orWhereHas('bookingRooms.room', function ($rq) use ($search) {
                      $rq->where('room_number', 'like', "%{$search}%");
                  });
            });
        }

        $bookings = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'status'  => 'success',
            'message' => 'Lấy danh sách đặt phòng thành công.',
            'data'    => $bookings
        ], 200);
    }

    public function checkIn(Request $request, $id)
    {
        $booking = Booking::with(['room', 'bookingRooms.room'])->find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        if ($booking->status === 'checked_in') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Đơn đặt phòng này đã hoàn tất check-in trước đó.'
            ], 400);
        }

        if (in_array($booking->status, ['checked_out', 'cancelled'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không thể check-in cho đơn ở trạng thái ' . $booking->status . '.'
            ], 400);
        }

        $targetRooms = $booking->bookingRooms->isNotEmpty()
            ? $booking->bookingRooms->pluck('room')->filter()
            : collect([$booking->room])->filter();

        foreach ($targetRooms as $room) {
            if ($room->status === 'maintenance') {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Phòng ' . $room->room_number . ' đang bảo trì, không thể check-in.'
                ], 400);
            }
        }

        DB::transaction(function () use ($booking, $targetRooms) {
            $booking->update(['status' => 'checked_in']);

            if ($booking->bookingRooms->isNotEmpty()) {
                BookingRoom::where('booking_id', $booking->id)
                    ->where('status', '!=', 'cancelled')
                    ->update(['status' => 'occupied']);

                RoomNight::whereHas('bookingRoom', function ($q) use ($booking) {
                    $q->where('booking_id', $booking->id);
                })->update(['status' => 'occupied']);
            }

            foreach ($targetRooms as $room) {
                $room->update(['status' => 'occupied']);
            }
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Check-in thành công cho khách ' . $booking->guest_name . '.',
            'data'    => $booking->fresh(['room', 'bookingRooms.room'])
        ], 200);
    }

    public function checkOut(Request $request, $id)
    {
        $booking = Booking::with(['room', 'bookingRooms.room'])->find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        if ($booking->status !== 'checked_in') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Chỉ có thể check-out cho đơn đang ở trạng thái checked_in.'
            ], 400);
        }

        $checkoutTime = $request->filled('actual_checkout_at') 
            ? Carbon::parse($request->input('actual_checkout_at')) 
            : now();

        $user = $request->user('sanctum') ?? $request->user();
        $targetRooms = $booking->bookingRooms->isNotEmpty()
            ? $booking->bookingRooms->pluck('room')->filter()
            : collect([$booking->room])->filter();

        DB::transaction(function () use ($booking, $targetRooms, $checkoutTime, $user) {
            $booking->update([
                'status'             => 'checked_out',
                'actual_checkout_at' => $checkoutTime,
            ]);

            if ($booking->bookingRooms->isNotEmpty()) {
                BookingRoom::where('booking_id', $booking->id)
                    ->where('status', '!=', 'cancelled')
                    ->update(['status' => 'checked_out']);

                RoomNight::whereHas('bookingRoom', function ($q) use ($booking) {
                    $q->where('booking_id', $booking->id);
                })->update(['status' => 'released']);
            }

            foreach ($targetRooms as $room) {
                $room->update(['status' => 'dirty']);

                $task = HousekeepingTask::create([
                    'room_id'      => $room->id,
                    'booking_id'   => $booking->id,
                    'task_type'    => 'checkout_clean',
                    'status'       => 'pending',
                    'notes'        => 'Dọn phòng sau khi khách ' . $booking->guest_name . ' check-out.',
                    'scheduled_at' => now(),
                ]);

                HousekeepingEvent::create([
                    'task_id'     => $task->id,
                    'actor_id'    => $user?->id,
                    'event_type'  => 'task_created',
                    'from_status' => null,
                    'to_status'   => 'pending',
                    'note'        => 'Khởi tạo công việc dọn dẹp phòng ' . $room->room_number . ' tự động sau khi check-out.',
                ]);
            }
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Check-out thành công cho đơn ' . $booking->booking_code . '.',
            'data'    => $booking->fresh(['room', 'bookingRooms.room'])
        ], 200);
    }

    private function hasRoomConflict(int $roomId, Carbon $checkIn, Carbon $checkOut, ?int $excludeBookingId = null): bool
    {
        $inStr = $checkIn->toDateString();
        $outStr = $checkOut->toDateString();

        $nightConflict = RoomNight::where('room_id', $roomId)
            ->whereIn('status', ['reserved', 'occupied'])
            ->whereDate('stay_date', '>=', $inStr)
            ->whereDate('stay_date', '<', $outStr)
            ->whereHas('bookingRoom.booking', function ($q) use ($excludeBookingId) {
                $q->whereIn('status', ['pending', 'confirmed', 'checked_in']);
                if ($excludeBookingId !== null) {
                    $q->where('id', '!=', $excludeBookingId);
                }
            })
            ->exists();

        if ($nightConflict) {
            return true;
        }

        $brConflict = BookingRoom::where('room_id', $roomId)
            ->whereIn('status', ['reserved', 'occupied'])
            ->whereDate('check_in_date', '<', $outStr)
            ->whereDate('check_out_date', '>', $inStr)
            ->whereHas('booking', function ($q) use ($excludeBookingId) {
                $q->whereIn('status', ['pending', 'confirmed', 'checked_in']);
                if ($excludeBookingId !== null) {
                    $q->where('id', '!=', $excludeBookingId);
                }
            })
            ->exists();

        if ($brConflict) {
            return true;
        }

        return Booking::where('room_id', $roomId)
            ->when($excludeBookingId !== null, fn ($q) => $q->where('id', '!=', $excludeBookingId))
            ->overlappingStay($inStr, $outStr)
            ->exists();
    }
}