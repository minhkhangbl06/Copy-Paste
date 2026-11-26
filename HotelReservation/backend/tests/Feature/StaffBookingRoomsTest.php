<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\Service;
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

    public function test_staff_completes_multi_room_stay_and_housekeeping_tracks_each_room(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'receptionist']));
        $rooms = collect(['201', '202', '203'])->map(fn ($number) => Room::create([
            'room_number' => $number,
            'room_type' => 'Standard',
            'price_per_night' => 500000,
            'status' => 'available',
        ]));
        $booking = $this->postJson('/api/staff/bookings', [
            'room_ids' => [$rooms[0]->id, $rooms[1]->id],
            'guest_name' => 'Staff test',
            'guest_phone' => '0901234567',
            'check_in_date' => now()->toDateString(),
            'check_out_date' => now()->addDays(2)->toDateString(),
        ])->assertCreated()->json('data');
        $id = $booking['id'];
        $path = "/api/staff/bookings/{$id}";

        $this->postJson("{$path}/check-in")->assertConflict();
        $received = $this->postJson("{$path}/deposit")->assertOk()->json('data.deposit_received_at');
        $this->assertNotNull($received);
        $this->postJson("{$path}/deposit")->assertOk()->assertJsonPath('data.deposit_received_at', $received);

        $rooms[1]->update(['status' => 'dirty']);
        $this->postJson("{$path}/check-in")->assertConflict();
        $this->assertDatabaseHas('rooms', ['id' => $rooms[0]->id, 'status' => 'available']);
        $rooms[1]->update(['status' => 'available']);
        $this->postJson("{$path}/check-in")->assertOk()->assertJsonPath('data.status', 'checked_in')
            ->assertJsonPath('data.booking_rooms.0.status', 'occupied')
            ->assertJsonPath('data.booking_rooms.1.status', 'occupied');
        $this->assertDatabaseHas('rooms', ['id' => $rooms[1]->id, 'status' => 'occupied']);

        $service = Service::create(['name' => 'Laundry', 'price' => 50000, 'is_available' => true]);
        $payload = [
            'booking_id' => $id,
            'room_id' => $rooms[2]->id,
            'items' => [['service_id' => $service->id, 'quantity' => 2]],
        ];
        $this->postJson('/api/staff/service-orders', $payload)->assertUnprocessable();
        $this->postJson('/api/staff/service-orders', array_replace($payload, ['room_id' => $rooms[1]->id]))
            ->assertCreated()->assertJsonPath('data.room_id', $rooms[1]->id)
            ->assertJsonPath('data.booking_room_id', $booking['booking_rooms'][1]['id']);
        $this->assertDatabaseCount('service_orders', 1);

        $preview = $this->getJson("{$path}/checkout")->assertOk()->json('data');
        $this->assertEquals($booking['total_room_amount'], $preview['room_charges']);
        $this->assertEquals($booking['deposit_amount'], $preview['deposit_deducted']);
        $this->assertEquals(100000, $preview['service_charges']);
        $checkout = ['amount' => $preview['remaining'], 'payment_method' => 'cash'];
        $this->postJson("{$path}/checkout", array_replace($checkout, ['amount' => 0]))->assertConflict();
        $this->assertDatabaseCount('invoices', 0);

        $invoice = $this->postJson("{$path}/checkout", $checkout)->assertOk()
            ->assertJsonPath('data.status', 'paid')->json('data');
        $this->assertNotNull($invoice['closed_at']);
        $this->postJson("{$path}/checkout", $checkout)->assertOk()->assertJsonPath('data.id', $invoice['id']);
        $this->assertDatabaseCount('invoices', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('housekeeping_tasks', 2);
        $this->assertDatabaseCount('housekeeping_events', 2);
        $this->assertDatabaseHas('service_orders', ['booking_id' => $id, 'is_paid' => true]);
        $this->assertDatabaseHas('rooms', ['id' => $rooms[1]->id, 'status' => 'dirty']);

        $tasks = $this->getJson('/api/staff/housekeeping/tasks')->assertOk()->assertJsonCount(2, 'data')->json('data');
        $task = '/api/staff/housekeeping/tasks/'.$tasks[0]['id'];
        $this->patchJson($task, ['status' => 'in_progress'])->assertForbidden();
        $housekeeper = User::factory()->create(['role' => 'housekeeping']);
        Sanctum::actingAs($housekeeper);
        $this->patchJson('/api/rooms/'.$tasks[0]['room_id'].'/status', ['status' => 'available'])->assertConflict();
        $this->patchJson($task, ['status' => 'done'])->assertConflict();
        $this->patchJson($task, ['status' => 'in_progress'])->assertOk();
        $this->patchJson($task, ['status' => 'done'])->assertOk();
        $this->patchJson($task, ['status' => 'done'])->assertOk();
        $this->assertDatabaseHas('housekeeping_events', [
            'task_id' => $tasks[0]['id'], 'actor_id' => $housekeeper->id, 'event_type' => 'completed',
            'from_status' => 'in_progress', 'to_status' => 'done',
        ]);
        $this->assertDatabaseCount('housekeeping_events', 4);
        $this->assertDatabaseHas('rooms', ['id' => $tasks[0]['room_id'], 'status' => 'available']);
        $this->assertDatabaseHas('rooms', ['id' => $tasks[1]['room_id'], 'status' => 'dirty']);
    }
}
