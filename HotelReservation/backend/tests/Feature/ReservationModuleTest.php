<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\Room;
use App\Models\Booking;
use Carbon\Carbon;

class ReservationModuleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Nạp sẵn 2 phòng mẫu để test
        Room::create([
            'room_number'     => '101',
            'room_type'       => 'Standard',
            'price_per_night' => 500000,
            'status'          => 'available'
        ]);

        Room::create([
            'room_number'     => '102',
            'room_type'       => 'Deluxe',
            'price_per_night' => 800000,
            'status'          => 'available'
        ]);
    }

    /** @test */
    public function it_can_list_all_rooms()
    {
        $response = $this->getJson('/api/rooms');

        $response->assertStatus(200)
                 ->assertJson(['status' => 'success'])
                 ->assertJsonCount(2, 'data');
    }

    /** @test */
    public function it_can_search_available_rooms_correctly()
    {
        $response = $this->getJson('/api/rooms/available?check_in_date=' . now()->addDays(1)->toDateString() . '&check_out_date=' . now()->addDays(3)->toDateString());

        $response->assertStatus(200)
                 ->assertJson(['status' => 'success'])
                 ->assertJsonPath('data.count', 2);
    }

    /** @test */
    public function it_can_create_booking_and_calculate_deposit()
    {
        $room = Room::first();
        $checkIn = now()->addDays(2)->toDateString();
        $checkOut = now()->addDays(5)->toDateString(); // 3 đêm -> cọc >= 30%

        $payload = [
            'guest_name'     => 'Nguyen Van A',
            'guest_phone'    => '0901234567',
            'room_ids'       => [$room->id],
            'check_in_date'  => $checkIn,
            'check_out_date' => $checkOut,
        ];

        $response = $this->postJson('/api/bookings', $payload);

        $response->assertStatus(201)
                 ->assertJson(['status' => 'success']);

        $this->assertDatabaseHas('bookings', [
            'guest_name' => 'Nguyen Van A',
            'room_id'    => $room->id,
            'status'     => 'confirmed'
        ]);
    }

    /** @test */
    public function it_prevents_double_booking_on_same_room_and_dates()
    {
        $room = Room::first();
        $checkIn = now()->addDays(2)->toDateString();
        $checkOut = now()->addDays(5)->toDateString();

        Booking::create([
            'booking_code'      => 'BK-EXISTING',
            'room_id'           => $room->id,
            'guest_name'        => 'Khach 1',
            'guest_phone'       => '0900000001',
            'check_in_date'     => $checkIn,
            'check_out_date'    => $checkOut,
            'total_room_amount' => 1500000,
            'deposit_amount'    => 500000,
            'status'            => 'confirmed'
        ]);

        // Khách thứ 2 đặt trùng phòng
        $payload = [
            'guest_name'     => 'Khach 2',
            'guest_phone'    => '0900000002',
            'room_ids'       => [$room->id],
            'check_in_date'  => now()->addDays(3)->toDateString(),
            'check_out_date' => now()->addDays(6)->toDateString(),
        ];

        $response = $this->postJson('/api/bookings', $payload);

        $response->assertStatus(409)
                 ->assertJson(['status' => 'error']);
    }

    /** @test */
    public function it_can_cancel_booking_and_calculate_refund_percentage()
    {
        $room = Room::first();
        $booking = Booking::create([
            'booking_code'      => 'BK-CANCEL-TEST',
            'room_id'           => $room->id,
            'guest_name'        => 'Khach Huy',
            'guest_phone'       => '0900000003',
            'check_in_date'     => now()->addDays(4)->toDateString(), // Còn > 48h
            'check_out_date'    => now()->addDays(7)->toDateString(),
            'total_room_amount' => 1500000,
            'deposit_amount'    => 500000,
            'status'            => 'confirmed'
        ]);

        $response = $this->postJson("/api/bookings/{$booking->id}/cancel");

        $response->assertStatus(200)
                 ->assertJson(['status' => 'success'])
                 ->assertJsonPath('data.refund_rate', '100%');

        $this->assertDatabaseHas('bookings', [
            'id'     => $booking->id,
            'status' => 'cancelled'
        ]);
    }
}
