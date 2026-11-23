<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingRoom;
use App\Models\Payment;
use App\Models\Service;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ServiceOrderController extends Controller
{
    /**
     * Lấy danh sách đơn dịch vụ (Có thể lọc theo booking_id, booking_room_id, room_id, status).
     */
    public function index(Request $request): JsonResponse
    {
        $query = ServiceOrder::with([
            'items.service',
            'booking.room',
            'bookingRoom.room',
            'room',
            'payments',
        ]);

        if ($request->filled('booking_id')) {
            $query->where('booking_id', $request->query('booking_id'));
        }

        if ($request->filled('booking_room_id')) {
            $query->where('booking_room_id', $request->query('booking_room_id'));
        }

        if ($request->filled('room_id')) {
            $query->where(function ($q) use ($request) {
                $q->where('room_id', $request->query('room_id'))
                  ->orWhereHas('bookingRoom', function ($bq) use ($request) {
                      $bq->where('room_id', $request->query('room_id'));
                  });
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $orders = $query->latest()->get();

        return response()->json([
            'status' => 'success',
            'message' => 'Lấy danh sách đơn dịch vụ thành công.',
            'data' => $orders,
        ]);
    }

    /**
     * Tạo đơn đặt dịch vụ (Room Service Order) gắn với booking_room_id.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'booking_id' => 'required|exists:bookings,id',
            'booking_room_id' => 'nullable|exists:booking_rooms,id',
            'room_id' => 'nullable|exists:rooms,id',
            'items' => 'required|array|min:1',
            'items.*.service_id' => 'required|exists:services,id',
            'items.*.quantity' => 'required|integer|min:1',
            'charge_to_room' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        $booking = Booking::with(['room', 'bookingRooms.room'])->findOrFail($validated['booking_id']);

        if ($booking->status === 'checked_out' || $booking->status === 'cancelled') {
            return response()->json([
                'status' => 'error',
                'message' => 'Phòng này đã trả hoặc đã hủy, không thể đặt thêm dịch vụ.',
            ], 422);
        }

        // Xác định booking_room_id và room_id tương ứng
        $bookingRoomId = null;
        $roomId = null;

        if (!empty($validated['booking_room_id'])) {
            $bookingRoom = BookingRoom::where('booking_id', $booking->id)
                ->findOrFail($validated['booking_room_id']);
            $bookingRoomId = $bookingRoom->id;
            $roomId = $bookingRoom->room_id;
        } elseif (!empty($validated['room_id'])) {
            $roomId = (int) $validated['room_id'];
            $bookingRoom = BookingRoom::where('booking_id', $booking->id)
                ->where('room_id', $roomId)
                ->first();
            $bookingRoomId = $bookingRoom?->id;
        } else {
            if ($booking->bookingRooms->isNotEmpty()) {
                $firstBr = $booking->bookingRooms->first();
                $bookingRoomId = $firstBr->id;
                $roomId = $firstBr->room_id;
            } else {
                $roomId = $booking->room_id;
            }
        }

        $order = DB::transaction(function () use ($request, $validated, $booking, $bookingRoomId, $roomId) {
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            abort_if(in_array($booking->status, ['checked_out', 'cancelled']), 422, 'Đơn đã kết thúc lưu trú.');

            if ($request->is('api/staff/service-orders')) {
                abort_unless($booking->status === 'checked_in', 409, 'Đơn chưa nhận phòng.');

                $selectedRoomId = (int) ($validated['room_id'] ?? 0);
                $bookingRooms = $booking->bookingRooms();
                $hasBookingRooms = $bookingRooms->exists();
                $occupiedRoom = $hasBookingRooms
                    ? $bookingRooms->where('room_id', $selectedRoomId)->where('status', 'occupied')->first()
                    : null;

                abort_unless(
                    $selectedRoomId > 0 && ($hasBookingRooms
                        ? $occupiedRoom !== null
                        : $selectedRoomId === (int) $booking->room_id),
                    422,
                    'Phòng đang ở phải thuộc đơn đặt phòng.'
                );

                $roomId = $selectedRoomId;
                $bookingRoomId = $occupiedRoom?->id;
            }

            $order = ServiceOrder::create([
                'order_code' => 'SO-' . date('Ymd') . '-' . strtoupper(Str::random(5)),
                'booking_id' => $booking->id,
                'booking_room_id' => $bookingRoomId,
                'room_id' => $roomId,
                'total_amount' => 0,
                'status' => 'pending',
                'charge_to_room' => $validated['charge_to_room'] ?? true,
                'is_paid' => false,
                'notes' => $validated['notes'] ?? null,
            ]);

            $total = 0;
            foreach ($validated['items'] as $itemData) {
                $service = Service::findOrFail($itemData['service_id']);
                $quantity = (int) $itemData['quantity'];
                $unitPrice = (float) $service->price;
                $subtotal = round($unitPrice * $quantity, 2);
                $total += $subtotal;

                ServiceOrderItem::create([
                    'service_order_id' => $order->id,
                    'service_id' => $service->id,
                    'quantity' => $quantity,
                    'price_at_order' => $unitPrice,
                    'unit_price' => $unitPrice,
                    'subtotal' => $subtotal,
                    'amount' => $subtotal,
                ]);
            }

            $order->update(['total_amount' => $total]);

            return $order->load(['items.service', 'booking.room', 'bookingRoom.room', 'room']);
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Tạo đơn dịch vụ thành công.',
            'data' => $order,
        ], 201);
    }

    /**
     * Cập nhật trạng thái đơn dịch vụ (vd: pending -> confirmed -> in_progress -> delivered / cancelled).
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|in:pending,confirmed,in_progress,delivered,cancelled',
        ]);

        $order = DB::transaction(function () use ($id, $validated) {
            $order = ServiceOrder::findOrFail($id);
            $booking = Booking::lockForUpdate()->findOrFail($order->booking_id);
            $order->refresh();
            abort_if($order->booking_room_id && $booking->status === 'checked_out', 409, 'Đơn đã hoàn tất checkout.');
            abort_if($order->status === 'delivered' && $validated['status'] === 'cancelled', 422,
                'Đơn dịch vụ đã giao thành công, không thể hủy.');
            $order->update(['status' => $validated['status']]);

            return $order;
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Cập nhật trạng thái đơn dịch vụ thành công.',
            'data' => $order,
        ]);
    }

    /**
     * Thanh toán riêng cho một đơn dịch vụ (khi khách không muốn tính gộp vào hóa đơn phòng).
     */
    public function pay(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => 'required|in:cash,credit_card,bank_transfer,vnpay,momo',
            'transaction_code' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $order = ServiceOrder::findOrFail($id);

        $payment = DB::transaction(function () use ($order, $validated) {
            Booking::lockForUpdate()->findOrFail($order->booking_id);
            $order->refresh();
            abort_if($order->is_paid, 422, 'Đơn dịch vụ này đã được thanh toán trước đó.');
            $order->update([
                'is_paid' => true,
                'charge_to_room' => false, // Đã thanh toán riêng nên tách khỏi hóa đơn phòng
            ]);

            return Payment::create([
                'service_order_id' => $order->id,
                'amount' => $order->total_amount,
                'payment_method' => $validated['payment_method'],
                'transaction_code' => $validated['transaction_code'] ?? null,
                'status' => 'success',
                'notes' => $validated['notes'] ?? 'Thanh toán trực tiếp đơn dịch vụ ' . $order->order_code,
            ]);
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Thanh toán đơn dịch vụ thành công.',
            'data' => [
                'order' => $order,
                'payment' => $payment,
            ],
        ]);
    }
}
