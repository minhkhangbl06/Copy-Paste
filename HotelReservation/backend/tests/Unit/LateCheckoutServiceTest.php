<?php

namespace Tests\Unit;

use App\Models\Booking;
use App\Models\Room;
use App\Services\LateCheckoutService;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LateCheckoutServiceTest extends TestCase
{
    #[DataProvider('checkoutTimes')]
    public function test_fee_at_checkout_boundaries(string $time, bool $late, int $minutes, float $fee): void
    {
        $booking = new Booking(['check_out_date' => '2026-11-13']);
        $booking->setRelation('room', new Room(['price_per_night' => 800000]));

        $result = (new LateCheckoutService)->calculate($booking, Carbon::parse($time));

        $this->assertSame($late, $result['is_late']);
        $this->assertSame($minutes, $result['minutes_late']);
        $this->assertSame($fee, $result['late_fee']);
    }

    public static function checkoutTimes(): array
    {
        return [
            'early' => ['2026-11-13 11:59', false, 0, 0.0],
            'grace boundary' => ['2026-11-13 12:30', false, 30, 0.0],
            'after grace' => ['2026-11-13 12:31', true, 31, 240000.0],
            'first tier boundary' => ['2026-11-13 15:00', true, 180, 240000.0],
            'after first tier' => ['2026-11-13 15:00:01', true, 180, 400000.0],
            'second tier boundary' => ['2026-11-13 18:00', true, 360, 400000.0],
            'after second tier' => ['2026-11-13 18:01', true, 361, 800000.0],
            'next day' => ['2026-11-14 09:00', true, 1260, 800000.0],
        ];
    }
}
