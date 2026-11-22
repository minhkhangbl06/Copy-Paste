<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('room_rates')) {
            Schema::create('room_rates', function (Blueprint $table) {
                $table->id();
                $table->foreignId('room_type_id')->constrained('room_types')->cascadeOnDelete();
                $table->date('stay_date');
                $table->decimal('rate', 12, 2);
                $table->string('rule_type', 30)->default('BASE'); // BASE, WEEKEND, HOLIDAY, PROMOTION
                $table->timestamps();

                $table->unique(['room_type_id', 'stay_date'], 'uq_room_type_stay_date');
                $table->index(['room_type_id', 'stay_date']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('room_rates');
    }
};
