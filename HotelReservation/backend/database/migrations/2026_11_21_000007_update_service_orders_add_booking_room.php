<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('service_orders', 'booking_room_id')) {
                $table->foreignId('booking_room_id')->nullable()->after('booking_id')
                      ->constrained('booking_rooms')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            if (Schema::hasColumn('service_orders', 'booking_room_id')) {
                $table->dropForeign(['booking_room_id']);
                $table->dropColumn('booking_room_id');
            }
        });
    }
};
