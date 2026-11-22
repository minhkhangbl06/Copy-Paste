<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Room extends Model
{
    use HasFactory;

    protected $table = 'rooms';

    protected $fillable = [
        'room_number',
        'room_type_id',
        'room_type',
        'price_per_night',
        'status',
        'floor',
        'is_active',
    ];

    protected $casts = [
        'price_per_night' => 'decimal:2',
        'floor'           => 'integer',
        'is_active'       => 'boolean',
    ];

    public function roomType(): BelongsTo
    {
        return $this->belongsTo(RoomType::class, 'room_type_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'room_id');
    }

    public function bookingRooms(): HasMany
    {
        return $this->hasMany(BookingRoom::class, 'room_id');
    }

    public function roomNights(): HasMany
    {
        return $this->hasMany(RoomNight::class, 'room_id');
    }

    public function housekeepingTasks(): HasMany
    {
        return $this->hasMany(HousekeepingTask::class, 'room_id');
    }
}
