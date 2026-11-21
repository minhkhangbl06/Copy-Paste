<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_code',
        'booking_id',
        'booking_room_id',
        'room_id',
        'total_amount',
        'status',
        'charge_to_room',
        'is_paid',
        'notes',
    ];

    protected $casts = [
        'total_amount'   => 'decimal:2',
        'charge_to_room' => 'boolean',
        'is_paid'        => 'boolean',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class, 'booking_id');
    }

    public function bookingRoom(): BelongsTo
    {
        return $this->belongsTo(BookingRoom::class, 'booking_room_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ServiceOrderItem::class, 'service_order_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'service_order_id');
    }
}
