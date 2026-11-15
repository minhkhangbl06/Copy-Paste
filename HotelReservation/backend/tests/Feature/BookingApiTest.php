<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Room;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(now()->setDate(2026, 11, 10)->setTime(14, 0));
    }

    public function test_availability_excludes_overlaps_and_maintenance_but_allows_adjacent_stays(): void
    {
        $booked = $this->room('101');
        $adjacent = $this->room('102');
        $cancelled = $this->room('103');
        $this->room('104', 'maintenance');

        $this->book([$booked->id])->assertCreated();
        $this->book([$adjacent->id], '2026-11-10', '2026-11-13')->assertCreated();
        $cancelledId = $this->book([$cancelled->id])->assertCreated()->json('data.0.id');
        $this->postJson("/api/bookings/{$cancelledId}/cancel")->assertOk();
        Booking::where('room_id', $booked->id)->firstOrFail()->replicate()->fill([
            'booking_code' => 'BK-WITHOUT-ROOM',
            'room_id' => null,
        ])->save();

        $this->getJson('/api/rooms/available?check_in_date=2026-11-13&check_out_date=2026-11-15')
            ->assertOk()
            ->assertJsonStructure(['status', 'message', 'data'])
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.rooms.0.id', $adjacent->id)
            ->assertJsonPath('data.rooms.1.id', $cancelled->id);
    }

    public function test_books_multiple_rooms_and_nights_with_exact_totals(): void
    {
        $first = $this->room('101');
        $second = $this->room('102');

        $this->book([$first->id, $second->id])
            ->assertCreated()
            ->assertJsonStructure(['status', 'message', 'data'])
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.total_room_amount', '1150000.00')
            ->assertJsonPath('data.1.deposit_amount', '500000.00');

        $this->assertDatabaseCount('bookings', 2);
    }

    public function test_rejects_invalid_dates_without_writing_a_booking(): void
    {
        $room = $this->room('101');

        $this->book([$room->id], '2026-11-09', '2026-11-12')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('check_in_date');
        $this->book([$room->id], '2026-11-13', '2026-11-13')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('check_out_date');

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_conflicting_multi_room_request_rolls_back_without_reserving_the_free_room(): void
    {
        $free = $this->room('101');
        $booked = $this->room('102');

        $this->book([$booked->id])->assertCreated();
        $this->book([$free->id, $booked->id], '2026-11-14', '2026-11-16', 'Guest Two')
            ->assertConflict()
            ->assertJsonPath('status', 'error');

        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseMissing('bookings', ['room_id' => $free->id]);
    }

    public function test_cancelling_at_24_hours_refunds_half_and_releases_the_room(): void
    {
        $room = $this->room('101');
        $id = $this->book([$room->id], '2026-11-11', '2026-11-13')->assertCreated()->json('data.0.id');

        $this->postJson("/api/bookings/{$id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.refund_rate', '50%')
            ->assertJsonPath('data.refund_amount', 250000);

        $this->assertDatabaseHas('bookings', ['id' => $id, 'status' => 'cancelled']);
        $this->book([$room->id], '2026-11-11', '2026-11-13', 'Guest Two')->assertCreated();
    }

    private function room(string $number, string $status = 'available'): Room
    {
        return Room::create([
            'room_number' => $number,
            'room_type' => 'Standard',
            'price_per_night' => 500000,
            'status' => $status,
        ]);
    }

    private function book(
        array $roomIds,
        string $checkIn = '2026-11-13',
        string $checkOut = '2026-11-15',
        string $guest = 'Guest One',
    ): \Illuminate\Testing\TestResponse {
        return $this->postJson('/api/bookings', [
            'guest_name' => $guest,
            'guest_phone' => '0901234567',
            'room_ids' => $roomIds,
            'check_in_date' => $checkIn,
            'check_out_date' => $checkOut,
        ]);
    }
}
