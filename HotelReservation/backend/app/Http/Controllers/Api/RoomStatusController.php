<?php

namespace App\Http\Controllers\Api;

use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoomStatusController
{
    public function update(Request $request, int|string $id): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', 'in:clean,available,dirty,cleaning,maintenance'],
            'note'   => ['nullable', 'string', 'max:255'],
        ]);

        $room = Room::findOrFail($id);

        $status = strtolower($data['status']);
        if ($status === 'clean') {
            $status = 'available';
        }

        if ($status === 'maintenance' && $request->user()->role !== 'admin') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Chỉ quản trị viên mới có quyền đặt phòng vào trạng thái bảo trì.'
            ], 403);
        }

        if (strtolower($room->status) === 'occupied' && $status !== 'occupied') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không thể đổi trạng thái phòng đang có khách lưu trú.'
            ], 409);
        }

        $room->update(['status' => $status]);

        return response()->json([
            'status'  => 'success',
            'message' => "Đã cập nhật trạng thái phòng {$room->room_number} thành {$status}.",
            'data'    => $room
        ]);
    }
}
