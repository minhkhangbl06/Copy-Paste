<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_orders')) {
            Schema::table('service_orders', function (Blueprint $table) {
                if (!Schema::hasColumn('service_orders', 'booking_room_id')) {
                    $table->foreignId('booking_room_id')->nullable()->after('booking_id')
                          ->constrained('booking_rooms')->nullOnDelete();
                }
            });
        }

        if (Schema::hasTable('service_order_items')) {
            Schema::table('service_order_items', function (Blueprint $table) {
                if (!Schema::hasColumn('service_order_items', 'unit_price')) {
                    $table->decimal('unit_price', 12, 2)->nullable();
                }
                if (!Schema::hasColumn('service_order_items', 'amount')) {
                    $table->decimal('amount', 12, 2)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('service_order_items')) {
            Schema::table('service_order_items', function (Blueprint $table) {
                if (Schema::hasColumn('service_order_items', 'unit_price')) {
                    $table->dropColumn('unit_price');
                }
                if (Schema::hasColumn('service_order_items', 'amount')) {
                    $table->dropColumn('amount');
                }
            });
        }

        if (Schema::hasTable('service_orders')) {
            Schema::table('service_orders', function (Blueprint $table) {
                if (Schema::hasColumn('service_orders', 'booking_room_id')) {
                    $table->dropForeign(['booking_room_id']);
                    $table->dropColumn('booking_room_id');
                }
            });
        }
    }
};
