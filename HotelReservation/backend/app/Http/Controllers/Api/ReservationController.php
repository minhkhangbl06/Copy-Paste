<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Room;
use App\Models\Booking;
use Carbon\Carbon;

class ReservationController extends Controller
{
    /**
     * GET /api/rooms
     * Lấy danh sách toàn bộ phòng (hỗ trợ lọc ?room_type=...&status=...)
     */
    public function index(Request $request)
    {
        $query = Room::query();

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

    /**
     * GET /api/rooms/{id}
     * Xem thông tin chi tiết của 1 phòng
     */
    public function showRoom($id)
    {
        $room = Room::find($id);

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

    /**
     * GET /api/rooms/available
     * Tra cứu phòng trống theo khoảng thời gian check_in_date và check_out_date
     * Quy tắc Overlapping: (check_in < existing_check_out AND check_out > existing_check_in)
     */
    public function getAvailableRooms(Request $request)
    {
        $request->validate([
            'check_in_date'  => 'required|date|after_or_equal:today',
            'check_out_date' => 'required|date|after:check_in_date',
            'room_type'      => 'nullable|string'
        ]);

        $checkIn = $request->query('check_in_date');
        $checkOut = $request->query('check_out_date');
        $roomType = $request->query('room_type');

        // Lấy danh sách ID phòng đã có booking trùng lịch
        $bookedRoomIds = Booking::whereIn('status', ['pending', 'confirmed', 'checked_in'])
            ->where(function ($q) use ($checkIn, $checkOut) {
                $q->where('check_in_date', '<', $checkOut)
                  ->where('check_out_date', '>', $checkIn);
            })
            ->pluck('room_id')
            ->toArray();

        // Lọc các phòng không bận và không bảo trì
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

    /**
     * POST /api/bookings
     * Đặt phòng (hỗ trợ single-room & multi-room, multi-night).
     * Áp dụng Transaction + Pessimistic Lock (lockForUpdate) chống Double-Booking tuyệt đối.
     * Tự động cộng phụ thu cuối tuần (+15% Thứ 6, Thứ 7) và tính tiền cọc theo BR-04/BR-05.
     */
    public function createBooking(Request $request)
    {
        $request->validate([
            'guest_name'     => 'required|string|max:255',
            'guest_phone'    => 'required|string|max:20',
            'room_ids'       => 'required|array|min:1',
            'room_ids.*'     => 'required|integer|exists:rooms,id',
            'check_in_date'  => 'required|date|after_or_equal:today',
            'check_out_date' => 'required|date|after:check_in_date',
        ]);

        $checkIn = Carbon::parse($request->input('check_in_date'));
        $checkOut = Carbon::parse($request->input('check_out_date'));
        $nights = $checkIn->diffInDays($checkOut);

        if ($nights < 1) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Thời gian lưu trú tối thiểu là 1 đêm.'
            ], 400);
        }

        $roomIds = $request->input('room_ids');

        try {
            $createdBookings = DB::transaction(function () use ($request, $roomIds, $checkIn, $checkOut, $nights) {
                $results = [];

                foreach ($roomIds as $roomId) {
                    // 1. Khóa và kiểm tra giao thoa lịch đặt phòng (Pessimistic Locking)
                    $conflict = Booking::where('room_id', $roomId)
                        ->whereIn('status', ['pending', 'confirmed', 'checked_in'])
                        ->where('check_in_date', '<', $checkOut->toDateString())
                        ->where('check_out_date', '>', $checkIn->toDateString())
                        ->lockForUpdate()
                        ->exists();

                    if ($conflict) {
                        $room = Room::find($roomId);
                        throw new \Exception("Phòng " . ($room ? $room->room_number : $roomId) . " đã có người đặt trong khoảng thời gian này.");
                    }

                    $room = Room::findOrFail($roomId);
                    if ($room->status === 'maintenance') {
                        throw new \Exception("Phòng " . $room->room_number . " đang bảo trì.");
                    }

                    $basePrice = (float) $room->price_per_night;

                    // 2. Tính tiền theo từng đêm: Thứ 6, Thứ 7 phụ thu +15%
                    $totalRoomAmount = 0;
                    $tempDate = $checkIn->copy();
                    for ($i = 0; $i < $nights; $i++) {
                        $nightRate = ($tempDate->isFriday() || $tempDate->isSaturday()) ? $basePrice * 1.15 : $basePrice;
                        $totalRoomAmount += $nightRate;
                        $tempDate->addDay();
                    }

                    // 3. Tính tiền đặt cọc: >= 2 đêm cọc max(30% tổng tiền, 1 đêm đầu)
                    $depositAmount = 0;
                    if ($nights >= 2) {
                        $depositAmount = max($totalRoomAmount * 0.3, $basePrice);
                    }

                    $bookingCode = 'BK-' . now()->format('Ymd') . '-' . strtoupper(substr(uniqid(), -5));

                    $booking = Booking::create([
                        'booking_code'      => $bookingCode,
                        'room_id'           => $roomId,
                        'guest_name'        => $request->input('guest_name'),
                        'guest_phone'       => $request->input('guest_phone'),
                        'check_in_date'     => $checkIn->toDateString(),
                        'check_out_date'    => $checkOut->toDateString(),
                        'total_room_amount' => $totalRoomAmount,
                        'deposit_amount'    => $depositAmount,
                        'status'            => 'confirmed',
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

    /**
     * GET /api/bookings/{id}
     * Xem thông tin chi tiết một booking kèm thông tin phòng
     */
    public function showBooking($id)
    {
        $booking = Booking::with('room')->find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Chi tiết đơn đặt phòng.',
            'data'    => $booking
        ], 200);
    }

    /**
     * PATCH /api/bookings/{id}
     * Chỉnh sửa booking (đổi ngày hoặc đổi phòng) kèm kiểm tra xung đột trùng lịch
     */
    public function updateBooking(Request $request, $id)
    {
        $booking = Booking::find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
        }

        if (in_array($booking->status, ['checked_in', 'checked_out', 'cancelled'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không thể sửa đơn ở trạng thái ' . $booking->status
            ], 400);
        }

        $request->validate([
            'room_id'        => 'nullable|integer|exists:rooms,id',
            'check_in_date'  => 'nullable|date',
            'check_out_date' => 'nullable|date|after:check_in_date',
            'guest_name'     => 'nullable|string|max:255',
            'guest_phone'    => 'nullable|string|max:20',
        ]);

        $roomId = $request->input('room_id', $booking->room_id);
        $checkIn = Carbon::parse($request->input('check_in_date', $booking->check_in_date));
        $checkOut = Carbon::parse($request->input('check_out_date', $booking->check_out_date));

        // Kiểm tra xem phòng mới / ngày mới có bị trùng lịch với booking khác không
        $conflict = Booking::where('room_id', $roomId)
            ->where('id', '!=', $booking->id)
            ->whereIn('status', ['pending', 'confirmed', 'checked_in'])
            ->where('check_in_date', '<', $checkOut->toDateString())
            ->where('check_out_date', '>', $checkIn->toDateString())
            ->exists();

        if ($conflict) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Phòng đã có người đặt trong thời gian sửa đổi này.'
            ], 409);
        }

        $nights = $checkIn->diffInDays($checkOut);
        $room = Room::findOrFail($roomId);
        $basePrice = (float) $room->price_per_night;

        $totalRoomAmount = 0;
        $tempDate = $checkIn->copy();
        for ($i = 0; $i < $nights; $i++) {
            $nightRate = ($tempDate->isFriday() || $tempDate->isSaturday()) ? $basePrice * 1.15 : $basePrice;
            $totalRoomAmount += $nightRate;
            $tempDate->addDay();
        }

        $depositAmount = $nights >= 2 ? max($totalRoomAmount * 0.3, $basePrice) : 0;

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

    /**
     * POST /api/bookings/{id}/cancel
     * Hủy booking và tính tiền hoàn cọc theo chính sách BR-06:
     * - Trước >= 48h: hoàn 100% cọc
     * - Từ 24h - 48h: hoàn 50% cọc
     * - Dưới 24h / No-show: không hoàn cọc
     */
    public function cancelBooking($id)
    {
        $booking = Booking::find($id);

        if (!$booking) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy đơn đặt phòng.'
            ], 404);
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

        $refundRate = 0.0;
        if ($diffHours >= 48) {
            $refundRate = 1.0;
        } elseif ($diffHours >= 24) {
            $refundRate = 0.5;
        }

        $depositAmount = (float) $booking->deposit_amount;
        $refundAmount = $depositAmount * $refundRate;

        $booking->status = 'cancelled';
        $booking->save();

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
}
