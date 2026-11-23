<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            if (!Schema::hasColumn('rooms', 'room_type_id')) {
                $table->foreignId('room_type_id')->nullable()->after('room_number')
                      ->constrained('room_types')->nullOnDelete();
            }
            if (!Schema::hasColumn('rooms', 'floor')) {
                $table->integer('floor')->default(1)->after('status');
            }
            if (!Schema::hasColumn('rooms', 'is_active')) {
                $table->boolean('is_active')->default(true)->after('floor');
            }
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            if (Schema::hasColumn('rooms', 'room_type_id')) {
                $table->dropForeign(['room_type_id']);
                $table->dropColumn('room_type_id');
            }
            if (Schema::hasColumn('rooms', 'floor')) {
                $table->dropColumn('floor');
            }
            if (Schema::hasColumn('rooms', 'is_active')) {
                $table->dropColumn('is_active');
            }
        });
    }
};
