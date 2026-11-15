<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Booking extends Model
{
    use HasFactory;

    protected $fillable = [
        'booking_code',
        'room_id',
        'user_id',
        'guest_name',
        'guest_phone',
        'guest_email',
        'check_in',
        'check_out',
        'total_nights',
        'total_price',
        'deposit_amount',
        'deposit_status',
        'status',
        'notes',
    ];

    protected $casts = [
        'check_in'       => 'date',
        'check_out'      => 'date',
        'total_price'    => 'decimal:2',
        'deposit_amount' => 'decimal:2',
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
}
