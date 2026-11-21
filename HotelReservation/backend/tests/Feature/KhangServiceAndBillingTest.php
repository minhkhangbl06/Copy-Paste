<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingRoom;
use App\Models\Room;
use App\Models\RoomNight;
use App\Models\Service;
use App\Models\ServiceOrder;
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
            ->assertJsonStructure(['status', 'message', 'data'])
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
            ->assertJsonPath('data.result.late_fee', 240000)
            ->assertJsonPath('result.is_late', true)
            ->assertJsonPath('result.fee_rate', 0.3)
            ->assertJsonPath('result.late_fee', 240000); // 800k x 0.3 = 240k
    }

    public function test_full_invoice_and_checkout_flow()
    {
        $booking = Booking::first();
        $pho = Service::where('name', 'Phở Bò Đặc Biệt')->first();
        $checkoutTime = $booking->check_out_date->toDateString() . ' 14:00:00';

        // 1. Khách gọi 1 tô phở ghi nợ vào phòng
        $this->postJson('/api/service-orders', [
            'booking_id' => $booking->id,
            'charge_to_room' => true,
            'items' => [
                ['service_id' => $pho->id, 'quantity' => 1] // 75,000
            ]
        ])->assertStatus(201);

        // 2. Preview hóa đơn
        $query = http_build_query(['checkout_time' => $checkoutTime, 'other_surcharges' => 35000]);
        $preview = $this->getJson("/api/bookings/{$booking->id}/invoice/preview?{$query}");
        $preview->assertStatus(200)
            ->assertJsonStructure(['status', 'message', 'data'])
            ->assertJsonPath('data.charges.room_charges', 1600000)
            ->assertJsonPath('data.charges.service_charges', 75000)
            ->assertJsonPath('data.charges.deposit_deducted', 500000)
            ->assertJsonPath('data.charges.late_checkout_fee', 240000)
            ->assertJsonPath('data.charges.tax_amount', 116000)
            ->assertJsonPath('data.charges.total_amount', 1566000);

        // 3. Tạo hóa đơn chính thức
        $invoiceRes = $this->postJson("/api/bookings/{$booking->id}/invoice", [
            'checkout_time' => $checkoutTime,
            'other_surcharges' => 35000,
        ]);
        $invoiceRes->assertStatus(200)->assertJsonPath('data.total_amount', '1566000.00');
        $invoiceId = $invoiceRes->json('data.id');
        $totalAmount = $invoiceRes->json('data.total_amount');

        $this->postJson("/api/invoices/{$invoiceId}/close")->assertUnprocessable();
        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'checked_in']);

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

    /**
     * Test Khang: Gắn SERVICE_ORDERS vào booking_room_id để biết dịch vụ được gọi từ phòng nào.
     * Lưu món, số lượng và đơn giá trong SERVICE_ORDER_ITEMS.
     */
    public function test_service_order_with_booking_room_id_and_items_storage()
    {
        $booking = Booking::first();
        $bookingRoom = BookingRoom::where('booking_id', $booking->id)->first();
        $pho = Service::where('name', 'Phở Bò Đặc Biệt')->first();

        $response = $this->postJson('/api/service-orders', [
            'booking_id'      => $booking->id,
            'booking_room_id' => $bookingRoom->id,
            'charge_to_room'  => true,
            'items'           => [
                ['service_id' => $pho->id, 'quantity' => 3], // 75,000 x 3 = 225,000
            ],
            'notes'           => 'Giao phòng 101',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.booking_room_id', $bookingRoom->id)
            ->assertJsonPath('data.room_id', $bookingRoom->room_id)
            ->assertJsonPath('data.total_amount', '225000.00');

        $orderId = $response->json('data.id');

        $this->assertDatabaseHas('service_orders', [
            'id'              => $orderId,
            'booking_id'      => $booking->id,
            'booking_room_id' => $bookingRoom->id,
            'room_id'         => $bookingRoom->room_id,
        ]);

        $this->assertDatabaseHas('service_order_items', [
            'service_order_id' => $orderId,
            'service_id'       => $pho->id,
            'quantity'         => 3,
            'unit_price'       => 75000,
            'price_at_order'   => 75000,
            'amount'           => 225000,
            'subtotal'         => 225000,
        ]);
    }

    /**
     * Test Khang: Multi-room booking tổng hợp hóa đơn từ room_nights + service_orders + late_checkout.
     * Tạo duy nhất 1 INVOICE cho cả booking, lưu chi tiết từng đêm và dịch vụ từng phòng vào INVOICE_ITEMS.
     */
    public function test_multi_room_booking_invoice_and_invoice_items()
    {
        $room1 = Room::where('room_number', '101')->first();
        $room2 = Room::where('room_number', '102')->first();

        // 1. Tạo booking 2 phòng trong 2 đêm (2026-12-01 đến 2026-12-03)
        $booking = Booking::create([
            'booking_code'      => 'BK-MULTI-ROOM-001',
            'guest_name'        => 'Tran Multi Room',
            'guest_phone'       => '0912345678',
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'total_room_amount' => 2600000, // (800k x 2) + (500k x 2) = 1.6m + 1.0m = 2.6m
            'deposit_amount'    => 1000000,
            'status'            => 'checked_in',
        ]);

        // Phòng 1 (101): 800k / đêm
        $br1 = BookingRoom::create([
            'booking_id'        => $booking->id,
            'room_id'           => $room1->id,
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'price_per_night'   => 800000,
            'total_room_amount' => 1600000,
            'status'            => 'OCCUPIED',
        ]);
        RoomNight::create(['booking_room_id' => $br1->id, 'room_id' => $room1->id, 'stay_date' => '2026-12-01', 'rate' => 800000, 'price' => 800000]);
        RoomNight::create(['booking_room_id' => $br1->id, 'room_id' => $room1->id, 'stay_date' => '2026-12-02', 'rate' => 800000, 'price' => 800000]);

        // Phòng 2 (102): 500k / đêm
        $br2 = BookingRoom::create([
            'booking_id'        => $booking->id,
            'room_id'           => $room2->id,
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'price_per_night'   => 500000,
            'total_room_amount' => 1000000,
            'status'            => 'OCCUPIED',
        ]);
        RoomNight::create(['booking_room_id' => $br2->id, 'room_id' => $room2->id, 'stay_date' => '2026-12-01', 'rate' => 500000, 'price' => 500000]);
        RoomNight::create(['booking_room_id' => $br2->id, 'room_id' => $room2->id, 'stay_date' => '2026-12-02', 'rate' => 500000, 'price' => 500000]);

        // 2. Khách ở phòng 2 (102) gọi 2 lon Coca Cola
        $coca = Service::where('name', 'Coca Cola (Lon)')->first();
        $this->postJson('/api/service-orders', [
            'booking_id'      => $booking->id,
            'booking_room_id' => $br2->id,
            'charge_to_room'  => true,
            'items'           => [
                ['service_id' => $coca->id, 'quantity' => 2], // 25k x 2 = 50k
            ],
        ])->assertStatus(201);

        // 3. Tạo hóa đơn cho booking (trả phòng trễ lúc 14:00 ngày 2026-12-03)
        // Nightly price của booking = 800k + 500k = 1,300,000. Late fee (30%) = 390,000.
        // Room charges = 2,600,000 (4 dòng room_nights: 800k + 800k + 500k + 500k).
        // Service charges = 50,000.
        // Late checkout fee = 390,000.
        // Subtotal = 2,600,000 + 50,000 + 390,000 = 3,040,000.
        // Tiền cọc = 1,000,000.
        // Tax 8% = (3,040,000 - 1,000,000) * 0.08 = 163,200.
        // Total amount = 2,040,000 + 163,200 = 2,203,200.
        $checkoutTime = '2026-12-03 14:00:00';
        $invoiceRes = $this->postJson("/api/bookings/{$booking->id}/invoice", [
            'checkout_time' => $checkoutTime,
        ]);

        $invoiceRes->assertStatus(200)
            ->assertJsonPath('data.room_charges', '2600000.00')
            ->assertJsonPath('data.service_charges', '50000.00')
            ->assertJsonPath('data.late_checkout_fee', '390000.00')
            ->assertJsonPath('data.deposit_deducted', '1000000.00')
            ->assertJsonPath('data.tax_amount', '163200.00')
            ->assertJsonPath('data.total_amount', '2203200.00');

        $invoiceId = $invoiceRes->json('data.id');

        // Kiểm tra đúng 1 hóa đơn được tạo cho booking này
        $this->assertEquals(1, \App\Models\Invoice::where('booking_id', $booking->id)->count());

        // Kiểm tra các dòng INVOICE_ITEMS:
        // - 4 dòng room_night
        // - 1 dòng service (thuộc phòng 2)
        // - 1 dòng late_checkout
        $this->assertDatabaseHas('invoice_items', [
            'invoice_id'      => $invoiceId,
            'booking_room_id' => $br2->id,
            'item_type'       => 'service',
            'quantity'        => 2,
            'unit_price'      => 25000,
            'amount'          => 50000,
        ]);

        $this->assertDatabaseHas('invoice_items', [
            'invoice_id'      => $invoiceId,
            'booking_room_id' => $br1->id,
            'item_type'       => 'room_night',
            'unit_price'      => 800000,
        ]);

        $this->assertDatabaseHas('invoice_items', [
            'invoice_id'      => $invoiceId,
            'booking_room_id' => $br2->id,
            'item_type'       => 'room_night',
            'unit_price'      => 500000,
        ]);

        $this->assertDatabaseHas('invoice_items', [
            'invoice_id' => $invoiceId,
            'item_type'  => 'late_checkout',
            'amount'     => 390000,
        ]);

        // 4. Chặn đóng hóa đơn khi chưa thu đủ
        $closeFail = $this->postJson("/api/invoices/{$invoiceId}/close");
        $closeFail->assertStatus(422)
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('message', 'Hóa đơn chưa được thanh toán đủ số tiền. Không thể đóng hóa đơn.');

        // Thanh toán 1 phần (1,000,000)
        $this->postJson("/api/invoices/{$invoiceId}/pay", [
            'amount'         => 1000000,
            'payment_method' => 'cash',
        ])->assertStatus(200);

        // Vẫn phải bị chặn đóng hóa đơn
        $closeFail2 = $this->postJson("/api/invoices/{$invoiceId}/close");
        $closeFail2->assertStatus(422);

        // Thanh toán nốt số tiền còn lại (1,203,200)
        $this->postJson("/api/invoices/{$invoiceId}/pay", [
            'amount'         => 1203200,
            'payment_method' => 'bank_transfer',
        ])->assertStatus(200);

        // Bây giờ đã thanh toán đủ -> Đóng hóa đơn thành công
        $closeSuccess = $this->postJson("/api/invoices/{$invoiceId}/close");
        $closeSuccess->assertStatus(200)
            ->assertJsonPath('data.booking.status', 'checked_out');

        // Cả 2 phòng trong booking đều chuyển sang trạng thái dirty
        $this->assertEquals('dirty', $room1->fresh()->status);
        $this->assertEquals('dirty', $room2->fresh()->status);
    }
}
