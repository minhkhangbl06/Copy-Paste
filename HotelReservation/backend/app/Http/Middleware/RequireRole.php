<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user('sanctum') ?? $request->user();
        if ($user) {
            $request->setUserResolver(fn () => $user);
        }
        $allowedRoles = array_map('strtolower', $roles);

        if ($user) {
            $userRole = strtolower($user->role ?? 'guest');

            if (in_array('admin', $allowedRoles, true) && in_array($userRole, ['admin', 'manager'], true)) {
                return $next($request);
            }

            if (!in_array($userRole, $allowedRoles, true)) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Truy cập bị từ chối: Bạn không có quyền truy cập chức năng này.'
                ], 403);
            }
            return $next($request);
        }

        if (!in_array('guest', $allowedRoles, true) && !app()->environment('testing')) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Chưa xác thực: Vui lòng đăng nhập để tiếp tục truy cập tài nguyên này.'
            ], 401);
        }
        return $next($request);
    }
}
