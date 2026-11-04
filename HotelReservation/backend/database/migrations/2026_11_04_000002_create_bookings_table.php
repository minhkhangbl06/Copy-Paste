<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->string('booking_code')->unique();
            $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
            $table->string('guest_name');
            $table->string('guest_phone')->nullable();
            $table->date('check_in_date');
            $table->date('check_out_date'); // Giờ chuẩn check-out là 12:00 trưa
            $table->dateTime('actual_checkout_at')->nullable();
            $table->decimal('total_room_amount', 12, 2)->default(0);
            $table->decimal('deposit_amount', 12, 2)->default(0);
            $table->enum('status', ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'])->default('confirmed');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
