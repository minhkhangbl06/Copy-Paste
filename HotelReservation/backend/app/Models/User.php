<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\HasMany;


class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
    
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'national_id',
        'status',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];
    
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at'     => 'datetime',
            'password' => 'hashed',
        ];
    }
    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'user_id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class, 'user_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'user_id');
    }

    public function housekeepingTasks(): HasMany
    {
        return $this->hasMany(HousekeepingTask::class, 'assigned_to');
    }
    
    public function hasRole(string ...$roles): bool
    {
        $userRole = strtolower($this->role ?? 'guest');
        $allowed = array_map('strtolower', $roles);
        if (in_array('admin', $allowed, true) && in_array($userRole, ['admin', 'manager'], true)) {
            return true;
        }
        return in_array($userRole, $allowed, true);
    }

    public function isStaff(): bool
    {
        return in_array(strtolower($this->role ?? ''), ['admin', 'manager', 'receptionist', 'billing', 'housekeeping', 'service_staff'], true);
    }

    public function isAdmin(): bool
    {
        return in_array(strtolower($this->role ?? ''), ['admin', 'manager'], true);
    }

    public function isGuest(): bool
    {
        return strtolower($this->role ?? 'guest') === 'guest';
    }
}
