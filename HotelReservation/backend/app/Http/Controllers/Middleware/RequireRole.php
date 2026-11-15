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

        if ($user) {
            $userRole = strtolower($user->role ?? 'guest');
            $allowedRoles = array_map('strtolower', $roles);

            if (in_array('admin', $allowedRoles, true) && in_array($userRole, ['admin', 'manager'], true)) {
                return $next($request);
            }

            if (!in_array($userRole, $allowedRoles, true)) {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Truy cập bị từ chối: Bạn không có quyền truy cập chức năng này.'
                ], 403);
            }
        }

        return $next($request);
    }
}
