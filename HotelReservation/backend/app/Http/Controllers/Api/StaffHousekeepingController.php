<?php

namespace App\Http\Controllers\Api;

use App\Models\HousekeepingTask;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StaffHousekeepingController
{
    public function index(): JsonResponse
    {
        $tasks = HousekeepingTask::with(['events' => fn ($events) => $events->orderBy('id')->with('actor:id,name')])
            ->latest('id')->get();

        return response()->json(['status' => 'success', 'data' => $tasks]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => 'required|in:in_progress,done']);
        $initial = HousekeepingTask::findOrFail($id);

        return DB::transaction(function () use ($request, $id, $initial, $data) {
            $room = Room::lockForUpdate()->findOrFail($initial->room_id);
            $task = HousekeepingTask::lockForUpdate()->findOrFail($id);
            $next = $data['status'];
            if ($task->status !== $next) {
                $expected = $next === 'in_progress' ? 'pending' : 'in_progress';
                abort_unless($task->status === $expected && $room->status === 'dirty', 409,
                    'Trạng thái phòng hoặc công việc đã thay đổi.');
                $task->events()->create([
                    'actor_id' => $request->user()->id,
                    'event_type' => $next === 'in_progress' ? 'started' : 'completed',
                    'from_status' => $task->status,
                    'to_status' => $next,
                ]);
                $task->update(['status' => $next, 'completed_at' => $next === 'done' ? now() : null]);
                if ($next === 'done') {
                    $room->update(['status' => 'available']);
                }
            }

            return response()->json(['status' => 'success', 'data' => $task->load('events.actor:id,name')]);
        });
    }
}
