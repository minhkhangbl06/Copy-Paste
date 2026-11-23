<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomRate extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_type_id',
        'stay_date',
        'rate',
        'rule_type',
    ];

    protected $casts = [
        'stay_date' => 'date',
        'rate'      => 'decimal:2',
    ];

    public function roomType(): BelongsTo
    {
        return $this->belongsTo(RoomType::class, 'room_type_id');
    }
}
