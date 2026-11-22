<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomNight extends Model
{
    use HasFactory;

    protected $fillable = [
        'booking_room_id',
        'room_id',
        'stay_date',
        'rate_applied',
        'status',
    ];

    protected $casts = [
        'stay_date'    => 'date',
        'rate_applied' => 'decimal:2',
    ];

    public function bookingRoom(): BelongsTo
    {
        return $this->belongsTo(BookingRoom::class, 'booking_room_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id');
    }
}
