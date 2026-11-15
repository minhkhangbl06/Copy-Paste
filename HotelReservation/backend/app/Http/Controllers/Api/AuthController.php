<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController
{
    public function register(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);

        $data = $request->validate([
            'name'     => ['required', 'string', 'min:2', 'max:255'],
            'email'    => ['required', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', 'min:8', 'max:72', function ($attribute, $value, $fail): void {
                if (is_string($value) && (strlen($value) > 72 || str_contains($value, "\0"))) {
                    $fail('Mật khẩu tối đa 72 bytes và không chứa null bytes.');
                }
            }],
            'phone'    => ['nullable', 'string', 'max:20'],
            'role'     => ['missing'], 
        ], [
            'password.min' => 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.',
            'role.missing' => 'Không được phép tự chỉ định vai trò khi đăng ký.',
        ]);

        try {
            $data['role'] = 'guest';
            $data['status'] = 'ACTIVE';
            $user = User::create($data)->refresh();

            try {
                DB::table('audit_logs')->insert([
                    'actor_id'    => $user->id,
                    'action'      => 'REGISTER',
                    'entity_type' => 'USER',
                    'entity_id'   => $user->id,
                    'ip_address'  => $request->ip(),
                    'created_at'  => now(),
                ]);
            } catch (\Throwable $e) {}
        } catch (UniqueConstraintViolationException) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Email này đã tồn tại trong hệ thống.'
            ], 409);
        }

        $token = $user->createToken('hotel-auth', ['*'], now()->addHours(8))->plainTextToken;

        return response()->json([
            'status'  => 'success',
            'message' => 'Đăng ký tài khoản thành công.',
            'data'    => [
                'user'         => $this->profile($user),
                'access_token' => $token,
                'token_type'   => 'Bearer',
                'expires_in'   => 28800,
            ]
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);

        $data = $request->validate([
            'email'    => ['required', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', 'max:72'],
        ]);

        if (strlen($data['password']) > 72 || str_contains($data['password'], "\0")) {
            return $this->invalidCredentials();
        }

        $user = User::where('email', $data['email'])->first();

        $dummyHash = '$2y$12$C6UzMDM.H6dfI/f/IKxGhuBvRwU13qkXFRSLMXvXAdL6.LlNG5xrW';
        $hashToCheck = $user?->password ?? $dummyHash;

        if (!Hash::check($data['password'], $hashToCheck) || !$user) {
            return $this->invalidCredentials();
        }

        if ($user->status && $user->status !== 'ACTIVE') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.'
            ], 403);
        }

        $user->update(['last_login_at' => now()]);

        try {
            DB::table('audit_logs')->insert([
                'actor_id'    => $user->id,
                'action'      => 'LOGIN',
                'entity_type' => 'USER',
                'entity_id'   => $user->id,
                'ip_address'  => $request->ip(),
                'created_at'  => now(),
            ]);
        } catch (\Throwable $e) {}

        $token = $user->createToken('hotel-auth', ['*'], now()->addHours(8))->plainTextToken;

        return response()->json([
            'status'  => 'success',
            'message' => 'Đăng nhập thành công.',
            'data'    => [
                'access_token' => $token,
                'token_type'   => 'Bearer',
                'expires_in'   => 28800,
                'user'         => $this->profile($user),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data'   => $this->profile($request->user())
        ])->header('Cache-Control', 'no-store');
    }

    public function logout(Request $request): Response
    {
        $user = $request->user();
        if ($user) {
            $token = $user->currentAccessToken();
            if ($token && method_exists($token, 'delete')) {
                $token->delete();
            }
            if (method_exists($user, 'tokens')) {
                $user->tokens()->delete();
            }

            try {
                DB::table('audit_logs')->insert([
                    'actor_id'    => $user->id,
                    'action'      => 'LOGOUT',
                    'entity_type' => 'USER',
                    'entity_id'   => $user->id,
                    'ip_address'  => $request->ip(),
                    'created_at'  => now(),
                ]);
            } catch (\Throwable $e) {}
        }

        if (function_exists('auth')) {
            auth()->forgetGuards();
        }

        return response()->noContent();
    }

    private function invalidCredentials(): JsonResponse
    {
        return response()->json([
            'status'  => 'error',
            'message' => 'Email hoặc mật khẩu không chính xác.'
        ], 401);
    }

    private function normalizeEmail(Request $request): void
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => Str::lower(trim($request->input('email')))]);
        }
    }

    private function profile(User $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'role'          => $user->role ?? 'guest',
            'phone'         => $user->phone,
            'status'        => $user->status ?? 'ACTIVE',
            'last_login_at' => $user->last_login_at,
        ];
    }
}
