import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import Button from '../../components/common/Button';
import TaskTable from '../../components/tables/TaskTable';
import { ROLE_LABELS, ROLES } from '../../constants/roles';
import { getRoleLabel } from '../../utils/roleUtils';
import * as reportService from '../../services/reportService';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import { setTasks } from '../../store/taskSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { Task, TaskStatus } from '../../types/task.types';
import type { User } from '../../types/user.types';

const statCards: Array<{ color: string; key: TaskStatus; label: string }> = [
  { color: 'bg-[#EAF3FC] text-[#185FA5]', key: 'PENDING', label: 'Pending' },
  { color: 'bg-[#FFF7E1] text-[#A86A00]', key: 'IN_PROGRESS', label: 'In Progress' },
  { color: 'bg-[#EDF9F1] text-[#2E7D4F]', key: 'COMPLETED', label: 'Completed' },
  { color: 'bg-[#FFF1F1] text-[#C13F3A]', key: 'DELAYED', label: 'Delayed' }
];

const toDateValue = (value?: string | null) => {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().slice(0, 10);
};

const inferReportType = (from: string, to: string): reportService.ReportType => {
  if (!from || !to) {
    return 'DAILY';
  }

  const start = new Date(from);
  const end = new Date(to);
  const diffDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  if (diffDays === 1) {
    return 'DAILY';
  }

  if (diffDays >= 28 && diffDays <= 31) {
    return 'MONTHLY';
  }

  if (diffDays >= 7 && diffDays <= 13) {
    return 'WEEKLY';
  }

  return 'CUSTOM';
};

const currentDateValue = () => new Date().toISOString().slice(0, 10);

function TaskMonitoring() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const { user } = useAppSelector((state) => state.auth);
  const [searchParams] = useSearchParams();
  const initialStatus = (searchParams.get('status') as TaskStatus | null) ?? 'ALL';
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>(initialStatus);
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);

  const taskQuery = useQuery({
    queryKey: ['tasks', 'monitoring'],
    queryFn: () => taskService.getAllTasks()
  });

  const usersQuery = useQuery({
    queryKey: ['users', 'monitoring'],
    queryFn: () => userService.getAllUsers()
  });

  useEffect(() => {
    if (taskQuery.data) {
      dispatch(setTasks(taskQuery.data));
    }
  }, [dispatch, taskQuery.data]);

  const counts = useMemo(
    () =>
      statCards.reduce<Record<TaskStatus, number>>(
        (acc, card) => {
          acc[card.key] = tasks.filter((task) => task.status === card.key).length;
          return acc;
        },
        {
          PENDING: 0,
          IN_PROGRESS: 0,
          COMPLETED: 0,
          DELAYED: 0,
          ESCALATED: 0
        }
      ),
    [tasks]
  );

  const assignableUsers = useMemo(
    () => (usersQuery.data ?? []).filter((user: User) => user.is_active),
    [usersQuery.data]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task: Task) => {
      if (statusFilter !== 'ALL' && task.status !== statusFilter) {
        return false;
      }

      if (assigneeFilter !== 'all' && String(task.assigned_to) !== assigneeFilter) {
        return false;
      }

      if (searchFilter.trim()) {
        const query = searchFilter.trim().toLowerCase();
        const haystack = [
          task.title,
          task.description ?? '',
          task.assignedTo?.name ?? task.assignedToName ?? ''
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      const taskStart = toDateValue(task.start_date);
      const taskDue = toDateValue(task.due_date);

      if (dateFrom && taskDue && taskDue < dateFrom) {
        return false;
      }

      if (dateTo && taskStart && taskStart > dateTo) {
        return false;
      }

      return true;
    });
  }, [assigneeFilter, dateFrom, dateTo, searchFilter, statusFilter, tasks]);

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      setIsExporting(format);
      await reportService.exportReportFile({
        reportType: inferReportType(dateFrom, dateTo),
        format,
        params: {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          assignedTo: assigneeFilter !== 'all' ? Number(assigneeFilter) : undefined,
          search: searchFilter.trim() || undefined,
          startDateFrom: dateFrom || undefined,
          dueDateTo: dateTo || undefined
        }
      });
      toast.success('Monitoring report exported.');
    } catch {
      toast.error('Unable to export the monitoring report right now.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleStatusChange = async (taskId: number, newStatus: import('../../types/task.types').TaskStatus, proofFile?: File) => {
    await taskService.updateTaskStatus(taskId, newStatus, proofFile);
    await taskQuery.refetch();
    toast.success('Task status updated.');
  };

  if (taskQuery.isError) {
    return (
      <section className="space-y-5 p-5">
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          Failed to load tasks. Please refresh the page.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article className="rounded-[18px] border border-[#EFF2F6] bg-white p-5" key={card.key}>
            <span
              className={[
                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                card.color
              ].join(' ')}
            >
              {card.label}
            </span>
            <p className="mt-4 text-3xl font-semibold text-[#1E293B]">{counts[card.key]}</p>
            <p className="mt-2 text-sm text-[#8A99B0]">
              Tasks currently marked {card.label.toLowerCase()}.
            </p>
          </article>
        ))}
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Monitor Module
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Task monitoring view</h2>
            <p className="mt-2 text-sm text-[#5B6E8C]">
              Track tasks by status, assign head, and deadline range. Open any row to
              review its full history log.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              loading={isExporting === 'pdf'}
              onClick={() => void handleExport('pdf')}
              variant="ghost"
            >
              Export PDF
            </Button>
            <Button
              loading={isExporting === 'excel'}
              onClick={() => void handleExport('excel')}
            >
              Export Excel
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Search</span>
            <input
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Task title, assign head"
              value={searchFilter}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Status</span>
            <select
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'ALL')}
              value={statusFilter}
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="DELAYED">Delayed</option>
              <option value="ESCALATED">Escalated</option>
            </select>
          </label>

          {/* Department has been removed from Task Monitor (filter, dropdown,
              search matching, and export param) per the Task Monitor
              requirements — it remains available elsewhere in the app
              (e.g. Task Assignment, Reports) where it is still needed. */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Assign Head</span>
            <select
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              onChange={(event) => setAssigneeFilter(event.target.value)}
              value={assigneeFilter}
            >
              <option value="all">All Head</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} - {getRoleLabel(user.role)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Start from</span>
              <input
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Due by</span>
              <input
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </label>
          </div>
        </div>
      </div>

      <TaskTable
        emptyMessage="Once tasks match your filters, the monitoring grid will populate here."
        onRowClick={(task) => navigate(`/task/${task.id}`)}
        onStatusChange={handleStatusChange}
        showActions
        tasks={filteredTasks}
        userRole={user?.role}
      />
    </section>
  );
}

export default TaskMonitoring;
