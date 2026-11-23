<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('room_types')) {
            Schema::create('room_types', function (Blueprint $table) {
                $table->id();
                $table->string('name', 100)->unique();
                $table->decimal('base_price', 12, 2)->default(500000);
                $table->unsignedTinyInteger('max_guests')->default(2);
                $table->unsignedTinyInteger('bed_count')->default(1);
                $table->string('bed_type', 50)->default('King');
                $table->decimal('area_sqm', 6, 2)->nullable();
                $table->json('amenities')->nullable();
                $table->text('description')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('room_types');
    }
};
