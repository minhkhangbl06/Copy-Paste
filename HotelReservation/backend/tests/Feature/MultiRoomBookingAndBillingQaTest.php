<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingRoom;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\Room;
use App\Models\RoomNight;
use App\Models\Service;
use App\Models\User;
use App\Services\InvoiceCalculationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiRoomBookingAndBillingQaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 10:00:00'));
    }

    public function test_booking_two_rooms_for_two_nights_creates_one_booking_two_rooms_four_nights_and_one_invoice(): void
    {
        $guest = User::factory()->create(['role' => 'guest']);
        $billing = User::factory()->create(['role' => 'billing']);
        $room1 = $this->createRoom('101', 500000);
        $room2 = $this->createRoom('102', 700000);

        Sanctum::actingAs($guest);

        $bookingResponse = $this->postJson('/api/bookings', [
            'guest_name' => 'Nguyen Van Le',
            'guest_phone' => '0901112222',
            'room_ids' => [$room1->id, $room2->id],
            'check_in_date' => '2026-11-10',
            'check_out_date' => '2026-11-12',
        ]);

        $bookingResponse->assertCreated()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(2, 'data.booking_rooms')
            ->assertJsonPath('data.total_room_amount', '2400000.00')
            ->assertJsonPath('data.deposit_amount', '1200000.00');

        $bookingId = $bookingResponse->json('data.id');

        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('booking_rooms', 2);
        $this->assertDatabaseCount('room_nights', 4);
        $this->assertTrue(RoomNight::where('room_id', $room1->id)->whereDate('stay_date', '2026-11-10')->exists());
        $this->assertTrue(RoomNight::where('room_id', $room1->id)->whereDate('stay_date', '2026-11-11')->exists());
        $this->assertTrue(RoomNight::where('room_id', $room2->id)->whereDate('stay_date', '2026-11-10')->exists());
        $this->assertTrue(RoomNight::where('room_id', $room2->id)->whereDate('stay_date', '2026-11-11')->exists());

        Sanctum::actingAs($billing);

        $invoiceResponse = $this->postJson("/api/bookings/{$bookingId}/invoice", [
            'checkout_time' => '2026-11-12 11:00:00',
        ]);

        $invoiceResponse->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.booking_id', $bookingId)
            ->assertJsonPath('data.room_charges', '2400000.00')
            ->assertJsonPath('data.deposit_deducted', '1200000.00');

        $this->assertDatabaseCount('invoices', 1);
        $this->assertSame(
            4,
            InvoiceItem::where('invoice_id', $invoiceResponse->json('data.id'))
                ->where('item_type', 'room_night')
                ->count()
        );

        // Sinh lại hóa đơn vẫn giữ duy nhất 1 hóa đơn cho toàn bộ booking
        $this->postJson("/api/bookings/{$bookingId}/invoice", [
            'checkout_time' => '2026-11-12 11:30:00',
        ])->assertOk();
        $this->assertDatabaseCount('invoices', 1);
    }

    public function test_room_contention_fails_entire_booking_and_cancellation_releases_nights_for_rebooking(): void
    {
        $guestA = User::factory()->create(['role' => 'guest']);
        $guestB = User::factory()->create(['role' => 'guest']);
        $room1 = $this->createRoom('201', 500000);
        $room2 = $this->createRoom('202', 500000);
        $room3 = $this->createRoom('203', 500000);

        Sanctum::actingAs($guestA);

        $bookingA = $this->postJson('/api/bookings', [
            'guest_name' => 'Khach A',
            'guest_phone' => '0902223333',
            'room_ids' => [$room1->id, $room2->id],
            'check_in_date' => '2026-11-15',
            'check_out_date' => '2026-11-17',
        ])->assertCreated()->json('data');

        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('booking_rooms', 2);
        $this->assertDatabaseCount('room_nights', 4);

        // Khách B đặt [room2 (đã hết chỗ), room3 (còn trống)] -> cả lượt đặt phải thất bại và rollback
        Sanctum::actingAs($guestB);

        $this->postJson('/api/bookings', [
            'guest_name' => 'Khach B',
            'guest_phone' => '0903334444',
            'room_ids' => [$room2->id, $room3->id],
            'check_in_date' => '2026-11-16',
            'check_out_date' => '2026-11-18',
        ])->assertConflict()
            ->assertJsonPath('status', 'error');

        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('booking_rooms', 2);
        $this->assertDatabaseCount('room_nights', 4);
        $this->assertDatabaseMissing('booking_rooms', ['room_id' => $room3->id]);

        // Khách A hủy đơn (>= 48h) -> hoàn 100% cọc và giải phóng toàn bộ 4 dòng đêm
        Sanctum::actingAs($guestA);

        $this->postJson("/api/bookings/{$bookingA['id']}/cancel")
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.refund_rate', '100%');

        $this->assertDatabaseCount('room_nights', 0);

        $availableIds = collect(
            $this->getJson('/api/rooms/available?check_in_date=2026-11-15&check_out_date=2026-11-17')
                ->assertOk()
                ->json('data.rooms')
        )->pluck('id')->all();

        $this->assertContains($room1->id, $availableIds);
        $this->assertContains($room2->id, $availableIds);

        // Khách B đặt lại đúng 2 phòng trong 2 đêm vừa giải phóng -> thành công
        Sanctum::actingAs($guestB);

        $this->postJson('/api/bookings', [
            'guest_name' => 'Khach B',
            'guest_phone' => '0903334444',
            'room_ids' => [$room1->id, $room2->id],
            'check_in_date' => '2026-11-15',
            'check_out_date' => '2026-11-17',
        ])->assertCreated()
            ->assertJsonCount(2, 'data.booking_rooms');

        $this->assertDatabaseCount('room_nights', 4);
    }

    public function test_guest_a_cannot_access_modify_cancel_or_view_invoice_of_guest_b_booking(): void
    {
        $guestA = User::factory()->create(['role' => 'guest']);
        $guestB = User::factory()->create(['role' => 'guest']);
        $billing = User::factory()->create(['role' => 'billing']);
        $room1 = $this->createRoom('204', 600000);
        $room2 = $this->createRoom('205', 600000);

        Sanctum::actingAs($guestB);

        $bookingBId = $this->postJson('/api/bookings', [
            'guest_name' => 'Khach B',
            'guest_phone' => '0904445555',
            'room_ids' => [$room1->id, $room2->id],
            'check_in_date' => '2026-11-15',
            'check_out_date' => '2026-11-17',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($billing);
        $invoiceBId = $this->postJson("/api/bookings/{$bookingBId}/invoice", [
            'checkout_time' => '2026-11-17 11:00:00',
        ])->assertOk()->json('data.id');

        // Khách A thử truy cập mọi endpoint liên quan đến đơn của Khách B -> đều bị chặn 403
        Sanctum::actingAs($guestA);

        $this->getJson("/api/bookings/{$bookingBId}")->assertForbidden();
        $this->patchJson("/api/bookings/{$bookingBId}", ['guest_name' => 'Hacked'])->assertForbidden();
        $this->postJson("/api/bookings/{$bookingBId}/cancel")->assertForbidden();
        $this->getJson("/api/bookings/{$bookingBId}/invoice/preview")->assertForbidden();
        $this->getJson("/api/invoices/{$invoiceBId}")->assertForbidden();

        // Danh sách bookings và invoices của Khách A không rò rỉ dữ liệu của Khách B
        $this->getJson('/api/bookings')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/invoices')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_service_order_from_second_room_appears_on_correct_line_of_consolidated_invoice(): void
    {
        $guest = User::factory()->create(['role' => 'guest']);
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $billing = User::factory()->create(['role' => 'billing']);

        $room1 = $this->createRoom('301', 600000);
        $room2 = $this->createRoom('302', 800000);
        $service = Service::create([
            'name' => 'Pho Bo Dac Biet',
            'category' => 'food',
            'price' => 75000,
            'unit' => 'to',
            'is_available' => true,
        ]);

        Sanctum::actingAs($guest);

        $bookingId = $this->postJson('/api/bookings', [
            'guest_name' => 'Khach Gia Dinh',
            'guest_phone' => '0905556666',
            'room_ids' => [$room1->id, $room2->id],
            'check_in_date' => '2026-11-10',
            'check_out_date' => '2026-11-12',
        ])->assertCreated()->json('data.id');

        $secondBookingRoom = BookingRoom::where('booking_id', $bookingId)
            ->where('room_id', $room2->id)
            ->firstOrFail();

        Sanctum::actingAs($receptionist);
        $this->postJson("/api/bookings/{$bookingId}/check-in")->assertOk();

        // Gọi dịch vụ từ phòng thứ hai (302)
        Sanctum::actingAs($guest);
        $this->postJson('/api/service-orders', [
            'booking_id' => $bookingId,
            'booking_room_id' => $secondBookingRoom->id,
            'items' => [
                ['service_id' => $service->id, 'quantity' => 2],
            ],
            'charge_to_room' => true,
        ])->assertCreated()
            ->assertJsonPath('data.booking_room_id', $secondBookingRoom->id)
            ->assertJsonPath('data.room_id', $room2->id)
            ->assertJsonPath('data.total_amount', '150000.00');

        // Phát hành hóa đơn chung cho toàn bộ booking
        Sanctum::actingAs($billing);
        $invoice = $this->postJson("/api/bookings/{$bookingId}/invoice", [
            'checkout_time' => '2026-11-12 11:00:00',
        ])->assertOk()
            ->assertJsonPath('data.room_charges', '2800000.00')
            ->assertJsonPath('data.service_charges', '150000.00')
            ->json('data');

        $this->assertDatabaseCount('invoices', 1);

        $serviceItem = InvoiceItem::where('invoice_id', $invoice['id'])
            ->where('item_type', 'service')
            ->firstOrFail();

        $this->assertSame($secondBookingRoom->id, $serviceItem->booking_room_id);
        $this->assertSame($room2->id, $serviceItem->room_id);
        $this->assertSame(2, $serviceItem->quantity);
        $this->assertEquals(75000.0, (float) $serviceItem->unit_price);
        $this->assertEquals(150000.0, (float) $serviceItem->amount);
        $this->assertStringContainsString('302', $serviceItem->description);
        $this->assertStringContainsString('Pho Bo Dac Biet', $serviceItem->description);
    }

    public function test_unconfirmed_deposit_partial_payment_and_duplicate_transaction_replay(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $billing = User::factory()->create(['role' => 'billing']);
        $room1 = $this->createRoom('401', 500000);
        $room2 = $this->createRoom('402', 500000);
        $room3 = $this->createRoom('403', 500000);

        // 1. Luồng Staff: chưa thu cọc -> không được check-in và không trừ cọc khi tính tiền
        Sanctum::actingAs($receptionist);

        $staffBooking = $this->postJson('/api/staff/bookings', [
            'guest_name' => 'Khach Staff',
            'guest_phone' => '0906667777',
            'room_ids' => [$room1->id, $room2->id],
            'check_in_date' => '2026-11-10',
            'check_out_date' => '2026-11-12',
        ])->assertCreated()->json('data');

        $staffId = $staffBooking['id'];

        $this->postJson("/api/staff/bookings/{$staffId}/check-in")->assertConflict();

        $calculator = app(InvoiceCalculationService::class);
        $unconfirmedCalc = $calculator->calculateBookingCharges(
            Booking::with('bookingRooms.room')->findOrFail($staffId),
            Carbon::parse('2026-11-12 11:00:00'),
            0.0,
            0.08,
            true
        );
        $this->assertEquals(0.0, (float) $unconfirmedCalc['charges']['deposit_deducted']);

        // Xác nhận thu cọc + gửi lại xác nhận cọc (idempotent)
        $receivedAt = $this->postJson("/api/staff/bookings/{$staffId}/deposit")
            ->assertOk()
            ->json('data.deposit_received_at');
        $this->assertNotNull($receivedAt);

        $this->postJson("/api/staff/bookings/{$staffId}/deposit")
            ->assertOk()
            ->assertJsonPath('data.deposit_received_at', $receivedAt);

        // Sau khi thu cọc -> check-in thành công
        $this->postJson("/api/staff/bookings/{$staffId}/check-in")->assertOk();

        // Thanh toán thiếu trên Staff checkout -> chặn 409, không tạo hóa đơn/thanh toán
        $preview = $this->getJson("/api/staff/bookings/{$staffId}/checkout")->assertOk()->json('data');
        $remaining = (float) $preview['remaining'];
        $this->assertGreaterThan(0, $remaining);

        $this->postJson("/api/staff/bookings/{$staffId}/checkout", [
            'amount' => round($remaining - 100000, 2),
            'payment_method' => 'cash',
        ])->assertConflict();

        $this->assertDatabaseCount('invoices', 0);
        $this->assertDatabaseCount('payments', 0);

        // Thanh toán đủ -> tạo đúng 1 hóa đơn, 1 giao dịch thanh toán
        $paidInvoice = $this->postJson("/api/staff/bookings/{$staffId}/checkout", [
            'amount' => $remaining,
            'payment_method' => 'bank_transfer',
        ])->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->json('data');

        $this->assertDatabaseCount('invoices', 1);
        $this->assertDatabaseCount('payments', 1);

        // Gửi lại giao dịch checkout lần 2 -> idempotent, không sinh thêm hóa đơn hay payment
        $this->postJson("/api/staff/bookings/{$staffId}/checkout", [
            'amount' => $remaining,
            'payment_method' => 'bank_transfer',
        ])->assertOk()
            ->assertJsonPath('data.id', $paidInvoice['id']);

        $this->assertDatabaseCount('invoices', 1);
        $this->assertDatabaseCount('payments', 1);

        // 2. Luồng Billing (InvoiceController): thanh toán thiếu -> bị chặn đóng hóa đơn (422)
        Sanctum::actingAs($billing);

        $booking2Id = $this->postJson('/api/bookings', [
            'guest_name' => 'Khach Thu Ngan',
            'guest_phone' => '0907778888',
            'room_ids' => [$room3->id],
            'check_in_date' => '2026-11-10',
            'check_out_date' => '2026-11-12',
        ])->assertCreated()->json('data.id');

        $service = Service::create([
            'name' => 'Giat Ui Nhanh',
            'category' => 'laundry',
            'price' => 100000,
            'unit' => 'kg',
            'is_available' => true,
        ]);

        // Đơn dịch vụ thanh toán riêng + thử gửi lại giao dịch thanh toán lần 2 -> chặn 422
        Sanctum::actingAs($receptionist);
        $serviceOrderId = $this->postJson('/api/service-orders', [
            'booking_id' => $booking2Id,
            'items' => [['service_id' => $service->id, 'quantity' => 1]],
            'charge_to_room' => false,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($billing);
        $this->postJson("/api/service-orders/{$serviceOrderId}/pay", [
            'payment_method' => 'cash',
        ])->assertOk();

        $paymentsBeforeReplay = Payment::count();
        $this->postJson("/api/service-orders/{$serviceOrderId}/pay", [
            'payment_method' => 'cash',
        ])->assertUnprocessable();
        $this->assertSame($paymentsBeforeReplay, Payment::count());

        // Sinh hóa đơn, thanh toán một phần -> trạng thái partially_paid -> chặn đóng 422
        $invoice2 = $this->postJson("/api/bookings/{$booking2Id}/invoice", [
            'checkout_time' => '2026-11-12 11:00:00',
        ])->assertOk()->json('data');

        $total2 = (float) $invoice2['total_amount'];
        $partialAmount = 100000.0;

        $this->postJson("/api/invoices/{$invoice2['id']}/pay", [
            'amount' => $partialAmount,
            'payment_method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.invoice.status', 'partially_paid');

        $this->postJson("/api/invoices/{$invoice2['id']}/close")
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error');

        // Thanh toán nốt phần còn thiếu -> đóng hóa đơn thành công
        $this->postJson("/api/invoices/{$invoice2['id']}/pay", [
            'amount' => round($total2 - $partialAmount, 2),
            'payment_method' => 'credit_card',
        ])->assertOk()
            ->assertJsonPath('data.invoice.status', 'paid');

        $this->postJson("/api/invoices/{$invoice2['id']}/close")
            ->assertOk()
            ->assertJsonPath('status', 'success');

        $this->assertDatabaseHas('bookings', ['id' => $booking2Id, 'status' => 'checked_out']);
        $this->assertDatabaseHas('rooms', ['id' => $room3->id, 'status' => 'dirty']);
    }

    private function createRoom(string $roomNumber, float $price): Room
    {
        return Room::create([
            'room_number' => $roomNumber,
            'room_type' => 'Deluxe',
            'price_per_night' => $price,
            'status' => 'available',
        ]);
    }
}
