<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookingRoom extends Model
{
    use HasFactory;

    protected $fillable = [
        'booking_id',
        'room_id',
        'check_in_date',
        'check_out_date',
        'price_per_night',
        'total_room_amount',
        'status',
    ];

    protected $casts = [
        'check_in_date'     => 'date',
        'check_out_date'    => 'date',
        'price_per_night'   => 'decimal:2',
        'total_room_amount' => 'decimal:2',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class, 'booking_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    public function roomNights(): HasMany
    {
        return $this->hasMany(RoomNight::class, 'booking_room_id');
    }

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'booking_room_id');
    }
}
