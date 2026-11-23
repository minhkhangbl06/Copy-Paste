<?php

namespace App\Policies;

use App\Models\Booking;
use App\Models\User;

class BookingPolicy
{
    public function view(User $user, Booking $booking): bool
    {
        if ($user->hasRole('admin', 'receptionist', 'manager', 'billing')) {
            return true;
        }

        return $booking->user_id !== null && $booking->user_id === $user->id;
    }

    public function update(User $user, Booking $booking): bool
    {
        if ($user->hasRole('admin', 'receptionist', 'manager')) {
            return true;
        }

        return $booking->user_id !== null && $booking->user_id === $user->id;
    }

    public function cancel(User $user, Booking $booking): bool
    {
        if ($user->hasRole('admin', 'receptionist', 'manager')) {
            return true;
        }

        return $booking->user_id !== null && $booking->user_id === $user->id;
    }

    public function checkIn(User $user, Booking $booking): bool
    {
        return $user->hasRole('admin', 'receptionist', 'manager');
    }

    public function checkOut(User $user, Booking $booking): bool
    {
        return $user->hasRole('admin', 'receptionist', 'manager');
    }
}
