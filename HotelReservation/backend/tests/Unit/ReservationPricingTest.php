<?php

namespace Tests\Unit;

use App\Services\ReservationPricing;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ReservationPricingTest extends TestCase
{
    #[DataProvider('stays')]
    public function test_nightly_total_and_deposit(int $nights, float $total, float $deposit): void
    {
        $friday = CarbonImmutable::parse('2026-11-13');

        $this->assertSame([$total, $deposit], ReservationPricing::quote($friday, $friday->addDays($nights), 500000));
    }

    public static function stays(): array
    {
        return [
            'one night, no deposit' => [1, 575000.0, 0.0],
            'two weekend nights, base price deposit' => [2, 1150000.0, 500000.0],
            'four nights, 30 percent deposit' => [4, 2150000.0, 645000.0],
        ];
    }

    #[DataProvider('cancellationTimes')]
    public function test_refund_rate_at_policy_boundaries(float $hours, float $rate): void
    {
        $this->assertSame($rate, ReservationPricing::refundRate($hours));
    }

    public static function cancellationTimes(): array
    {
        return [
            '48 hours' => [48, 1.0],
            'just below 48' => [47.99, 0.5],
            '24 hours' => [24, 0.5],
            'just below 24' => [23.99, 0.0],
            'after check-in' => [-1, 0.0],
        ];
    }
}
