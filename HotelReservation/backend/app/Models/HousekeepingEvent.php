<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HousekeepingEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'actor_id',
        'event_type',
        'from_status',
        'to_status',
        'note',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(HousekeepingTask::class, 'task_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
