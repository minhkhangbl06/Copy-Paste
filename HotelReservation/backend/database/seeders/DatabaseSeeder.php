<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\Room;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database with sample data.
     */
    public function run(): void
    {
        // 1. Tạo User mẫu
        User::firstOrCreate(
            ['email' => 'admin@hotel.com'],
            ['name' => 'Admin Receptionist', 'password' => bcrypt('password')]
        );

        // 2. Tạo Phòng mẫu (Rooms)
        $room101 = Room::updateOrCreate(
            ['room_number' => '101'],
            ['room_type' => 'Deluxe Double', 'price_per_night' => 800000, 'status' => 'occupied']
        );

        $room102 = Room::updateOrCreate(
            ['room_number' => '102'],
            ['room_type' => 'Standard Single', 'price_per_night' => 500000, 'status' => 'available']
        );

        // 3. Tạo Danh mục dịch vụ mẫu (Services)
        $services = [
            ['name' => 'Phở Bò Đặc Biệt', 'category' => 'food', 'price' => 75000, 'unit' => 'tô', 'description' => 'Phở bò tái nạm gầu nóng hổi phục vụ tận phòng'],
            ['name' => 'Cơm Gà Hải Nam', 'category' => 'food', 'price' => 85000, 'unit' => 'phần', 'description' => 'Cơm gà kèm canh rong biển'],
            ['name' => 'Coca Cola (Lon)', 'category' => 'minibar', 'price' => 25000, 'unit' => 'lon', 'description' => 'Nước giải khát ướp lạnh'],
            ['name' => 'Nước Suối Lavie 500ml', 'category' => 'minibar', 'price' => 15000, 'unit' => 'chai', 'description' => 'Nước suối khoóng đóng chai'],
            ['name' => 'Giặt Sấy Lấy Liền', 'category' => 'laundry', 'price' => 60000, 'unit' => 'kg', 'description' => 'Giặt sấy ủi giao trong vòng 4 tiếng'],
            ['name' => 'Massage Body Tinh Dầu 60p', 'category' => 'spa', 'price' => 350000, 'unit' => 'vé', 'description' => 'Dịch vụ spa thư giãn tại phòng'],
        ];

        foreach ($services as $svc) {
            Service::updateOrCreate(['name' => $svc['name']], $svc);
        }

        // 4. Tạo Booking mẫu đang ở (Checked-in) để test tính hóa đơn và checkout
        Booking::updateOrCreate(
            ['booking_code' => 'BK-20261104-001'],
            [
                'room_id' => $room101->id,
                'guest_name' => 'Nguyen Van A',
                'guest_phone' => '0901234567',
                'check_in_date' => '2026-11-02',
                'check_out_date' => '2026-11-04',
                'total_room_amount' => 1600000,
                'deposit_amount' => 500000,
                'status' => 'checked_in',
            ]
        );
    }
}
