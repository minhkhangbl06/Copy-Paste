<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Room;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 10 Standard (500.000 VNĐ / đêm)
        for ($i = 1; $i <= 10; $i++) {
            $roomNum = '1' . str_pad($i, 2, '0', STR_PAD_LEFT);
            Room::updateOrCreate(['room_number' => $roomNum], [
                'room_type'       => 'Standard',
                'price_per_night' => 500000,
                'status'          => 'available'
            ]);
        }

        // 10 Deluxe (800.000 VNĐ / đêm)
        for ($i = 1; $i <= 10; $i++) {
            $roomNum = '2' . str_pad($i, 2, '0', STR_PAD_LEFT);
            Room::updateOrCreate(['room_number' => $roomNum], [
                'room_type'       => 'Deluxe',
                'price_per_night' => 800000,
                'status'          => 'available'
            ]);
        }

        // 5 Family (1.200.000 VNĐ / đêm)
        for ($i = 1; $i <= 5; $i++) {
            $roomNum = '3' . str_pad($i, 2, '0', STR_PAD_LEFT);
            Room::updateOrCreate(['room_number' => $roomNum], [
                'room_type'       => 'Family',
                'price_per_night' => 1200000,
                'status'          => 'available'
            ]);
        }

        // 5 Suite (1.500.000 VNĐ / đêm)
        for ($i = 1; $i <= 5; $i++) {
            $roomNum = '4' . str_pad($i, 2, '0', STR_PAD_LEFT);
            Room::updateOrCreate(['room_number' => $roomNum], [
                'room_type'       => 'Suite',
                'price_per_night' => 1500000,
                'status'          => 'available'
            ]);
        }
    }
}
