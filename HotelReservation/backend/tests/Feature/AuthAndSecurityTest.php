<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthAndSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_can_register_and_receives_token(): void
    {
        $payload = [
            'name'     => 'Khách Thử Nghiệm',
            'email'    => 'testguest@example.com',
            'password' => 'Password@123',
            'phone'    => '0987654321',
        ];

        $response = $this->postJson('/api/auth/register', $payload);

        $response->assertStatus(201)
                 ->assertJsonPath('status', 'success')
                 ->assertJsonPath('data.user.email', 'testguest@example.com')
                 ->assertJsonPath('data.user.role', 'guest');

        $this->assertDatabaseHas('users', [
            'email' => 'testguest@example.com',
            'role'  => 'guest'
        ]);
    }

    public function test_guest_cannot_self_assign_admin_role_on_register(): void
    {
        $payload = [
            'name'     => 'Hacker',
            'email'    => 'hacker@example.com',
            'password' => 'Password@123',
            'role'     => 'admin', 
        ];

        $response = $this->postJson('/api/auth/register', $payload);
        $response->assertStatus(422);
    }

    public function test_login_success_and_logout_revokes_token(): void
    {
        $user = User::create([
            'name'     => 'Nguyễn Văn A',
            'email'    => 'user@example.com',
            'password' => Hash::make('Password@123'),
            'role'     => 'guest',
            'status'   => 'ACTIVE',
        ]);

        $loginResponse = $this->postJson('/api/auth/login', [
            'email'    => 'user@example.com',
            'password' => 'Password@123',
        ]);

        $loginResponse->assertStatus(200)
                      ->assertJsonPath('status', 'success');

        $token = $loginResponse->json('data.access_token');
        $this->assertNotEmpty($token);

        $meResponse = $this->getJson('/api/auth/me', [
            'Authorization' => 'Bearer ' . $token
        ]);
        $meResponse->assertStatus(200)
                   ->assertJsonPath('data.email', 'user@example.com');

        $logoutResponse = $this->postJson('/api/auth/logout', [], [
            'Authorization' => 'Bearer ' . $token
        ]);
        $logoutResponse->assertStatus(204);

        $this->getJson('/api/auth/me', [
            'Authorization' => 'Bearer ' . $token
        ])->assertStatus(401);
    }

    public function test_rbac_denies_guest_from_admin_and_billing_endpoints(): void
    {
        $guest = User::create([
            'name'     => 'Khách',
            'email'    => 'guest123@example.com',
            'password' => Hash::make('Password@123'),
            'role'     => 'guest',
            'status'   => 'ACTIVE',
        ]);

        $token = $guest->createToken('test')->plainTextToken;

        $this->postJson('/api/services', ['name' => 'Fake Service'], [
            'Authorization' => 'Bearer ' . $token
        ])->assertStatus(403);

        $this->postJson('/api/invoices/1/close', [], [
            'Authorization' => 'Bearer ' . $token
        ])->assertStatus(403);
    }
}
