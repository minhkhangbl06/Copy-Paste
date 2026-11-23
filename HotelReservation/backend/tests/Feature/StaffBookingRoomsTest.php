<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffBookingRoomsTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_search_returns_all_rooms_and_a_conflict_does_not_create_another_booking(): void
    {
        $this->getJson('/api/staff/bookings')->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create(['role' => 'guest']));
        $this->getJson('/api/staff/bookings')->assertForbidden();
        Sanctum::actingAs(User::factory()->create(['role' => 'receptionist']));

        $rooms = collect(['101', '102', '103'])->map(fn ($number) => Room::create([
            'room_number' => $number,
            'room_type' => 'Standard',
            'price_per_night' => 500000,
            'status' => 'available',
        ])->id);
        $payload = [
            'room_ids' => [$rooms[0], $rooms[1]],
            'guest_name' => 'Staff test',
            'guest_phone' => '0901234567',
            'check_in_date' => now()->toDateString(),
            'check_out_date' => now()->addDays(2)->toDateString(),
        ];

        $booking = $this->postJson('/api/staff/bookings', $payload)->assertCreated()
            ->assertJsonCount(2, 'data.booking_rooms')->json('data');
        $this->getJson('/api/staff/bookings?search='.$booking['booking_code'])->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonCount(2, 'data.0.booking_rooms');
        $this->postJson('/api/staff/bookings', array_replace($payload, [
            'room_ids' => [$rooms[0], $rooms[2]],
        ]))->assertConflict();
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('booking_rooms', 2);
    }
}
