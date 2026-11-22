<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('invoice_items')) {
            Schema::create('invoice_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
                $table->string('item_type', 30); // room_night, service, late_fee, surcharge, discount, deposit
                $table->string('description', 255);
                $table->unsignedBigInteger('reference_id')->nullable(); // id của room_night hoặc service_order_item
                $table->string('reference_type', 60)->nullable(); // 'room_night', 'service_order_item'
                $table->decimal('amount', 12, 2); // dương: khoản thu; âm: khấu trừ cọc, giảm giá
                $table->timestamps();

                $table->index(['invoice_id', 'item_type']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_items');
    }
};
