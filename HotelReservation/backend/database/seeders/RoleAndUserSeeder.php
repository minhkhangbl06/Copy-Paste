<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class RoleAndUserSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make('Password@123');

        $accounts = [
            [
                'name'     => 'Nguyễn Văn An (Guest)',
                'email'    => 'guest@hotel.example.test',
                'password' => $password,
                'role'     => 'guest',
                'phone'    => '0901234567',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Trần Thị Lễ Tân (Receptionist)',
                'email'    => 'receptionist@hotel.example.test',
                'password' => $password,
                'role'     => 'receptionist',
                'phone'    => '0912345678',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Lê Văn Buồng Phòng (Housekeeping)',
                'email'    => 'housekeeping@hotel.example.test',
                'password' => $password,
                'role'     => 'housekeeping',
                'phone'    => '0923456789',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Phạm Bếp Trưởng (Room Service)',
                'email'    => 'service@hotel.example.test',
                'password' => $password,
                'role'     => 'service_staff',
                'phone'    => '0934567890',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Hoàng Thu Ngân (Billing)',
                'email'    => 'billing@hotel.example.test',
                'password' => $password,
                'role'     => 'billing',
                'phone'    => '0945678901',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Võ Giám Đốc (Admin/Manager)',
                'email'    => 'admin@hotel.example.test',
                'password' => $password,
                'role'     => 'admin',
                'phone'    => '0956789012',
                'status'   => 'ACTIVE',
            ],
        ];

        foreach ($accounts as $acc) {
            User::updateOrCreate(['email' => $acc['email']], $acc);
        }
    }
}
