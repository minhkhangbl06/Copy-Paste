<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'invoice_id',
        'item_type',
        'description',
        'reference_id',
        'reference_type',
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }
}
