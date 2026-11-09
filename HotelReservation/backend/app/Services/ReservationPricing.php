<?php

namespace App\Services;

use Carbon\CarbonInterface;

class ReservationPricing
{
    public static function quote(CarbonInterface $checkIn, CarbonInterface $checkOut, float $basePrice): array
    {
        $total = 0.0;
        for ($date = $checkIn->copy(); $date->lt($checkOut); $date = $date->addDay()) {
            $total += $date->isFriday() || $date->isSaturday() ? $basePrice * 1.15 : $basePrice;
        }

        $deposit = $checkIn->diffInDays($checkOut) >= 2 ? max($total * 0.3, $basePrice) : 0.0;

        return [round($total, 2), round($deposit, 2)];
    }

    public static function refundRate(float $hoursRemaining): float
    {
        if ($hoursRemaining >= 48) {
            return 1.0;
        }

        return $hoursRemaining >= 24 ? 0.5 : 0.0;
    }
}
