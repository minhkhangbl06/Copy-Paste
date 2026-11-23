<?php

namespace App\Providers;

use App\Models\Booking;
use App\Models\Invoice;
use App\Policies\BookingPolicy;
use App\Policies\InvoicePolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
   
    public function register(): void
    {
        
    }

    
    public function boot(): void
    {
        config(['sanctum.guard' => []]);
        Gate::policy(Booking::class, BookingPolicy::class);
        Gate::policy(Invoice::class, InvoicePolicy::class);

        RateLimiter::for('register', fn (Request $request) =>
            Limit::perMinutes(15, 10)->by($request->ip())
        );
        RateLimiter::for('login', function (Request $request): array {
            $email = $request->input('email');
            $account = is_string($email) ? Str::lower(trim($email)) : '';

            return [
                Limit::perMinutes(15, 30)->by('ip:'.$request->ip()),
                Limit::perMinutes(15, 10)->by('account:'.hash('sha256', $account)),
            ];
        });
    }
}
