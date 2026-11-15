<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Booking extends Model
{
    use HasFactory;

    protected $table = 'bookings';

    protected $fillable = [
        'booking_code',
        'room_id',
        'user_id',
        'guest_name',
        'guest_phone',
        'guest_email',
        'check_in_date',
        'check_out_date',
        'check_in',
        'check_out',
        'actual_checkout_at',
        'total_room_amount',
        'total_nights',
        'total_price',
        'deposit_amount',
        'deposit_status',
        'status',
        'notes',
    ];

    protected $casts = [
        'check_in_date'      => 'date',
        'check_out_date'     => 'date',
        'check_in'           => 'date',
        'check_out'          => 'date',
        'actual_checkout_at' => 'datetime',
        'total_room_amount'  => 'decimal:2',
        'total_price'        => 'decimal:2',
        'deposit_amount'     => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'booking_id');
    }

    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class, 'booking_id');
    }

    public function scopeOverlappingStay(Builder $query, string $checkIn, string $checkOut): Builder
    {
        return $query->whereIn('status', ['pending', 'confirmed', 'checked_in'])
            ->whereDate('check_in_date', '<', $checkOut)
            ->whereDate('check_out_date', '>', $checkIn);
    }
}
