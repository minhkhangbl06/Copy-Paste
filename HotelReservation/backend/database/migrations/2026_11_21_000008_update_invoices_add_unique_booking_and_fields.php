<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            // Ràng buộc: Mỗi booking chỉ có tối đa 1 hóa đơn
            $table->unique('booking_id', 'uq_invoice_booking');

            if (!Schema::hasColumn('invoices', 'closed_at')) {
                $table->dateTime('closed_at')->nullable()->after('paid_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropUnique('uq_invoice_booking');
            if (Schema::hasColumn('invoices', 'closed_at')) {
                $table->dropColumn('closed_at');
            }
        });
    }
};
