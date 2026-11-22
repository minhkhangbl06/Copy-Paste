<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HousekeepingTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_id',
        'booking_id',
        'assigned_to',
        'task_type',
        'status',
        'notes',
        'scheduled_at',
        'completed_at',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class, 'booking_id');
    }

    public function assignedStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function events(): HasMany
    {
        return $this->hasMany(HousekeepingEvent::class, 'task_id');
    }
}
