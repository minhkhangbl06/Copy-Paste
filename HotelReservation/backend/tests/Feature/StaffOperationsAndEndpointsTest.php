<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Invoice;
use App\Models\Room;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffOperationsAndEndpointsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    /**
     * Test GET /api/bookings (Muội)
     */
    public function test_can_list_and_filter_bookings(): void
    {
        $room = Room::where('status', 'available')->first();

        Booking::create([
            'booking_code'      => 'BK-TEST-001',
            'room_id'           => $room->id,
            'guest_name'        => 'Nguyen Van StaffTest',
            'guest_phone'       => '0987654321',
            'check_in_date'     => now()->addDays(2)->toDateString(),
            'check_out_date'    => now()->addDays(4)->toDateString(),
            'total_room_amount' => 1000000,
            'deposit_amount'    => 300000,
            'status'            => 'confirmed',
        ]);

        // 1. Lấy toàn bộ danh sách
        $response = $this->getJson('/api/bookings');
        $response->assertStatus(200)
            ->assertJson(['status' => 'success'])
            ->assertJsonStructure([
                'status',
                'message',
                'data' => [
                    '*' => [
                        'id',
                        'booking_code',
                        'guest_name',
                        'guest_phone',
                        'check_in_date',
                        'check_out_date',
                        'status',
                        'room' => ['id', 'room_number', 'room_type'],
                    ]
                ]
            ]);

        // 2. Lọc theo search
        $searchRes = $this->getJson('/api/bookings?search=StaffTest');
        $searchRes->assertStatus(200)
            ->assertJsonFragment(['booking_code' => 'BK-TEST-001']);

        // 3. Lọc theo status
        $statusRes = $this->getJson('/api/bookings?status=confirmed');
        $statusRes->assertStatus(200)
            ->assertJsonFragment(['status' => 'confirmed']);
    }

    /**
     * Test POST /api/bookings/{id}/check-in (Muội)
     */
    public function test_can_checkin_booking_and_update_room_to_occupied(): void
    {
        $room = Room::where('status', 'available')->first();

        $booking = Booking::create([
            'booking_code'      => 'BK-CHECKIN-001',
            'room_id'           => $room->id,
            'guest_name'        => 'Khach CheckIn',
            'guest_phone'       => '0911222333',
            'check_in_date'     => now()->toDateString(),
            'check_out_date'    => now()->addDays(2)->toDateString(),
            'total_room_amount' => 1200000,
            'deposit_amount'    => 500000,
            'status'            => 'confirmed',
        ]);

        $response = $this->postJson("/api/bookings/{$booking->id}/check-in");
        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data'   => [
                    'id'     => $booking->id,
                    'status' => 'checked_in',
                    'room'   => [
                        'id'     => $room->id,
                        'status' => 'occupied',
                    ]
                ]
            ]);

        $this->assertEquals('checked_in', $booking->fresh()->status);
        $this->assertEquals('occupied', $room->fresh()->status);

        // Chặn check-in lần 2
        $reCheckin = $this->postJson("/api/bookings/{$booking->id}/check-in");
        $reCheckin->assertStatus(400);
    }

    /**
     * Test POST /api/bookings/{id}/check-out (Muội)
     */
    public function test_can_checkout_booking_and_mark_room_dirty(): void
    {
        $room = Room::where('status', 'available')->first();

        $booking = Booking::create([
            'booking_code'      => 'BK-CHECKOUT-001',
            'room_id'           => $room->id,
            'guest_name'        => 'Khach CheckOut',
            'guest_phone'       => '0944555666',
            'check_in_date'     => now()->subDays(2)->toDateString(),
            'check_out_date'    => now()->toDateString(),
            'total_room_amount' => 1000000,
            'deposit_amount'    => 300000,
            'status'            => 'checked_in',
        ]);
        $room->update(['status' => 'occupied']);

        $checkoutTime = now()->toDateTimeString();
        $response = $this->postJson("/api/bookings/{$booking->id}/check-out", [
            'actual_checkout_at' => $checkoutTime
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data'   => [
                    'id'     => $booking->id,
                    'status' => 'checked_out',
                    'room'   => [
                        'id'     => $room->id,
                        'status' => 'dirty',
                    ]
                ]
            ]);

        $this->assertEquals('checked_out', $booking->fresh()->status);
        $this->assertNotNull($booking->fresh()->actual_checkout_at);
        $this->assertEquals('dirty', $room->fresh()->status);
    }

    /**
     * Test PATCH /api/rooms/{id}/status (Muội / Housekeeping)
     */
    public function test_can_update_room_status_for_housekeeping(): void
    {
        $room = Room::where('status', 'available')->first();

        // 1. Đổi sang dirty
        $res = $this->patchJson("/api/rooms/{$room->id}/status", [
            'status' => 'dirty'
        ]);
        $res->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data'   => ['status' => 'dirty']
            ]);
        $this->assertEquals('dirty', $room->fresh()->status);

        // 2. Đổi sang clean (hệ thống tự map thành available)
        $resClean = $this->patchJson("/api/rooms/{$room->id}/status", [
            'status' => 'clean'
        ]);
        $resClean->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data'   => ['status' => 'available']
            ]);
        $this->assertEquals('available', $room->fresh()->status);

        // 3. Không cho đổi trạng thái nếu phòng đang có khách occupied
        $room->update(['status' => 'occupied']);
        $resBlock = $this->patchJson("/api/rooms/{$room->id}/status", [
            'status' => 'available'
        ]);
        $resBlock->assertStatus(409);
    }

    /**
     * Test GET /api/invoices và GET /api/invoices/{id} (Khang)
     */
    public function test_can_list_and_show_invoices(): void
    {
        $booking = Booking::first();

        $invoice = Invoice::create([
            'invoice_code'      => 'INV-20261115-TEST1',
            'booking_id'        => $booking->id,
            'room_charges'      => 1600000,
            'service_charges'   => 100000,
            'late_checkout_fee' => 0,
            'other_surcharges'  => 0,
            'deposit_deducted'  => 500000,
            'tax_amount'        => 0,
            'total_amount'      => 1200000,
            'status'            => 'unpaid',
            'issued_at'         => now(),
        ]);

        // 1. Danh sách hóa đơn
        $resList = $this->getJson('/api/invoices');
        $resList->assertStatus(200)
            ->assertJson(['status' => 'success'])
            ->assertJsonFragment([
                'invoice_code' => 'INV-20261115-TEST1',
                'booking_code' => $booking->booking_code,
                'guest_name'   => $booking->guest_name,
            ]);

        // 2. Lọc danh sách theo status
        $resFilter = $this->getJson('/api/invoices?status=unpaid');
        $resFilter->assertStatus(200)
            ->assertJsonFragment(['invoice_code' => 'INV-20261115-TEST1']);

        // 3. Chi tiết hóa đơn
        $resShow = $this->getJson("/api/invoices/{$invoice->id}");
        $resShow->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data'   => [
                    'id'           => $invoice->id,
                    'invoice_code' => 'INV-20261115-TEST1',
                    'booking_code' => $booking->booking_code,
                    'guest_name'   => $booking->guest_name,
                ]
            ]);

        // 4. Chi tiết 404
        $res404 = $this->getJson('/api/invoices/999999');
        $res404->assertStatus(404);
    }
}
