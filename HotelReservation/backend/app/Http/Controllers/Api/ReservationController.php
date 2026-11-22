<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\HousekeepingEvent;
use App\Models\HousekeepingTask;
use App\Models\Room;
use App\Models\RoomNight;
use App\Services\ReservationPricing;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

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

        $bookedRoomIds = Booking::whereNotNull('room_id')
            ->overlappingStay($checkIn, $checkOut)
            ->pluck('room_id')
            ->toArray();

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
        $request->validate([
            'guest_name' => 'required|string|max:255',
            'guest_phone' => 'required|string|max:20',
            'room_ids' => 'required|array|min:1',
            'room_ids.*' => 'required|integer|distinct|exists:rooms,id',
            'check_in_date' => 'required|date|after_or_equal:today',
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

        $roomIds = $request->input('room_ids');
        $user = $request->user('sanctum') ?? $request->user();

        try {
            $createdBookings = DB::transaction(function () use ($request, $roomIds, $checkIn, $checkOut) {
                $results = [];
                $rooms = Room::whereKey($roomIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');

                foreach ($roomIds as $roomId) {
                    $room = $rooms->get($roomId);
                    if (!$room) {
                        throw new \Exception("Không tìm thấy phòng {$roomId}.");
                    }

                    $conflict = Booking::where('room_id', $roomId)
                        ->overlappingStay($checkIn->toDateString(), $checkOut->toDateString())
                        ->lockForUpdate()
                        ->exists();

                    if ($conflict) {
                        throw new \Exception("Phòng {$room->room_number} đã có người đặt trong khoảng thời gian này.");
                    }

                    if ($room->status === 'maintenance') {
                        throw new \Exception("Phòng " . $room->room_number . " đang bảo trì.");
                    }

                    [$totalRoomAmount, $depositAmount] = ReservationPricing::quote($checkIn, $checkOut, (float) $room->price_per_night);

                    $bookingCode = 'BK-' . now()->format('Ymd') . '-' . strtoupper(substr(uniqid(), -5));

                    $booking = Booking::create([
                        'booking_code' => $bookingCode,
                        'user_id' => $user?->id,
                        'room_id' => $roomId,
                        'guest_name' => $request->input('guest_name'),
                        'guest_phone' => $request->input('guest_phone'),
                        'check_in_date' => $checkIn->toDateString(),
                        'check_out_date' => $checkOut->toDateString(),
                        'total_room_amount' => $totalRoomAmount,
                        'deposit_amount' => $depositAmount,
                        'status' => 'confirmed',
                    ]);

                    $results[] = $booking;
                }

                return $results;
            });

            return response()->json([
                'status'  => 'success',
                'message' => 'Đặt phòng thành công.',
                'data'    => $createdBookings
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
        $booking = Booking::with(['room', 'bookingRooms.room', 'invoice'])->find($id);

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
            'room_id' => 'nullable|integer|exists:rooms,id',
            'check_in_date' => 'nullable|date',
            'check_out_date' => 'nullable|date|after:check_in_date',
            'guest_name' => 'nullable|string|max:255',
            'guest_phone' => 'nullable|string|max:20',
        ]);

        $roomId = $request->input('room_id', $booking->room_id);
        $checkIn = Carbon::parse($request->input('check_in_date') ?? $booking->check_in_date)->startOfDay();
        $checkOut = Carbon::parse($request->input('check_out_date') ?? $booking->check_out_date)->startOfDay();
        if ($checkIn->gte($checkOut)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'check_out_date' => 'Ngày trả phòng phải sau ngày nhận phòng.',
            ]);
        }

        $conflict = Booking::where('room_id', $roomId)
            ->where('id', '!=', $booking->id)
            ->overlappingStay($checkIn->toDateString(), $checkOut->toDateString())
            ->exists();

        if ($conflict) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Phòng đã có người đặt trong thời gian sửa đổi này.'
            ], 409);
        }

        $room = Room::findOrFail($roomId);
        [$totalRoomAmount, $depositAmount] = ReservationPricing::quote($checkIn, $checkOut, (float) $room->price_per_night);

        $booking->update([
            'room_id'           => $roomId,
            'guest_name'        => $request->input('guest_name', $booking->guest_name),
            'guest_phone'       => $request->input('guest_phone', $booking->guest_phone),
            'check_in_date'     => $checkIn->toDateString(),
            'check_out_date'    => $checkOut->toDateString(),
            'total_room_amount' => $totalRoomAmount,
            'deposit_amount'    => $depositAmount,
        ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'Cập nhật đơn đặt phòng thành công.',
            'data'    => $booking
        ], 200);
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
        $query = Booking::with('room');

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
        $booking = Booking::with('room')->find($id);

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

        $room = $booking->room;
        if ($room && $room->status === 'maintenance') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Phòng ' . $room->room_number . ' đang bảo trì, không thể check-in.'
            ], 400);
        }

        DB::transaction(function () use ($booking, $room) {
            $booking->update(['status' => 'checked_in']);
            if ($room) {
                $room->update(['status' => 'occupied']);
            }
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Check-in thành công cho khách ' . $booking->guest_name . '.',
            'data'    => $booking->fresh(['room'])
        ], 200);
    }

    public function checkOut(Request $request, $id)
    {
        $booking = Booking::with('room')->find($id);

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

        $room = $booking->room;
        $user = $request->user('sanctum') ?? $request->user();

        DB::transaction(function () use ($booking, $room, $checkoutTime, $user) {
            $booking->update([
                'status'             => 'checked_out',
                'actual_checkout_at' => $checkoutTime,
            ]);

            if ($room) {
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
            'data'    => $booking->fresh(['room'])
        ], 200);
    }
}
