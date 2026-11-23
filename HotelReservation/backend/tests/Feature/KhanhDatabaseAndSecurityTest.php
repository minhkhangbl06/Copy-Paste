<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingRoom;
use App\Models\HousekeepingEvent;
use App\Models\HousekeepingTask;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Room;
use App\Models\RoomNight;
use App\Models\RoomType;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class KhanhDatabaseAndSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected User $guestA;
    protected User $guestB;
    protected User $receptionist;
    protected User $admin;
    protected Room $room101;
    protected Room $room102;
    protected RoomType $standardType;

    protected function setUp(): void
    {
        parent::setUp();

        $this->standardType = RoomType::create([
            'name'        => 'Standard Suite',
            'base_price'  => 500000,
            'max_guests'  => 2,
        ]);

        $this->room101 = Room::create([
            'room_number'     => '101',
            'room_type_id'    => $this->standardType->id,
            'room_type'       => 'Standard Suite',
            'price_per_night' => 500000,
            'status'          => 'available',
        ]);

        $this->room102 = Room::create([
            'room_number'     => '102',
            'room_type_id'    => $this->standardType->id,
            'room_type'       => 'Standard Suite',
            'price_per_night' => 500000,
            'status'          => 'available',
        ]);

        $this->guestA = User::create([
            'name'     => 'Guest A',
            'email'    => 'guesta@example.test',
            'password' => Hash::make('Password@123'),
            'role'     => 'guest',
            'status'   => 'ACTIVE',
        ]);

        $this->guestB = User::create([
            'name'     => 'Guest B',
            'email'    => 'guestb@example.test',
            'password' => Hash::make('Password@123'),
            'role'     => 'guest',
            'status'   => 'ACTIVE',
        ]);

        $this->receptionist = User::create([
            'name'     => 'Receptionist Staff',
            'email'    => 'staff@example.test',
            'password' => Hash::make('Password@123'),
            'role'     => 'receptionist',
            'status'   => 'ACTIVE',
        ]);

        $this->admin = User::create([
            'name'     => 'Admin Manager',
            'email'    => 'admin@example.test',
            'password' => Hash::make('Password@123'),
            'role'     => 'admin',
            'status'   => 'ACTIVE',
        ]);
    }

    /**
     * BR-Khanh-01: Ràng buộc mỗi booking tối đa một hóa đơn (invoices.booking_id UNIQUE).
     */
    public function test_booking_has_at_most_one_invoice_constraint(): void
    {
        $booking = Booking::create([
            'booking_code'      => 'BK-TEST-001',
            'user_id'           => $this->guestA->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest A',
            'guest_phone'       => '0901234567',
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        Invoice::create([
            'invoice_code' => 'INV-TEST-001',
            'booking_id'   => $booking->id,
            'total_amount' => 1000000,
            'status'       => 'unpaid',
        ]);

        $this->expectException(UniqueConstraintViolationException::class);

        // Tạo hóa đơn thứ 2 cho cùng 1 booking phải bị chặn bởi DB constraint
        Invoice::create([
            'invoice_code' => 'INV-TEST-002',
            'booking_id'   => $booking->id,
            'total_amount' => 500000,
            'status'       => 'unpaid',
        ]);
    }

    /**
     * BR-Khanh-02: Ràng buộc mỗi phòng chỉ xuất hiện 1 lần trong 1 đơn đặt phòng (booking_rooms UNIQUE).
     */
    public function test_booking_rooms_constraint_prevents_duplicate_room_in_same_booking(): void
    {
        $booking = Booking::create([
            'booking_code'      => 'BK-TEST-002',
            'user_id'           => $this->guestA->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest A',
            'guest_phone'       => '0901234567',
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        BookingRoom::create([
            'booking_id'        => $booking->id,
            'room_id'           => $this->room101->id,
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'price_per_night'   => 500000,
            'total_room_amount' => 1000000,
            'status'            => 'reserved',
        ]);

        $this->expectException(UniqueConstraintViolationException::class);

        // Thêm phòng 101 lần thứ 2 vào cùng booking phải bị chặn
        BookingRoom::create([
            'booking_id'        => $booking->id,
            'room_id'           => $this->room101->id,
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'price_per_night'   => 500000,
            'total_room_amount' => 1000000,
            'status'            => 'reserved',
        ]);
    }

    /**
     * BR-Khanh-03: Chống double-booking ở tầng DB: Mỗi phòng chỉ có 1 lượt giữ chỗ hiệu lực trong cùng 1 đêm.
     */
    public function test_room_nights_slot_prevents_double_booking_at_db_level(): void
    {
        $booking1 = Booking::create([
            'booking_code'      => 'BK-TEST-101',
            'user_id'           => $this->guestA->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest A',
            'guest_phone'       => '0901111111',
            'check_in_date'     => '2026-12-10',
            'check_out_date'    => '2026-12-12',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        $br1 = BookingRoom::create([
            'booking_id'        => $booking1->id,
            'room_id'           => $this->room101->id,
            'check_in_date'     => '2026-12-10',
            'check_out_date'    => '2026-12-12',
            'price_per_night'   => 500000,
            'total_room_amount' => 1000000,
            'status'            => 'reserved',
        ]);

        // Đêm ngày 2026-12-10 được giữ chỗ cho booking1
        RoomNight::create([
            'booking_room_id' => $br1->id,
            'room_id'         => $this->room101->id,
            'stay_date'       => '2026-12-10',
            'rate_applied'    => 500000,
            'status'          => 'reserved',
        ]);

        $booking2 = Booking::create([
            'booking_code'      => 'BK-TEST-102',
            'user_id'           => $this->guestB->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest B',
            'guest_phone'       => '0902222222',
            'check_in_date'     => '2026-12-10',
            'check_out_date'    => '2026-12-11',
            'total_room_amount' => 500000,
            'status'            => 'confirmed',
        ]);

        $br2 = BookingRoom::create([
            'booking_id'        => $booking2->id,
            'room_id'           => $this->room101->id,
            'check_in_date'     => '2026-12-10',
            'check_out_date'    => '2026-12-11',
            'price_per_night'   => 500000,
            'total_room_amount' => 500000,
            'status'            => 'reserved',
        ]);

        $this->expectException(UniqueConstraintViolationException::class);

        // Cố tình tạo room_night trùng phòng 101 và cùng ngày 2026-12-10 phải bị chặn ngay lập tức
        RoomNight::create([
            'booking_room_id' => $br2->id,
            'room_id'         => $this->room101->id,
            'stay_date'       => '2026-12-10',
            'rate_applied'    => 500000,
            'status'          => 'reserved',
        ]);
    }

    /**
     * BR-Khanh-04: Bảo mật IDOR: Guest A không thể xem đơn đặt phòng của Guest B.
     */
    public function test_guest_cannot_view_other_guests_booking(): void
    {
        $bookingB = Booking::create([
            'booking_code'      => 'BK-SECRET-B',
            'user_id'           => $this->guestB->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest B',
            'guest_phone'       => '0902222222',
            'check_in_date'     => '2026-12-15',
            'check_out_date'    => '2026-12-17',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        $tokenA = $this->guestA->createToken('token-a')->plainTextToken;

        // Guest A cố tình truy cập đơn của Guest B -> 403 Forbidden
        $response = $this->getJson("/api/bookings/{$bookingB->id}", [
            'Authorization' => "Bearer {$tokenA}",
        ]);

        $response->assertStatus(403)
                 ->assertJsonPath('status', 'error');
    }

    /**
     * BR-Khanh-05: Bảo mật IDOR: Guest A không thể xem hóa đơn của Guest B.
     */
    public function test_guest_cannot_view_other_guests_invoice(): void
    {
        $bookingB = Booking::create([
            'booking_code'      => 'BK-INV-B',
            'user_id'           => $this->guestB->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest B',
            'guest_phone'       => '0902222222',
            'check_in_date'     => '2026-12-15',
            'check_out_date'    => '2026-12-17',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        $invoiceB = Invoice::create([
            'invoice_code' => 'INV-SECRET-B',
            'booking_id'   => $bookingB->id,
            'total_amount' => 1000000,
            'status'       => 'unpaid',
        ]);

        $tokenA = $this->guestA->createToken('token-a')->plainTextToken;

        // Guest A cố tình truy cập hóa đơn của Guest B -> 403 Forbidden
        $response = $this->getJson("/api/invoices/{$invoiceB->id}", [
            'Authorization' => "Bearer {$tokenA}",
        ]);

        $response->assertStatus(403)
                 ->assertJsonPath('status', 'error');
    }

    /**
     * BR-Khanh-06: Nhân viên Lễ tân / Admin có thể xem được tất cả booking và invoice.
     */
    public function test_staff_can_view_any_booking_and_invoice(): void
    {
        $bookingB = Booking::create([
            'booking_code'      => 'BK-STAFF-TEST',
            'user_id'           => $this->guestB->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest B',
            'guest_phone'       => '0902222222',
            'check_in_date'     => '2026-12-15',
            'check_out_date'    => '2026-12-17',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        $invoiceB = Invoice::create([
            'invoice_code' => 'INV-STAFF-TEST',
            'booking_id'   => $bookingB->id,
            'total_amount' => 1000000,
            'status'       => 'unpaid',
        ]);

        $staffToken = $this->receptionist->createToken('staff-token')->plainTextToken;

        $this->getJson("/api/bookings/{$bookingB->id}", ['Authorization' => "Bearer {$staffToken}"])
             ->assertStatus(200)
             ->assertJsonPath('status', 'success');

        $this->getJson("/api/invoices/{$invoiceB->id}", ['Authorization' => "Bearer {$staffToken}"])
             ->assertStatus(200)
             ->assertJsonPath('status', 'success');
    }

    /**
     * BR-Khanh-07: Guest bị chặn gọi các API nhạy cảm của Staff (Check-in, Check-out, Thu tiền).
     */
    public function test_guest_denied_from_staff_operations(): void
    {
        $booking = Booking::create([
            'booking_code'      => 'BK-OPERATIONS',
            'user_id'           => $this->guestA->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest A',
            'guest_phone'       => '0901234567',
            'check_in_date'     => '2026-12-01',
            'check_out_date'    => '2026-12-03',
            'total_room_amount' => 1000000,
            'status'            => 'confirmed',
        ]);

        $tokenA = $this->guestA->createToken('guest-token')->plainTextToken;

        // Guest cố tình Check-in -> 403
        $this->postJson("/api/bookings/{$booking->id}/check-in", [], [
            'Authorization' => "Bearer {$tokenA}",
        ])->assertStatus(403);

        // Guest cố tình Check-out -> 403
        $this->postJson("/api/bookings/{$booking->id}/check-out", [], [
            'Authorization' => "Bearer {$tokenA}",
        ])->assertStatus(403);
    }

    /**
     * BR-Khanh-08: Khi hoàn tất Check-out, phòng chuyển sang 'dirty' và tự động tạo HOUSEKEEPING_TASK + HOUSEKEEPING_EVENT.
     */
    public function test_housekeeping_task_and_event_generated_on_checkout(): void
    {
        $this->room101->update(['status' => 'occupied']);

        $booking = Booking::create([
            'booking_code'      => 'BK-CLEAN-CHECK',
            'user_id'           => $this->guestA->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Khách Cần Dọn',
            'guest_phone'       => '0901234567',
            'check_in_date'     => '2026-11-20',
            'check_out_date'    => '2026-11-21',
            'total_room_amount' => 500000,
            'status'            => 'checked_in',
        ]);

        $staffToken = $this->receptionist->createToken('receptionist-token')->plainTextToken;

        $response = $this->postJson("/api/bookings/{$booking->id}/check-out", [], [
            'Authorization' => "Bearer {$staffToken}",
        ]);

        $response->assertStatus(200);

        // Kiểm tra phòng chuyển thành dirty
        $this->assertEquals('dirty', $this->room101->fresh()->status);

        // Kiểm tra housekeeping_tasks được tạo
        $task = HousekeepingTask::where('room_id', $this->room101->id)
            ->where('booking_id', $booking->id)
            ->first();

        $this->assertNotNull($task);
        $this->assertEquals('checkout_clean', $task->task_type);
        $this->assertEquals('pending', $task->status);

        // Kiểm tra housekeeping_events được ghi nhận
        $event = HousekeepingEvent::where('task_id', $task->id)->first();
        $this->assertNotNull($event);
        $this->assertEquals('task_created', $event->event_type);
        $this->assertEquals('pending', $event->to_status);
    }

    /**
     * BR-Khanh-09: Khi hủy booking, các lượt giữ chỗ (room_nights) được giải phóng để phòng khác có thể đặt lại.
     */
    public function test_cancelling_booking_releases_room_nights(): void
    {
        $booking = Booking::create([
            'booking_code'      => 'BK-CANCEL-TEST',
            'user_id'           => $this->guestA->id,
            'room_id'           => $this->room101->id,
            'guest_name'        => 'Guest A',
            'guest_phone'       => '0901234567',
            'check_in_date'     => now()->addDays(5)->toDateString(),
            'check_out_date'    => now()->addDays(7)->toDateString(),
            'total_room_amount' => 1000000,
            'deposit_amount'    => 300000,
            'status'            => 'confirmed',
        ]);

        $br = BookingRoom::create([
            'booking_id'        => $booking->id,
            'room_id'           => $this->room101->id,
            'check_in_date'     => $booking->check_in_date,
            'check_out_date'    => $booking->check_out_date,
            'price_per_night'   => 500000,
            'total_room_amount' => 1000000,
            'status'            => 'reserved',
        ]);

        RoomNight::create([
            'booking_room_id' => $br->id,
            'room_id'         => $this->room101->id,
            'stay_date'       => $booking->check_in_date,
            'rate_applied'    => 500000,
            'status'          => 'reserved',
        ]);

        $tokenA = $this->guestA->createToken('guest-token')->plainTextToken;

        $response = $this->postJson("/api/bookings/{$booking->id}/cancel", [], [
            'Authorization' => "Bearer {$tokenA}",
        ]);

        $response->assertStatus(200);

        // Kiểm tra room_nights đã được xóa để giải phóng chỗ
        $remainingNights = RoomNight::where('booking_room_id', $br->id)->count();
        $this->assertEquals(0, $remainingNights);
    }
}
