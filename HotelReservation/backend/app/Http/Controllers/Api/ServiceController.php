<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    /**
     * Lấy danh sách dịch vụ (khách hoặc nhân viên xem).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Service::query();

        // Lọc theo danh mục nếu có: food, laundry, spa, minibar,...
        if ($request->filled('category')) {
            $query->where('category', $request->query('category'));
        }

        // Tìm kiếm theo tên
        if ($request->filled('search')) {
            $query->where('name', 'like', '%' . $request->query('search') . '%');
        }

        // Mặc định chỉ lấy dịch vụ đang mở phục vụ (is_available = true)
        if ($request->boolean('all') !== true) {
            $query->where('is_available', true);
        }

        $services = $query->orderBy('category')->orderBy('name')->get();

        return response()->json([
            'status' => 'success',
            'data' => $services,
        ]);
    }

    /**
     * Xem chi tiết 1 dịch vụ.
     */
    public function show(int $id): JsonResponse
    {
        $service = Service::find($id);

        if (!$service) {
            return response()->json([
                'status' => 'error',
                'message' => 'Không tìm thấy dịch vụ.',
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => $service,
        ]);
    }

    /**
     * Thêm mới dịch vụ vào menu/danh mục (Dành cho Quản trị viên/Staff).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'category' => 'nullable|string|max:100',
            'price' => 'required|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'description' => 'nullable|string',
            'is_available' => 'nullable|boolean',
        ]);

        $service = Service::create($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Thêm dịch vụ thành công.',
            'data' => $service,
        ], 201);
    }
}
