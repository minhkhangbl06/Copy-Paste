<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    use HasFactory;

    protected $fillable = [
        'invoice_code',
        'booking_id',
        'room_charges',
        'service_charges',
        'late_checkout_fee',
        'other_surcharges',
        'deposit_deducted',
        'tax_amount',
        'total_amount',
        'status',
        'issued_at',
        'paid_at',
        'closed_at',
        'notes',
    ];

    protected $casts = [
        'room_charges'      => 'decimal:2',
        'service_charges'   => 'decimal:2',
        'late_checkout_fee' => 'decimal:2',
        'other_surcharges'  => 'decimal:2',
        'deposit_deducted'  => 'decimal:2',
        'tax_amount'        => 'decimal:2',
        'total_amount'      => 'decimal:2',
        'issued_at'         => 'datetime',
        'paid_at'           => 'datetime',
        'closed_at'         => 'datetime',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class, 'booking_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class, 'invoice_id');
    }

    public function invoiceItems(): HasMany
    {
        return $this->hasMany(InvoiceItem::class, 'invoice_id');
    }
}
