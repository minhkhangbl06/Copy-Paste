<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\InvoiceCalculationService;
use App\Services\LateCheckoutService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InvoiceController extends Controller
{
    public function __construct(
        protected InvoiceCalculationService $calculationService,
        protected LateCheckoutService $lateCheckoutService
    ) {}

    /**
     * Xem trước bảng kê hóa đơn chi tiết (Preview Invoice) trước khi xuất hóa đơn.
     */
    public function preview(Request $request, int $bookingId): JsonResponse
    {
        $booking = Booking::with([
            'room',
            'bookingRooms.room',
            'bookingRooms.roomNights',
            'serviceOrders.items.service',
        ])->findOrFail($bookingId);

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest() && $booking->user_id !== null && $booking->user_id !== $user->id) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Truy cập bị từ chối: Bạn không có quyền xem bảng kê hóa đơn này.'
            ], 403);
        }

        $checkoutTime = $request->filled('checkout_time') 
            ? Carbon::parse($request->query('checkout_time')) 
            : now();

        $otherSurcharges = (float) $request->query('other_surcharges', 0);

        $previewData = $this->calculationService->calculateBookingCharges($booking, $checkoutTime, $otherSurcharges);

        return response()->json([
            'status'  => 'success',
            'message' => 'Đã tính bảng kê hóa đơn.',
            'data'    => $previewData,
        ]);
    }

    /**
     * API tính toán phụ thu trả phòng muộn độc lập.
     */
    public function calculateLateCheckout(Request $request, int $bookingId): JsonResponse
    {
        $booking = Booking::with(['room', 'bookingRooms.room'])->findOrFail($bookingId);

        $checkoutTime = $request->filled('checkout_time') 
            ? Carbon::parse($request->input('checkout_time')) 
            : now();

        $result = $this->lateCheckoutService->calculate($booking, $checkoutTime);

        $data = [
            'booking_id'              => $booking->id,
            'check_out_date'          => $booking->check_out_date,
            'simulated_checkout_time' => $checkoutTime->toDateTimeString(),
            'result'                  => $result,
        ];

        return response()->json([
            'status'  => 'success',
            'message' => 'Đã tính phụ thu trả phòng muộn.',
            'data'    => $data,
            ...$data,
        ]);
    }

    /**
     * Sinh hoặc cập nhật hóa đơn chính thức cho Booking.
     * Lưu chi tiết vào INVOICE_ITEMS cho từng đêm, dịch vụ theo phòng và phụ thu phát sinh.
     */
    public function generate(Request $request, int $bookingId): JsonResponse
    {
        $validated = $request->validate([
            'checkout_time'    => 'nullable|date',
            'other_surcharges' => 'nullable|numeric|min:0',
            'notes'            => 'nullable|string',
        ]);

        $booking = Booking::with([
            'room',
            'bookingRooms.room',
            'bookingRooms.roomNights',
            'serviceOrders.items.service',
        ])->findOrFail($bookingId);

        $checkoutTime = !empty($validated['checkout_time']) 
            ? Carbon::parse($validated['checkout_time']) 
            : now();

        $otherSurcharges = (float) ($validated['other_surcharges'] ?? 0);

        $calc = $this->calculationService->calculateBookingCharges($booking, $checkoutTime, $otherSurcharges);
        $charges = $calc['charges'];

        $invoice = DB::transaction(function () use ($booking, $charges, $calc, $validated, $checkoutTime) {
            // Cập nhật actual_checkout_at vào booking
            $booking->update(['actual_checkout_at' => $checkoutTime]);

            // Tạo hoặc cập nhật đúng 1 hóa đơn duy nhất cho booking
            $invoice = Invoice::updateOrCreate(
                ['booking_id' => $booking->id],
                [
                    'invoice_code'      => 'INV-' . date('Ymd') . '-' . strtoupper(Str::random(5)),
                    'room_charges'      => $charges['room_charges'],
                    'service_charges'   => $charges['service_charges'],
                    'late_checkout_fee' => $charges['late_checkout_fee'],
                    'other_surcharges'  => $charges['other_surcharges'],
                    'deposit_deducted'  => $charges['deposit_deducted'],
                    'tax_amount'        => $charges['tax_amount'],
                    'total_amount'      => $charges['total_amount'],
                    'status'            => $charges['total_amount'] <= 0 ? 'paid' : 'unpaid',
                    'issued_at'         => now(),
                    'notes'             => $validated['notes'] ?? null,
                ]
            );

            // Xóa các items cũ nếu sinh lại hóa đơn
            $invoice->items()->delete();

            // Lưu chi tiết từng dòng INVOICE_ITEMS
            foreach ($calc['invoice_items'] as $itemData) {
                $invoice->items()->create([
                    'booking_room_id' => $itemData['booking_room_id'],
                    'room_id'         => $itemData['room_id'],
                    'item_type'       => $itemData['item_type'],
                    'description'     => $itemData['description'],
                    'quantity'        => $itemData['quantity'],
                    'unit_price'      => $itemData['unit_price'],
                    'amount'          => $itemData['amount'],
                ]);
            }

            return $invoice->load(['booking.room', 'booking.bookingRooms.room', 'payments', 'items']);
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Tạo hóa đơn thành công.',
            'data'    => $invoice,
        ]);
    }

    /**
     * Ghi nhận thanh toán cho Hóa đơn (hỗ trợ tiền mặt, chuyển khoản, thẻ).
     */
    public function recordPayment(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount'         => 'required|numeric|min:1',
            'payment_method' => 'required|in:cash,credit_card,bank_transfer',
            'notes'          => 'nullable|string',
        ]);

        $invoice = Invoice::with(['booking', 'payments'])->findOrFail($id);

        $payment = DB::transaction(function () use ($invoice, $validated) {
            $payment = Payment::create([
                'payment_code'   => 'PAY-' . date('Ymd') . '-' . strtoupper(Str::random(5)),
                'invoice_id'     => $invoice->id,
                'booking_id'     => $invoice->booking_id,
                'amount'         => $validated['amount'],
                'payment_method' => $validated['payment_method'],
                'status'         => 'success',
                'paid_at'        => now(),
                'notes'          => $validated['notes'] ?? null,
            ]);

            $totalPaid = $invoice->payments()->where('status', 'success')->sum('amount');

            if ($totalPaid >= $invoice->total_amount) {
                $invoice->update([
                    'status'  => 'paid',
                    'paid_at' => now(),
                ]);
            } else {
                $invoice->update([
                    'status' => 'partially_paid',
                ]);
            }

            return $payment;
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Ghi nhận thanh toán thành công.',
            'data'    => [
                'invoice'     => $invoice->fresh(['payments', 'items']),
                'new_payment' => $payment,
            ],
        ]);
    }

    /**
     * Đóng hóa đơn & Hoàn tất thủ tục Check-out.
     * Chặn đóng hóa đơn khi chưa thu đủ (BR rule).
     * Khi đóng, chuyển booking thành 'checked_out' và các phòng thành 'dirty'.
     */
    public function closeInvoice(int $id): JsonResponse
    {
        $invoice = Invoice::with([
            'booking.room',
            'booking.bookingRooms.room',
            'payments',
            'items',
        ])->findOrFail($id);

        $totalPaid = (float) $invoice->payments()->where('status', 'success')->sum('amount');

        // Chặn đóng hóa đơn khi chưa thu đủ tiền
        if ($totalPaid < (float) $invoice->total_amount) {
            return response()->json([
                'status'       => 'error',
                'message'      => 'Hóa đơn chưa được thanh toán đủ số tiền. Không thể đóng hóa đơn.',
                'total_amount' => $invoice->total_amount,
                'paid_amount'  => $totalPaid,
                'remaining'    => round($invoice->total_amount - $totalPaid, 2),
            ], 422);
        }

        DB::transaction(function () use ($invoice) {
            // Đánh dấu các đơn dịch vụ liên quan là đã thanh toán
            $invoice->booking->serviceOrders()
                ->where('charge_to_room', true)
                ->update(['is_paid' => true]);

            // Cập nhật trạng thái booking sang checked_out
            $invoice->booking->update(['status' => 'checked_out']);

            // Cập nhật các phòng sang dirty (chờ buồng phòng dọn dẹp)
            if ($invoice->booking->bookingRooms()->exists()) {
                foreach ($invoice->booking->bookingRooms as $br) {
                    $br->update(['status' => 'CHECKED_OUT']);
                    if ($br->room) {
                        $br->room->update(['status' => 'dirty']);
                    }
                }
            }
            if ($invoice->booking->room) {
                $invoice->booking->room->update(['status' => 'dirty']);
            }

            // Cập nhật trạng thái hóa đơn sang paid / closed
            $invoice->update([
                'status'    => 'paid',
                'paid_at'   => $invoice->paid_at ?? now(),
                'closed_at' => now(),
            ]);
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Đã đóng hóa đơn và hoàn tất thủ tục Check-out cho khách.',
            'data'    => $invoice->fresh(['booking.room', 'booking.bookingRooms.room', 'items']),
        ]);
    }

    /**
     * GET /api/invoices
     * Lấy danh sách toàn bộ hóa đơn (hỗ trợ lọc theo status, search theo mã, khách hàng, SĐT).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with([
            'booking.room',
            'booking.bookingRooms.room',
            'payments',
            'items',
        ]);

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest()) {
            $query->whereHas('booking', fn ($bq) => $bq->where('user_id', $user->id));
        }

        if ($request->filled('status') && $request->query('status') !== 'all') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('search')) {
            $search = trim($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->where('invoice_code', 'like', "%{$search}%")
                  ->orWhereHas('booking', function ($bq) use ($search) {
                      $bq->where('booking_code', 'like', "%{$search}%")
                         ->orWhere('guest_name', 'like', "%{$search}%")
                         ->orWhere('guest_phone', 'like', "%{$search}%");
                  });
            });
        }

        $invoices = $query->orderBy('created_at', 'desc')->get();

        // Gắn thêm các trường tiện ích tương thích với Frontend Staff Billing
        $invoices->transform(function ($invoice) {
            $invoice->booking_code = $invoice->booking?->booking_code;
            $invoice->guest_name = $invoice->booking?->guest_name;
            $invoice->guest_phone = $invoice->booking?->guest_phone;
            $invoice->room_number = $invoice->booking?->room?->room_number 
                ?? $invoice->booking?->bookingRooms?->pluck('room.room_number')->filter()->join(', ');
            return $invoice;
        });

        return response()->json([
            'status'  => 'success',
            'message' => 'Lấy danh sách hóa đơn thành công.',
            'data'    => $invoices,
        ], 200);
    }

    /**
     * GET /api/invoices/{id}
     * Lấy chi tiết 1 hóa đơn kèm danh sách invoice_items từng phòng và lịch sử thanh toán.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::with([
            'booking.room',
            'booking.bookingRooms.room',
            'booking.serviceOrders.items.service',
            'items.room',
            'items.bookingRoom.room',
            'payments',
        ])->find($id);

        if (!$invoice) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy hóa đơn.',
            ], 404);
        }

        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->isGuest() && $invoice->booking && $invoice->booking->user_id !== null && $invoice->booking->user_id !== $user->id) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Truy cập bị từ chối: Bạn không có quyền xem hóa đơn này.'
            ], 403);
        }

        $invoice->booking_code = $invoice->booking?->booking_code;
        $invoice->guest_name = $invoice->booking?->guest_name;
        $invoice->guest_phone = $invoice->booking?->guest_phone;
        $invoice->room_number = $invoice->booking?->room?->room_number 
            ?? $invoice->booking?->bookingRooms?->pluck('room.room_number')->filter()->join(', ');

        return response()->json([
            'status'  => 'success',
            'message' => 'Chi tiết hóa đơn.',
            'data'    => $invoice,
        ], 200);
    }
}
