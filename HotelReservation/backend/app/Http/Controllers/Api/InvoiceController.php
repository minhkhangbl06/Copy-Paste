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
        $booking = Booking::with(['room', 'serviceOrders.items.service'])->findOrFail($bookingId);

        $checkoutTime = $request->filled('checkout_time') 
            ? Carbon::parse($request->query('checkout_time')) 
            : now();

        $otherSurcharges = (float) $request->query('other_surcharges', 0);

        $previewData = $this->calculationService->calculateBookingCharges($booking, $checkoutTime, $otherSurcharges);

        return response()->json([
            'status' => 'success',
            'data' => $previewData,
        ]);
    }

    /**
     * API tính toán phụ thu trả phòng muộn độc lập.
     */
    public function calculateLateCheckout(Request $request, int $bookingId): JsonResponse
    {
        $booking = Booking::with('room')->findOrFail($bookingId);

        $checkoutTime = $request->filled('checkout_time') 
            ? Carbon::parse($request->input('checkout_time')) 
            : now();

        $result = $this->lateCheckoutService->calculate($booking, $checkoutTime);

        return response()->json([
            'status' => 'success',
            'booking_id' => $booking->id,
            'check_out_date' => $booking->check_out_date,
            'simulated_checkout_time' => $checkoutTime->toDateTimeString(),
            'result' => $result,
        ]);
    }

    /**
     * Sinh hoặc cập nhật hóa đơn chính thức cho Booking.
     */
    public function generate(Request $request, int $bookingId): JsonResponse
    {
        $validated = $request->validate([
            'checkout_time' => 'nullable|date',
            'other_surcharges' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        $booking = Booking::with('room')->findOrFail($bookingId);

        $checkoutTime = !empty($validated['checkout_time']) 
            ? Carbon::parse($validated['checkout_time']) 
            : now();

        $otherSurcharges = (float) ($validated['other_surcharges'] ?? 0);

        $calc = $this->calculationService->calculateBookingCharges($booking, $checkoutTime, $otherSurcharges);
        $charges = $calc['charges'];

        $invoice = DB::transaction(function () use ($booking, $charges, $validated, $checkoutTime) {
            // Cập nhật actual_checkout_at vào booking
            $booking->update(['actual_checkout_at' => $checkoutTime]);

            $invoice = Invoice::updateOrCreate(
                ['booking_id' => $booking->id],
                [
                    'invoice_code' => 'INV-' . date('Ymd') . '-' . strtoupper(Str::random(5)),
                    'room_charges' => $charges['room_charges'],
                    'service_charges' => $charges['service_charges'],
                    'late_checkout_fee' => $charges['late_checkout_fee'],
                    'other_surcharges' => $charges['other_surcharges'],
                    'deposit_deducted' => $charges['deposit_deducted'],
                    'tax_amount' => $charges['tax_amount'],
                    'total_amount' => $charges['total_amount'],
                    'status' => $charges['total_amount'] <= 0 ? 'paid' : 'unpaid',
                    'issued_at' => now(),
                    'notes' => $validated['notes'] ?? null,
                ]
            );

            return $invoice->load(['booking.room', 'payments']);
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Tạo hóa đơn thành công.',
            'data' => $invoice,
        ]);
    }

    /**
     * Ghi nhận thanh toán cho hóa đơn (tiền mặt, chuyển khoản, thẻ POS, VNPay, Momo).
     */
    public function recordPayment(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
            'payment_method' => 'required|in:cash,credit_card,bank_transfer,vnpay,momo',
            'transaction_code' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $invoice = Invoice::with('payments')->findOrFail($id);

        if ($invoice->status === 'paid') {
            return response()->json([
                'status' => 'error',
                'message' => 'Hóa đơn này đã được thanh toán toàn bộ trước đó.',
            ], 422);
        }

        $payment = DB::transaction(function () use ($invoice, $validated) {
            $payment = Payment::create([
                'invoice_id' => $invoice->id,
                'amount' => $validated['amount'],
                'payment_method' => $validated['payment_method'],
                'transaction_code' => $validated['transaction_code'] ?? null,
                'status' => 'success',
                'notes' => $validated['notes'] ?? null,
            ]);

            $totalPaid = $invoice->payments()->where('status', 'success')->sum('amount');

            if ($totalPaid >= $invoice->total_amount) {
                $invoice->update([
                    'status' => 'paid',
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
            'status' => 'success',
            'message' => 'Ghi nhận thanh toán thành công.',
            'data' => [
                'invoice' => $invoice->fresh(['payments']),
                'new_payment' => $payment,
            ],
        ]);
    }

    /**
     * Đóng hóa đơn & Hoàn tất thủ tục Check-out.
     * Chuyển trạng thái booking thành 'checked_out' và phòng thành 'dirty' (chờ dọn dẹp).
     */
    public function closeInvoice(int $id): JsonResponse
    {
        $invoice = Invoice::with(['booking.room', 'payments'])->findOrFail($id);

        if ($invoice->status !== 'paid') {
            $totalPaid = $invoice->payments()->where('status', 'success')->sum('amount');
            if ($totalPaid < $invoice->total_amount) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Hóa đơn chưa được thanh toán đủ số tiền. Không thể đóng hóa đơn.',
                    'total_amount' => $invoice->total_amount,
                    'paid_amount' => $totalPaid,
                    'remaining' => $invoice->total_amount - $totalPaid,
                ], 422);
            }
            $invoice->update(['status' => 'paid', 'paid_at' => now()]);
        }

        DB::transaction(function () use ($invoice) {
            // Đánh dấu các đơn dịch vụ liên quan là đã thanh toán
            $invoice->booking->serviceOrders()
                ->where('charge_to_room', true)
                ->update(['is_paid' => true]);

            // Cập nhật trạng thái booking sang checked_out
            $invoice->booking->update(['status' => 'checked_out']);

            // Cập nhật phòng sang dirty (chờ Housekeeping dọn)
            if ($invoice->booking->room) {
                $invoice->booking->room->update(['status' => 'dirty']);
            }
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Đã đóng hóa đơn và hoàn tất thủ tục Check-out cho khách.',
            'data' => $invoice->fresh(['booking.room']),
        ]);
    }
}
