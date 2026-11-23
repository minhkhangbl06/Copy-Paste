<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_rooms')) {
            Schema::create('booking_rooms', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('room_id')->constrained('rooms');
                $table->date('check_in_date');
                $table->date('check_out_date');
                $table->decimal('price_per_night', 12, 2);
                $table->decimal('total_room_amount', 12, 2)->default(0);
                $table->string('status', 30)->default('reserved'); // reserved, occupied, checked_out, cancelled
                $table->timestamps();

                // Ràng buộc: Mỗi phòng chỉ xuất hiện tối đa 1 lần trong cùng 1 booking
                $table->unique(['booking_id', 'room_id'], 'uq_booking_room');
                $table->index(['room_id', 'check_in_date', 'check_out_date']);
                $table->index(['booking_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_rooms');
    }
};
