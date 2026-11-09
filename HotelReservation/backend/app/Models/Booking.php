<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    use HasFactory;

    protected $table = 'bookings';

    protected $fillable = [
        'booking_code',
        'room_id',
        'guest_name',
        'guest_phone',
        'check_in_date',
        'check_out_date',
        'actual_checkout_at',
        'total_room_amount',
        'deposit_amount',
        'status',
    ];

    protected $casts = [
        'check_in_date'     => 'date',
        'check_out_date'    => 'date',
        'actual_checkout_at'=> 'datetime',
        'total_room_amount' => 'decimal:2',
        'deposit_amount'    => 'decimal:2',
    ];

    public function room()
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    public function serviceOrders()
    {
        return $this->hasMany(ServiceOrder::class);
    }

    public function scopeOverlappingStay(Builder $query, string $checkIn, string $checkOut): Builder
    {
        return $query->whereIn('status', ['pending', 'confirmed', 'checked_in'])
            ->whereDate('check_in_date', '<', $checkOut)
            ->whereDate('check_out_date', '>', $checkIn);
    }
}
