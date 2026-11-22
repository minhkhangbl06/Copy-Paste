<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('housekeeping_tasks')) {
            Schema::create('housekeeping_tasks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('room_id')->constrained('rooms');
                $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->string('task_type', 40)->default('checkout_clean'); // checkout_clean, daily_refresh, maintenance, deep_clean
                $table->string('status', 30)->default('pending'); // pending, in_progress, done, cancelled
                $table->text('notes')->nullable();
                $table->dateTime('scheduled_at')->nullable();
                $table->dateTime('completed_at')->nullable();
                $table->timestamps();

                $table->index(['room_id', 'status']);
                $table->index(['assigned_to', 'status']);
                $table->index('booking_id');
            });
        }

        if (!Schema::hasTable('housekeeping_events')) {
            Schema::create('housekeeping_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('task_id')->constrained('housekeeping_tasks')->cascadeOnDelete();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('event_type', 60); // task_created, started, paused, completed, reassigned, cancelled
                $table->string('from_status', 30)->nullable();
                $table->string('to_status', 30)->nullable();
                $table->text('note')->nullable();
                $table->timestamps();

                $table->index('task_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('housekeeping_events');
        Schema::dropIfExists('housekeeping_tasks');
    }
};
