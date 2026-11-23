<?php

namespace App\Http\Controllers\Api;

use App\Models\Room;
use App\Models\HousekeepingTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RoomStatusController
{
    public function update(Request $request, int|string $id): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', 'in:clean,available,dirty,cleaning,maintenance'],
            'note'   => ['nullable', 'string', 'max:255'],
        ]);

        $status = strtolower($data['status']);
        if ($status === 'clean') {
            $status = 'available';
        } elseif ($status === 'cleaning') {
            $status = 'dirty';
        }

        if ($status === 'maintenance' && $request->user() && $request->user()->role !== 'admin') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Chỉ quản trị viên mới có quyền đặt phòng vào trạng thái bảo trì.'
            ], 403);
        }

        $room = DB::transaction(function () use ($id, $status) {
            $room = Room::lockForUpdate()->findOrFail($id);
            abort_if(strtolower($room->status) === 'occupied', 409, 'Không thể đổi trạng thái phòng đang có khách lưu trú.');
            $activeTask = HousekeepingTask::where('room_id', $room->id)
                ->whereIn('status', ['pending', 'in_progress'])->exists();
            abort_if($activeTask, 409, 'Hãy cập nhật công việc dọn phòng để lưu lịch sử.');
            $room->update(['status' => $status]);

            return $room;
        });

        return response()->json([
            'status'  => 'success',
            'message' => "Đã cập nhật trạng thái phòng {$room->room_number} thành {$status}.",
            'data'    => $room
        ]);
    }
}
