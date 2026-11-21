<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Bảng booking_rooms (liên kết nhiều phòng trong 1 booking)
        if (!Schema::hasTable('booking_rooms')) {
            Schema::create('booking_rooms', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('room_id')->constrained('rooms')->cascadeOnDelete();
                $table->date('check_in_date');
                $table->date('check_out_date');
                $table->decimal('price_per_night', 12, 2)->default(0);
                $table->decimal('total_room_amount', 12, 2)->default(0);
                $table->string('status', 30)->default('RESERVED');
                $table->timestamps();
            });
        }

        // 2. Bảng room_nights (lưu giá và ngày ở từng đêm của từng phòng)
        if (!Schema::hasTable('room_nights')) {
            Schema::create('room_nights', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_room_id')->constrained('booking_rooms')->cascadeOnDelete();
                $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
                $table->date('stay_date');
                $table->decimal('rate', 12, 2)->default(0);
                $table->decimal('price', 12, 2)->nullable();
                $table->timestamps();
            });
        }

        // 3. Gắn booking_room_id vào service_orders để biết dịch vụ được gọi từ phòng nào
        if (Schema::hasTable('service_orders')) {
            Schema::table('service_orders', function (Blueprint $table) {
                if (!Schema::hasColumn('service_orders', 'booking_room_id')) {
                    $table->foreignId('booking_room_id')->nullable()->constrained('booking_rooms')->nullOnDelete();
                }
            });
        }

        // 4. Lưu đơn giá và thành tiền theo chuẩn ERD trong service_order_items
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

        // 5. Bảng invoice_items lưu chi tiết từng đêm, dịch vụ theo phòng và phụ thu phát sinh
        if (!Schema::hasTable('invoice_items')) {
            Schema::create('invoice_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
                $table->foreignId('booking_room_id')->nullable()->constrained('booking_rooms')->nullOnDelete();
                $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
                $table->string('item_type', 50); // room_night, service, late_checkout, surcharge, discount
                $table->string('description');
                $table->integer('quantity')->default(1);
                $table->decimal('unit_price', 12, 2)->default(0);
                $table->decimal('amount', 12, 2)->default(0);
                $table->timestamps();
            });
        }

        // 6. Thêm closed_at vào invoices nếu chưa có
        if (Schema::hasTable('invoices')) {
            Schema::table('invoices', function (Blueprint $table) {
                if (!Schema::hasColumn('invoices', 'closed_at')) {
                    $table->dateTime('closed_at')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_items');

        if (Schema::hasTable('service_orders') && Schema::hasColumn('service_orders', 'booking_room_id')) {
            Schema::table('service_orders', function (Blueprint $table) {
                $table->dropConstrainedForeignId('booking_room_id');
            });
        }

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

        Schema::dropIfExists('room_nights');
        Schema::dropIfExists('booking_rooms');
    }
};
