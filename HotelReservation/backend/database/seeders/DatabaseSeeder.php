<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\BookingRoom;
use App\Models\HousekeepingEvent;
use App\Models\HousekeepingTask;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Role;
use App\Models\Room;
use App\Models\RoomNight;
use App\Models\RoomRate;
use App\Models\RoomType;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make('Password@123');
        $roles = [
            ['role_code' => 'admin', 'role_name' => 'Quản trị viên / Quản lý', 'description' => 'Toàn quyền điều hành và cấu hình hệ thống'],
            ['role_code' => 'receptionist', 'role_name' => 'Lễ tân', 'description' => 'Quản lý đặt phòng, check-in, check-out và tiếp nhận yêu cầu của khách'],
            ['role_code' => 'billing', 'role_name' => 'Thu ngân', 'description' => 'Xử lý hóa đơn, thanh toán và báo cáo doanh thu'],
            ['role_code' => 'housekeeping', 'role_name' => 'Nhân viên buồng phòng', 'description' => 'Cập nhật tình trạng dọn phòng và kiểm tra phòng'],
            ['role_code' => 'service_staff', 'role_name' => 'Nhân viên dịch vụ', 'description' => 'Tiếp nhận và phục vụ các đơn gọi đồ ăn, minibar, spa'],
            ['role_code' => 'guest', 'role_name' => 'Khách hàng', 'description' => 'Tra cứu phòng, đặt phòng, gọi dịch vụ và xem hóa đơn của chính mình'],
        ];

        foreach ($roles as $r) {
            Role::updateOrCreate(['role_code' => $r['role_code']], $r);
        }
        $users = [
            [
                'name'     => 'Võ Giám Đốc (Admin/Manager)',
                'email'    => 'admin@hotel.example.test',
                'password' => $password,
                'role'     => 'admin',
                'phone'    => '0956789012',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Admin Root',
                'email'    => 'admin@hotel.com',
                'password' => bcrypt('password'),
                'role'     => 'admin',
                'phone'    => '0956789000',
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
                'name'     => 'Hoàng Thu Ngân (Billing)',
                'email'    => 'billing@hotel.example.test',
                'password' => $password,
                'role'     => 'billing',
                'phone'    => '0945678901',
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
                'name'     => 'Nguyễn Văn An (Guest 1)',
                'email'    => 'guest@hotel.example.test',
                'password' => $password,
                'role'     => 'guest',
                'phone'    => '0901234567',
                'status'   => 'ACTIVE',
            ],
            [
                'name'     => 'Lê Thị Bình (Guest 2)',
                'email'    => 'guest2@hotel.example.test',
                'password' => $password,
                'role'     => 'guest',
                'phone'    => '0909998888',
                'status'   => 'ACTIVE',
            ],
        ];
        $createdUsers = [];
        foreach ($users as $u) {
            $createdUsers[$u['email']] = User::updateOrCreate(['email' => $u['email']], $u);
        }

        $roomTypesData = [
            [
                'name'        => 'Standard Single',
                'base_price'  => 450000,
                'max_guests'  => 1,
                'bed_count'   => 1,
                'bed_type'    => 'Single',
                'area_sqm'    => 20.0,
                'amenities'   => ['wifi', 'ac', 'tv', 'desk', 'hot_water'],
                'description' => 'Phòng tiêu chuẩn 1 giường đơn ấm cúng, phù hợp cho khách đi công tác một mình.',
            ],
            [
                'name'        => 'Standard Double',
                'base_price'  => 600000,
                'max_guests'  => 2,
                'bed_count'   => 1,
                'bed_type'    => 'Queen',
                'area_sqm'    => 25.0,
                'amenities'   => ['wifi', 'ac', 'tv', 'refrigerator', 'hot_water'],
                'description' => 'Phòng tiêu chuẩn 1 giường đôi cho cặp đôi hoặc 2 người bạn.',
            ],
            [
                'name'        => 'Deluxe Double',
                'base_price'  => 850000,
                'max_guests'  => 2,
                'bed_count'   => 1,
                'bed_type'    => 'King',
                'area_sqm'    => 35.0,
                'amenities'   => ['wifi', 'ac', 'smart_tv', 'bathtub', 'minibar', 'balcony'],
                'description' => 'Phòng Deluxe sang trọng với ban công view vườn thoáng đãng và bồn tắm nằm thư giãn.',
            ],
            [
                'name'        => 'Suite Ocean View',
                'base_price'  => 1500000,
                'max_guests'  => 3,
                'bed_count'   => 2,
                'bed_type'    => 'King + SofaBed',
                'area_sqm'    => 55.0,
                'amenities'   => ['wifi', 'ac', 'smart_tv', 'jacuzzi', 'minibar', 'sea_view_balcony', 'espresso_machine'],
                'description' => 'Phòng Suite cao cấp nhìn thẳng ra biển, bồn sục Jacuzzi riêng và ban công ngắm hoàng hôn.',
            ],
            [
                'name'        => 'Family Suite',
                'base_price'  => 1800000,
                'max_guests'  => 4,
                'bed_count'   => 2,
                'bed_type'    => '2 Queens',
                'area_sqm'    => 65.0,
                'amenities'   => ['wifi', 'ac', 'smart_tv', 'bathtub', 'kitchenette', 'dining_table'],
                'description' => 'Không gian rộng rãi với 2 phòng ngủ kết nối, có bàn ăn và khu bếp nhẹ cho cả gia đình.',
            ],
        ];
        $roomTypeModels = [];
        foreach ($roomTypesData as $typeData) {
            $rt = RoomType::updateOrCreate(['name' => $typeData['name']], $typeData);
            $roomTypeModels[$rt->name] = $rt;

            for ($i = 0; $i < 7; $i++) {
                $date = Carbon::today()->addDays($i);
                $isWeekend = in_array($date->dayOfWeek, [Carbon::FRIDAY, Carbon::SATURDAY]);
                $rate = $isWeekend ? ($typeData['base_price'] * 1.15) : $typeData['base_price'];

                RoomRate::updateOrCreate(
                    [
                        'room_type_id' => $rt->id,
                        'stay_date'    => $date->toDateString(),
                    ],
                    [
                        'rate'      => $rate,
                        'rule_type' => $isWeekend ? 'WEEKEND' : 'BASE',
                    ]
                );
            }
        }
        $roomsData = [
            ['room_number' => '101', 'room_type_id' => $roomTypeModels['Deluxe Double']->id, 'room_type' => 'Deluxe Double', 'price_per_night' => 800000, 'floor' => 1, 'status' => 'occupied'],
            ['room_number' => '102', 'room_type_id' => $roomTypeModels['Standard Single']->id, 'room_type' => 'Standard Single', 'price_per_night' => 500000, 'floor' => 1, 'status' => 'available'],
            ['room_number' => '103', 'room_type_id' => $roomTypeModels['Standard Double']->id, 'room_type' => 'Standard Double', 'price_per_night' => 600000, 'floor' => 1, 'status' => 'dirty'],
            ['room_number' => '201', 'room_type_id' => $roomTypeModels['Deluxe Double']->id, 'room_type' => 'Deluxe Double', 'price_per_night' => 850000, 'floor' => 2, 'status' => 'occupied'],
            ['room_number' => '202', 'room_type_id' => $roomTypeModels['Deluxe Double']->id, 'room_type' => 'Deluxe Double', 'price_per_night' => 850000, 'floor' => 2, 'status' => 'available'],
            ['room_number' => '203', 'room_type_id' => $roomTypeModels['Deluxe Double']->id, 'room_type' => 'Deluxe Double', 'price_per_night' => 850000, 'floor' => 2, 'status' => 'maintenance'],
            ['room_number' => '301', 'room_type_id' => $roomTypeModels['Suite Ocean View']->id, 'room_type' => 'Suite Ocean View', 'price_per_night' => 1500000, 'floor' => 3, 'status' => 'occupied'],
            ['room_number' => '302', 'room_type_id' => $roomTypeModels['Suite Ocean View']->id, 'room_type' => 'Suite Ocean View', 'price_per_night' => 1500000, 'floor' => 3, 'status' => 'available'],
            ['room_number' => '401', 'room_type_id' => $roomTypeModels['Family Suite']->id, 'room_type' => 'Family Suite', 'price_per_night' => 1800000, 'floor' => 4, 'status' => 'available'],
            ['room_number' => '402', 'room_type_id' => $roomTypeModels['Family Suite']->id, 'room_type' => 'Family Suite', 'price_per_night' => 1800000, 'floor' => 4, 'status' => 'available'],
        ];

        $roomModels = [];
        foreach ($roomsData as $rd) {
            $r = Room::updateOrCreate(['room_number' => $rd['room_number']], $rd);
            $roomModels[$r->room_number] = $r;
        }

        $services = [
            ['name' => 'Phở Bò Đặc Biệt', 'category' => 'food', 'price' => 75000, 'unit' => 'tô', 'description' => 'Phở bò tái nạm gầu nóng hổi phục vụ tận phòng'],
            ['name' => 'Cơm Gà Hải Nam', 'category' => 'food', 'price' => 85000, 'unit' => 'phần', 'description' => 'Cơm gà kèm canh rong biển'],
            ['name' => 'Bò Bít Tết Úc Sốt Tiêu', 'category' => 'food', 'price' => 220000, 'unit' => 'phần', 'description' => 'Bò bít tết hảo hạng kèm khoai tây chiên'],
            ['name' => 'Coca Cola (Lon)', 'category' => 'minibar', 'price' => 25000, 'unit' => 'lon', 'description' => 'Nước giải khát ướp lạnh'],
            ['name' => 'Nước Suối Lavie 500ml', 'category' => 'minibar', 'price' => 15000, 'unit' => 'chai', 'description' => 'Nước suối khoáng đóng chai'],
            ['name' => 'Bia Heineken (Lon)', 'category' => 'minibar', 'price' => 35000, 'unit' => 'lon', 'description' => 'Bia nhập khẩu ướp lạnh'],
            ['name' => 'Giặt Sấy Lấy Liền', 'category' => 'laundry', 'price' => 60000, 'unit' => 'kg', 'description' => 'Giặt sấy ủi giao trong vòng 4 tiếng'],
            ['name' => 'Massage Body Tinh Dầu 60p', 'category' => 'spa', 'price' => 350000, 'unit' => 'vé', 'description' => 'Dịch vụ spa thư giãn tại phòng'],
            ['name' => 'Đưa Đón Sân Bay', 'category' => 'transport', 'price' => 250000, 'unit' => 'chuyến', 'description' => 'Xe 7 chỗ đón tiễn sân bay theo giờ hẹn'],
        ];

        foreach ($services as $svc) {
            Service::updateOrCreate(['name' => $svc['name']], $svc);
        }

        Booking::updateOrCreate(
            ['booking_code' => 'BK-20261104-001'],
            [
                'room_id'           => $roomModels['101']->id,
                'guest_name'        => 'Nguyen Van A',
                'guest_phone'       => '0901234567',
                'check_in_date'     => '2026-11-02',
                'check_out_date'    => '2026-11-04',
                'total_room_amount' => 1600000,
                'deposit_amount'    => 500000,
                'status'            => 'checked_in',
            ]
        );

        $guest1 = $createdUsers['guest@hotel.example.test'];
        $checkIn = Carbon::today();
        $checkOut = Carbon::today()->addDays(2);

        $multiBooking = Booking::updateOrCreate(
            ['booking_code' => 'BK-20261121-001'],
            [
                'room_id'           => $roomModels['201']->id,
                'user_id'           => $guest1->id,
                'guest_name'        => $guest1->name,
                'guest_phone'       => $guest1->phone,
                'guest_email'       => $guest1->email,
                'check_in_date'     => $checkIn->toDateString(),
                'check_out_date'    => $checkOut->toDateString(),
                'total_room_amount' => (850000 * 2) + (1500000 * 2),
                'deposit_amount'    => 1500000,
                'status'            => 'checked_in',
            ]
        );

        $br1 = BookingRoom::updateOrCreate(
            ['booking_id' => $multiBooking->id, 'room_id' => $roomModels['201']->id],
            [
                'check_in_date'     => $checkIn->toDateString(),
                'check_out_date'    => $checkOut->toDateString(),
                'price_per_night'   => 850000,
                'total_room_amount' => 1700000,
                'status'            => 'occupied',
            ]
        );

        $br2 = BookingRoom::updateOrCreate(
            ['booking_id' => $multiBooking->id, 'room_id' => $roomModels['301']->id],
            [
                'check_in_date'     => $checkIn->toDateString(),
                'check_out_date'    => $checkOut->toDateString(),
                'price_per_night'   => 1500000,
                'total_room_amount' => 3000000,
                'status'            => 'occupied',
            ]
        );

        RoomNight::updateOrCreate(
            ['room_id' => $roomModels['201']->id, 'stay_date' => $checkIn->toDateString()],
            ['booking_room_id' => $br1->id, 'rate_applied' => 850000, 'status' => 'occupied']
        );
        RoomNight::updateOrCreate(
            ['room_id' => $roomModels['201']->id, 'stay_date' => $checkIn->copy()->addDay()->toDateString()],
            ['booking_room_id' => $br1->id, 'rate_applied' => 850000, 'status' => 'occupied']
        );
        RoomNight::updateOrCreate(
            ['room_id' => $roomModels['301']->id, 'stay_date' => $checkIn->toDateString()],
            ['booking_room_id' => $br2->id, 'rate_applied' => 1500000, 'status' => 'occupied']
        );
        RoomNight::updateOrCreate(
            ['room_id' => $roomModels['301']->id, 'stay_date' => $checkIn->copy()->addDay()->toDateString()],
            ['booking_room_id' => $br2->id, 'rate_applied' => 1500000, 'status' => 'occupied']
        );

        $sampleInvoice = Invoice::updateOrCreate(
            ['booking_id' => $multiBooking->id],
            [
                'invoice_code'      => 'INV-20261121-001',
                'room_charges'      => 4700000,
                'service_charges'   => 100000,
                'late_checkout_fee' => 0,
                'other_surcharges'  => 0,
                'deposit_deducted'  => 1500000,
                'tax_amount'        => 0,
                'total_amount'      => 3300000,
                'status'            => 'unpaid',
                'issued_at'         => now(),
            ]
        );

        InvoiceItem::updateOrCreate(
            ['invoice_id' => $sampleInvoice->id, 'item_type' => 'room_night', 'description' => 'Phòng 201 - Đêm 1 (' . $checkIn->toDateString() . ')'],
            ['amount' => 850000]
        );
        InvoiceItem::updateOrCreate(
            ['invoice_id' => $sampleInvoice->id, 'item_type' => 'room_night', 'description' => 'Phòng 201 - Đêm 2 (' . $checkIn->copy()->addDay()->toDateString() . ')'],
            ['amount' => 850000]
        );
        InvoiceItem::updateOrCreate(
            ['invoice_id' => $sampleInvoice->id, 'item_type' => 'room_night', 'description' => 'Phòng 301 - Đêm 1 (' . $checkIn->toDateString() . ')'],
            ['amount' => 1500000]
        );
        InvoiceItem::updateOrCreate(
            ['invoice_id' => $sampleInvoice->id, 'item_type' => 'room_night', 'description' => 'Phòng 301 - Đêm 2 (' . $checkIn->copy()->addDay()->toDateString() . ')'],
            ['amount' => 1500000]
        );
        InvoiceItem::updateOrCreate(
            ['invoice_id' => $sampleInvoice->id, 'item_type' => 'deposit', 'description' => 'Khấu trừ tiền cọc đã đặt trước'],
            ['amount' => -1500000]
        );
        
        $housekeepingStaff = $createdUsers['housekeeping@hotel.example.test'];
        $dirtyRoom = $roomModels['103'];

        $task = HousekeepingTask::updateOrCreate(
            ['room_id' => $dirtyRoom->id, 'status' => 'pending'],
            [
                'task_type'    => 'checkout_clean',
                'assigned_to'  => $housekeepingStaff->id,
                'notes'        => 'Khách vừa check-out lúc sáng, cần thay drap giường và bổ sung khăn tắm mới.',
                'scheduled_at' => now(),
            ]
        );

        HousekeepingEvent::create([
            'task_id'     => $task->id,
            'actor_id'    => $housekeepingStaff->id,
            'event_type'  => 'task_created',
            'from_status' => null,
            'to_status'   => 'pending',
            'note'        => 'Lễ tân hoàn tất check-out và hệ thống tự động gán task cho nhân viên buồng phòng.',
        ]);
    }
}
