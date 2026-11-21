<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceOrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'service_order_id',
        'service_id',
        'quantity',
        'price_at_order',
        'unit_price',
        'subtotal',
        'amount',
    ];

    protected $casts = [
        'quantity'       => 'integer',
        'price_at_order' => 'decimal:2',
        'unit_price'     => 'decimal:2',
        'subtotal'       => 'decimal:2',
        'amount'         => 'decimal:2',
    ];

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_id');
    }

    public function getUnitPriceAttribute(): float
    {
        return (float) ($this->attributes['unit_price'] ?? $this->attributes['price_at_order'] ?? 0);
    }

    public function getAmountAttribute(): float
    {
        return (float) ($this->attributes['amount'] ?? $this->attributes['subtotal'] ?? 0);
    }
}
