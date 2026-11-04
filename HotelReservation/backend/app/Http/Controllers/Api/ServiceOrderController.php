<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
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
     * Lấy danh sách đơn dịch vụ (Có thể lọc theo booking_id, room_id, status).
     */
    public function index(Request $request): JsonResponse
    {
        $query = ServiceOrder::with(['items.service', 'booking.room', 'payments']);

        if ($request->filled('booking_id')) {
            $query->where('booking_id', $request->query('booking_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $orders = $query->latest()->get();

        return response()->json([
            'status' => 'success',
            'data' => $orders,
        ]);
    }

    /**
     * Tạo đơn đặt dịch vụ (Room Service Order).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'booking_id' => 'required|exists:bookings,id',
            'items' => 'required|array|min:1',
            'items.*.service_id' => 'required|exists:services,id',
            'items.*.quantity' => 'required|integer|min:1',
            'charge_to_room' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        $booking = Booking::with('room')->findOrFail($validated['booking_id']);

        if ($booking->status === 'checked_out' || $booking->status === 'cancelled') {
            return response()->json([
                'status' => 'error',
                'message' => 'Phòng này đã trả hoặc đã hủy, không thể đặt thêm dịch vụ.',
            ], 422);
        }

        $order = DB::transaction(function () use ($validated, $booking) {
            $order = ServiceOrder::create([
                'order_code' => 'SO-' . date('Ymd') . '-' . strtoupper(Str::random(5)),
                'booking_id' => $booking->id,
                'room_id' => $booking->room_id,
                'total_amount' => 0,
                'status' => 'pending',
                'charge_to_room' => $validated['charge_to_room'] ?? true,
                'is_paid' => false,
                'notes' => $validated['notes'] ?? null,
            ]);

            $total = 0;
            foreach ($validated['items'] as $itemData) {
                $service = Service::findOrFail($itemData['service_id']);
                $subtotal = $service->price * $itemData['quantity'];
                $total += $subtotal;

                ServiceOrderItem::create([
                    'service_order_id' => $order->id,
                    'service_id' => $service->id,
                    'quantity' => $itemData['quantity'],
                    'price_at_order' => $service->price,
                    'subtotal' => $subtotal,
                ]);
            }

            $order->update(['total_amount' => $total]);

            return $order->load(['items.service', 'booking.room']);
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

        $order = ServiceOrder::findOrFail($id);

        if ($order->status === 'delivered' && $validated['status'] === 'cancelled') {
            return response()->json([
                'status' => 'error',
                'message' => 'Đơn dịch vụ đã giao thành công, không thể hủy.',
            ], 422);
        }

        $order->update(['status' => $validated['status']]);

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

        if ($order->is_paid) {
            return response()->json([
                'status' => 'error',
                'message' => 'Đơn dịch vụ này đã được thanh toán trước đó.',
            ], 422);
        }

        $payment = DB::transaction(function () use ($order, $validated) {
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
