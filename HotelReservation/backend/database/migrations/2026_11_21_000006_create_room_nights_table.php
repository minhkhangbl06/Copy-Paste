<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('room_nights')) {
            Schema::create('room_nights', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_room_id')->constrained('booking_rooms')->cascadeOnDelete();
                $table->foreignId('room_id')->constrained('rooms')->cascadeOnDelete();
                $table->date('stay_date');
                $table->decimal('rate_applied', 12, 2);
                $table->string('status', 30)->default('reserved'); // reserved, occupied, released
                $table->timestamps();

                // Ràng buộc bảo vệ chống double-booking:
                // Một phòng chỉ được giữ chỗ tối đa 1 lần trong 1 đêm cụ thể
                $table->unique(['room_id', 'stay_date'], 'uq_room_night_slot');
                $table->unique(['booking_room_id', 'stay_date'], 'uq_booking_room_night');
                $table->index(['room_id', 'stay_date', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('room_nights');
    }
};
