<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Room;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KhangServiceAndBillingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();
    }

    public function test_can_get_services_list()
    {
        $response = $this->getJson('/api/services');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    '*' => ['id', 'name', 'category', 'price', 'unit', 'is_available']
                ]
            ]);
    }

    public function test_can_create_service_order_and_update_status()
    {
        $booking = Booking::first();
        $pho = Service::where('name', 'Phở Bò Đặc Biệt')->first();
        $coca = Service::where('name', 'Coca Cola (Lon)')->first();

        $orderPayload = [
            'booking_id' => $booking->id,
            'charge_to_room' => true,
            'notes' => 'Giao trước 12h',
            'items' => [
                ['service_id' => $pho->id, 'quantity' => 2], // 75k x 2 = 150k
                ['service_id' => $coca->id, 'quantity' => 2], // 25k x 2 = 50k
            ],
        ];

        // 1. Tạo đơn dịch vụ
        $createResponse = $this->postJson('/api/service-orders', $orderPayload);
        $createResponse->assertStatus(201)
            ->assertJsonPath('data.total_amount', '200000.00')
            ->assertJsonPath('data.status', 'pending');

        $orderId = $createResponse->json('data.id');

        // 2. Cập nhật trạng thái sang delivered
        $updateResponse = $this->patchJson("/api/service-orders/{$orderId}/status", [
            'status' => 'delivered'
        ]);
        $updateResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'delivered');
    }

    public function test_late_checkout_calculation()
    {
        $booking = Booking::first();

        // Giả lập trả phòng lúc 14:00 (trễ trong khung 12:30 - 15:00 -> 30%)
        $simulatedTime = Carbon::parse($booking->check_out_date)->setTime(14, 0, 0)->toIso8601String();

        $response = $this->postJson("/api/bookings/{$booking->id}/late-checkout", [
            'checkout_time' => $simulatedTime,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('result.is_late', true)
            ->assertJsonPath('result.fee_rate', 0.3)
            ->assertJsonPath('result.late_fee', 240000); // 800k x 0.3 = 240k
    }

    public function test_full_invoice_and_checkout_flow()
    {
        $booking = Booking::first();
        $pho = Service::where('name', 'Phở Bò Đặc Biệt')->first();

        // 1. Khách gọi 1 tô phở ghi nợ vào phòng
        $this->postJson('/api/service-orders', [
            'booking_id' => $booking->id,
            'charge_to_room' => true,
            'items' => [
                ['service_id' => $pho->id, 'quantity' => 1] // 75,000
            ]
        ])->assertStatus(201);

        // 2. Preview hóa đơn
        $preview = $this->getJson("/api/bookings/{$booking->id}/invoice/preview");
        $preview->assertStatus(200)
            ->assertJsonPath('data.charges.room_charges', 1600000)
            ->assertJsonPath('data.charges.service_charges', 75000)
            ->assertJsonPath('data.charges.deposit_deducted', 500000);

        // 3. Tạo hóa đơn chính thức
        $invoiceRes = $this->postJson("/api/bookings/{$booking->id}/invoice");
        $invoiceRes->assertStatus(200);
        $invoiceId = $invoiceRes->json('data.id');
        $totalAmount = $invoiceRes->json('data.total_amount');

        // 4. Thanh toán hóa đơn qua chuyển khoản ngân hàng
        $payRes = $this->postJson("/api/invoices/{$invoiceId}/pay", [
            'amount' => $totalAmount,
            'payment_method' => 'bank_transfer',
            'transaction_code' => 'VNPAY-TRANS-999',
            'notes' => 'Khách quét QR thành công',
        ]);
        $payRes->assertStatus(200)
            ->assertJsonPath('data.invoice.status', 'paid');

        // 5. Đóng hóa đơn & hoàn tất check-out
        $closeRes = $this->postJson("/api/invoices/{$invoiceId}/close");
        $closeRes->assertStatus(200)
            ->assertJsonPath('data.booking.status', 'checked_out')
            ->assertJsonPath('data.booking.room.status', 'dirty');
    }
}
