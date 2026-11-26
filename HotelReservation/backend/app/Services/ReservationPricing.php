<?php

namespace App\Services;

use Carbon\CarbonInterface;

class ReservationPricing
{
    public static function nightlyRates(CarbonInterface $checkIn, CarbonInterface $checkOut, float $basePrice): array
    {
        $nights = [];
        for ($date = $checkIn->copy(); $date->lt($checkOut); $date = $date->addDay()) {
            $rate = $date->isFriday() || $date->isSaturday() ? round($basePrice * 1.15, 2) : round($basePrice, 2);
            $nights[] = [
                'stay_date' => $date->toDateString(),
                'rate'      => $rate,
            ];
        }

        return $nights;
    }

    public static function quote(CarbonInterface $checkIn, CarbonInterface $checkOut, float $basePrice): array
    {
        $nights = self::nightlyRates($checkIn, $checkOut, $basePrice);
        $total = array_sum(array_column($nights, 'rate'));
        $deposit = count($nights) >= 2 ? max($total * 0.3, $basePrice) : 0.0;

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