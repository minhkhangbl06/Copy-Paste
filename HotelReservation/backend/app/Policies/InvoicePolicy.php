<?php

namespace App\Policies;

use App\Models\Invoice;
use App\Models\User;

class InvoicePolicy
{
    /**
     * Xác định người dùng có được phép xem danh sách hóa đơn không.
     */
    public function viewAny(User $user): bool
    {
        return true; // Guest xem được hóa đơn của mình, Staff xem được toàn bộ
    }

    /**
     * Xác định người dùng có được phép xem hóa đơn chi tiết không.
     * Guest chỉ được xem hóa đơn thuộc về đơn đặt phòng của chính mình (chống IDOR).
     */
    public function view(User $user, Invoice $invoice): bool
    {
        if ($user->hasRole('admin', 'receptionist', 'billing', 'manager')) {
            return true;
        }

        // Guest: Chỉ được xem nếu hóa đơn liên kết với booking của chính mình
        return $invoice->booking && $invoice->booking->user_id === $user->id;
    }

    /**
     * Chỉ nhân viên thu ngân, lễ tân hoặc admin mới có quyền ghi nhận thanh toán và đóng hóa đơn.
     */
    public function update(User $user, Invoice $invoice): bool
    {
        return $user->hasRole('admin', 'receptionist', 'billing', 'manager');
    }

    public function close(User $user, Invoice $invoice): bool
    {
        return $user->hasRole('admin', 'billing', 'manager');
    }
}
