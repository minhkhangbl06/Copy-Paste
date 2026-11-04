<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_code',
        'booking_id',
        'room_id',
        'total_amount',
        'status',
        'charge_to_room',
        'is_paid',
        'notes',
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'charge_to_room' => 'boolean',
        'is_paid' => 'boolean',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function items()
    {
        return $this->hasMany(ServiceOrderItem::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
