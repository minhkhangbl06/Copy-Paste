<?php

namespace Tests\Unit;

use App\Models\Booking;
use App\Services\InvoiceCalculationService;
use App\Services\LateCheckoutService;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class InvoiceCalculationServiceTest extends TestCase
{
    #[DataProvider('amounts')]
    public function test_invoice_amounts(float $deposit, float $tax, float $total): void
    {
        $orders = Mockery::mock(HasMany::class);
        $orders->expects('where')->with('charge_to_room', true)->andReturnSelf();
        $orders->expects('where')->with('is_paid', false)->andReturnSelf();
        $orders->expects('where')->with('status', '!=', 'cancelled')->andReturnSelf();
        $orders->expects('with')->with('items.service')->andReturnSelf();
        $orders->expects('get')->andReturn(collect([['total_amount' => 75000]]));

        $booking = Mockery::mock(Booking::class)->makePartial();
        $booking->fill(['total_room_amount' => 800000, 'deposit_amount' => $deposit]);
        $booking->setRelation('room', null);
        $booking->expects('serviceOrders')->andReturn($orders);

        $lateCheckout = Mockery::mock(LateCheckoutService::class);
        $lateCheckout->expects('calculate')->with($booking, null)->andReturn(['late_fee' => 240000]);

        $charges = (new InvoiceCalculationService($lateCheckout))
            ->calculateBookingCharges($booking, otherSurcharges: 35000)['charges'];

        $this->assertSame(1150000.0, $charges['subtotal']);
        $this->assertSame($deposit, $charges['deposit_deducted']);
        $this->assertSame($tax, $charges['tax_amount']);
        $this->assertSame($total, $charges['total_amount']);
    }

    public static function amounts(): array
    {
        return [
            'deposit reduces amount owed' => [500000.0, 52000.0, 702000.0],
            'deposit covers all charges' => [1200000.0, 0.0, 0.0],
        ];
    }
}
