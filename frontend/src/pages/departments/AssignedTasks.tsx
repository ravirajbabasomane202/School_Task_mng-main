import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import Button from '../../components/common/Button';
import TaskTableRouter from '../../components/tables/TaskTableRouter';
import * as taskService from '../../services/taskService';
import { setTasks, upsertTask } from '../../store/taskSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { downloadCsv } from '../../utils/fileDownload';
import { todayISO, formatDate } from '../../utils/dateUtils';
import type { Task, TaskStatus } from '../../types/task.types';

function AssignedTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'my-tasks'],
    queryFn: taskService.getMyTasks
  });

  useEffect(() => {
    if (tasksQuery.data) {
      dispatch(setTasks(tasksQuery.data));
    }
  }, [dispatch, tasksQuery.data]);

  const handleStatusChange = async (taskId: number, newStatus: TaskStatus, proofFile?: File) => {
    try {
      const updated = await taskService.updateTaskStatus(taskId, newStatus, proofFile);
      dispatch(upsertTask(updated));
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}.`);
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'my-tasks'] });
    } catch {
      toast.error('Failed to update task status. Please try again.');
      throw new Error('Status update failed');
    }
  };

  // Exports exactly the tasks currently shown on this page (already scoped
  // to the signed-in user by the /tasks/my-tasks endpoint) — no separate
  // API call, so the export can never include anything not already
  // authorized and visible here.
  const handleExport = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['Task', 'Assigned To', 'Priority', 'Status', 'Start Date', 'Due Date', 'Completed At'],
      ...tasks.map((t: Task) => [
        t.title,
        t.assignedTo?.name ?? t.assignedToName ?? '',
        t.priority,
        t.status,
        formatDate(t.start_date),
        formatDate(t.due_date),
        t.completed_at ? formatDate(t.completed_at) : '',
      ]),
    ];
    downloadCsv(`my-tasks_${todayISO()}.csv`, rows);
  };

  return (
    <section className="space-y-5 p-5">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Department Tasks
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Assigned tasks</h2>
            <p className="mt-2 text-sm leading-6 text-[#5B6E8C]">
              Review your queue, update task status, and upload proof when completing tasks.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={handleExport} disabled={tasks.length === 0}>
            <Download size={14} />
            Export CSV
          </Button>
        </div>
      </div>

      <TaskTableRouter
        tasks={tasks}
        emptyMessage="Tasks assigned to your department will appear here."
        onStatusChange={handleStatusChange}
      />
    </section>
  );
}

export default AssignedTasks;
