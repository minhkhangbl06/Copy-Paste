<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RoomType extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'base_price',
        'max_guests',
        'bed_count',
        'bed_type',
        'area_sqm',
        'amenities',
        'description',
    ];

    protected $casts = [
        'base_price' => 'decimal:2',
        'max_guests' => 'integer',
        'bed_count'  => 'integer',
        'area_sqm'   => 'decimal:2',
        'amenities'  => 'array',
    ];

    public function rooms(): HasMany
    {
        return $this->hasMany(Room::class, 'room_type_id');
    }

    public function rates(): HasMany
    {
        return $this->hasMany(RoomRate::class, 'room_type_id');
    }
}
