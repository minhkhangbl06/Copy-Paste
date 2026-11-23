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
                $table->foreignId('booking_room_id')->nullable()->constrained('booking_rooms')->nullOnDelete();
                $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
                $table->string('item_type', 50); // room_night, service, late_checkout, surcharge, discount, deposit
                $table->string('description', 255);
                $table->unsignedBigInteger('reference_id')->nullable();
                $table->string('reference_type', 60)->nullable();
                $table->integer('quantity')->default(1);
                $table->decimal('unit_price', 12, 2)->default(0);
                $table->decimal('amount', 12, 2)->default(0);
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
