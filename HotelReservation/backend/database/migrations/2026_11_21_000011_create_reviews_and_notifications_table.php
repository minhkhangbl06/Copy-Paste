<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('reviews')) {
            Schema::create('reviews', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->unsignedTinyInteger('rating'); // 1 đến 5 sao
                $table->text('comment')->nullable();
                $table->boolean('is_visible')->default(true);
                $table->timestamps();

                $table->unique('booking_id', 'uq_review_booking'); // Mỗi booking chỉ được đánh giá 1 lần
                $table->index(['user_id', 'rating']);
            });
        }

        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('type', 60); // booking_confirmed, checkout_reminder, invoice_ready, service_update
                $table->string('title', 255);
                $table->text('body')->nullable();
                $table->json('data')->nullable();
                $table->dateTime('read_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'read_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('reviews');
    }
};
