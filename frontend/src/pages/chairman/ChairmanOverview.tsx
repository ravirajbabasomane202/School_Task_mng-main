import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import TaskStatusPieChart from '../../components/charts/TaskStatusPieChart';
import TaskTable from '../../components/tables/TaskTable';
import { PERFORMANCE_LABELS as L } from '../../constants/performanceLabels';
import { ROLE_LABELS, TASK_ASSIGNABLE_ROLES } from '../../constants/roles';
import { getRoleLabel } from '../../utils/roleUtils';
import { approveApproval, rejectApproval } from '../../services/approvalService';
import api from '../../services/api';
import { getStaffPerformance } from '../../services/dashboardService';
import { getRegisterPerformance } from '../../services/reportService';
import * as taskService from '../../services/taskService';
import { useAppSelector } from '../../store/hooks';
import { defaultRegisterRange, summarizeRegisterTotals, summarizeTaskTotals } from '../../utils/performanceUtils';
import { getStatusErrorMessage } from '../../utils/taskStatus';
import type { StaffPerformance } from '../../services/dashboardService';
import type { Task, TaskStatus } from '../../types/task.types';

interface DashboardAlert {
  id: number;
  title: string;
  subLabel: string;
  severity: 'Critical' | 'Warning' | 'Delay' | 'Escalated';
}

interface DashboardData {
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  delayedTasks: number;
  pendingApprovals: number;
  taskBreakdown?: {
    pending: number;
    inProgress: number;
    completed: number;
    delayed: number;
    escalated: number;
  };
  alerts: DashboardAlert[];
  recentTasks: Task[];
  pendingApprovalsList: {
    id: number;
    title: string;
    submitter: string;
    amount: string;
    department: string;
  }[];
}

interface PerformanceRow {
  userId: number;
  name: string;
  role: keyof typeof ROLE_LABELS;
  delayedTasks: number;
  performanceScore: number;
  totalRegisters: number;
  registerPerformance: number;
}

const asArray = <T,>(value: T[] | undefined | null): T[] =>
  Array.isArray(value) ? value : [];

const severityVariantMap = {
  Critical: 'red',
  Escalated: 'red',
  Warning: 'amber',
  Delay: 'amber'
} as const;

function ChairmanOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAppSelector((state) => state.auth.user);

  const handleStatusChange = async (taskId: number, newStatus: TaskStatus, proofFile?: File) => {
    try {
      await taskService.updateTaskStatus(taskId, newStatus, proofFile);
    } catch (e) {
      toast.error(getStatusErrorMessage(e));
      throw e;
    }
    await queryClient.invalidateQueries({ queryKey: ['chairman-dashboard'] });
    toast.success('Task status updated.');
  };

  const dashboardQuery = useQuery({
    queryKey: ['chairman-dashboard'],
    queryFn: async () => {
      const response = await api.get('/dashboard/chairman');
      const data = response.data.data as Partial<DashboardData> | null;

      return {
        totalTasks: data?.totalTasks ?? 0,
        completedTasks: data?.completedTasks ?? 0,
        completionPercentage: data?.completionPercentage ?? 0,
        delayedTasks: data?.delayedTasks ?? 0,
        pendingApprovals: data?.pendingApprovals ?? 0,
        taskBreakdown: data?.taskBreakdown,
        alerts: asArray(data?.alerts),
        recentTasks: asArray(data?.recentTasks),
        pendingApprovalsList: asArray(data?.pendingApprovalsList)
      } satisfies DashboardData;
    },
    refetchInterval: 30000
  });

  // Same query keys and fetchers as the Performance screen, so both screens
  // read the same data and show the same numbers.
  const performanceQuery = useQuery({
    queryKey: ['staffPerformance'],
    queryFn: () => getStaffPerformance()
  });

  const registerRange = defaultRegisterRange();
  const registerPerformanceQuery = useQuery({
    queryKey: ['register-performance', registerRange.dateFrom, registerRange.dateTo],
    queryFn: () => getRegisterPerformance(registerRange)
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) => {
      if (decision === 'approve') {
        return approveApproval(id);
      }

      return rejectApproval(id);
    },
    onSuccess: async (_, variables) => {
      toast.success(variables.decision === 'approve' ? 'Approval granted.' : 'Approval rejected.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chairman-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['approvals'] })
      ]);
    },
    onError: () => {
      toast.error('Unable to process that approval right now.');
    }
  });

  const dashboardData = dashboardQuery.data;
  const performanceData = useMemo(() => {
    return [...asArray(performanceQuery.data as PerformanceRow[] | undefined)]
      .sort((left, right) => {
        const leftIndex = TASK_ASSIGNABLE_ROLES.indexOf(left.role);
        const rightIndex = TASK_ASSIGNABLE_ROLES.indexOf(right.role);
        return leftIndex - rightIndex;
      });
  }, [performanceQuery.data]);

  const topPerformers = useMemo(
    () =>
      [...performanceData]
        .sort((left, right) => right.performanceScore - left.performanceScore)
        .slice(0, 5),
    [performanceData]
  );

  const taskTotals = useMemo(
    () => summarizeTaskTotals(asArray(performanceQuery.data as StaffPerformance[] | undefined)),
    [performanceQuery.data]
  );
  const registerTotals = useMemo(
    () => summarizeRegisterTotals(registerPerformanceQuery.data?.summaries ?? []),
    [registerPerformanceQuery.data]
  );

  // Pie chart: the same task rows as the Task cards above, split by status.
  const taskStatusData = useMemo(() => {
    const rows = asArray(performanceQuery.data as StaffPerformance[] | undefined);
    const sum = (pick: (row: StaffPerformance) => number) =>
      rows.reduce((acc, row) => acc + (pick(row) || 0), 0);
    return [
      { name: 'Pending', value: sum((r) => r.pendingTasks), color: '#3B82F6' },
      { name: 'In Progress', value: sum((r) => r.inProgressTasks), color: '#F59E0B' },
      { name: 'Completed', value: sum((r) => r.completedTasks), color: '#22C55E' },
      { name: 'Delayed', value: sum((r) => r.delayedTasks), color: '#EF4444' },
      { name: 'Escalated', value: sum((r) => r.escalatedTasks), color: '#8B5CF6' }
    ];
  }, [performanceQuery.data]);

  // Register pie: the same register numbers as the Register cards above.
  const registerStatusData = useMemo(
    () => [
      { name: L.onTimeChecked, value: registerTotals.onTimeChecked, color: '#22C55E' },
      { name: L.checkedAfterDueDate, value: registerTotals.checkedAfterDueDate, color: '#F59E0B' },
      { name: L.notChecked, value: registerTotals.notChecked, color: '#F97316' },
      { name: L.delayed, value: registerTotals.delayed, color: '#EF4444' }
    ],
    [registerTotals]
  );

  // Register leaderboard: same per-person register numbers the Performance screen uses.
  const topRegisterPerformers = useMemo(
    () =>
      performanceData
        .filter((user) => user.totalRegisters > 0)
        .sort((left, right) => right.registerPerformance - left.registerPerformance)
        .slice(0, 5),
    [performanceData]
  );

  if (dashboardQuery.isLoading || !dashboardData) {
    return <div className="p-6">Loading...</div>;
  }

  // Same labels, same order and same numbers as the Performance screen.
  const taskCards = [
    { label: L.totalTasks, tone: 'text-blue-600', value: taskTotals.totalTasks, to: '/chairman/task-monitor' },
    { label: L.onTimeComplete, tone: 'text-green-600', value: taskTotals.onTimeComplete, to: '/chairman/task-monitor?status=COMPLETED' },
    { label: L.completedAfterDueDate, tone: 'text-amber-600', value: taskTotals.completedAfterDueDate, to: '/chairman/task-monitor?status=COMPLETED' },
    { label: L.notCompleted, tone: 'text-orange-600', value: taskTotals.notCompleted, to: '/chairman/task-monitor' },
    { label: L.delayed, tone: 'text-red-600', value: taskTotals.delayed, to: '/chairman/task-monitor?status=DELAYED' }
  ];
  const registerCards = [
    { label: L.totalRegisters, tone: 'text-cyan-600', value: registerTotals.totalRegisters },
    { label: L.onTimeChecked, tone: 'text-green-600', value: registerTotals.onTimeChecked },
    { label: L.checkedAfterDueDate, tone: 'text-amber-600', value: registerTotals.checkedAfterDueDate },
    { label: L.notChecked, tone: 'text-orange-600', value: registerTotals.notChecked },
    { label: L.delayed, tone: 'text-red-600', value: registerTotals.delayed }
  ].map((card) => ({ ...card, to: '/chairman/register-monitoring' }));

  const renderCardGroup = (title: string, cards: { label: string; tone: string; value: number; to: string }[]) => (
    <section aria-label={title}>
      <h2 className="mb-3 text-lg font-semibold text-[#1E293B]">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <button
            className="cursor-pointer rounded-lg bg-gray-50 p-4 text-left transition hover:bg-gray-100 hover:shadow-sm"
            key={card.label}
            onClick={() => navigate(card.to)}
            type="button"
          >
            <h3 className="text-sm font-medium text-gray-500">{card.label}</h3>
            <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
            <p className="mt-1 text-[11px] text-[#8A99B0]">Click to view →</p>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Master View
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#1E293B]">
              School Status And Leadership Control
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5B6E8C]">
              Review task health, staff productivity, approvals, and
              active alerts from one chairman dashboard.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/chairman/task-assignment')}>Assign Task</Button>
            <Button onClick={() => navigate('/chairman/meetings')} variant="ghost">
              Schedule Meeting
            </Button>
            <Button onClick={() => navigate('/chairman/task-monitor')} variant="ghost">
              Monitor Tasks
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {renderCardGroup('Tasks', taskCards)}
        {renderCardGroup('Registers', registerCards)}
      </div>

      {/* Top Performers (Tasks) -> Pie Charts (Tasks + Registers) -> Top Performers (Registers) */}
      <div className="space-y-6">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
                Staff Productivity
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Top Performers (Tasks)</h2>
            </div>
            <Badge variant="gray">{topPerformers.length} People</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {topPerformers.map((user) => (
              <div
                className="flex items-center justify-between rounded-[16px] border border-[#EFF2F6] bg-[#FAFCFE] px-4 py-4"
                key={user.userId}
              >
                <div>
                  <p className="text-sm font-semibold text-[#1E293B]">{user.name}</p>
                  <p className="text-sm text-[#5B6E8C]">{getRoleLabel(user.role)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#1E293B]">{user.performanceScore}%</p>
                  <p className="text-xs text-[#8A99B0]">{user.delayedTasks} delayed</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
            <h2 className="mb-4 text-xl font-semibold text-[#1E293B]">Task Status Distribution</h2>
            <TaskStatusPieChart data={taskStatusData} />
          </div>

          <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
            <h2 className="mb-4 text-xl font-semibold text-[#1E293B]">Register Status Distribution</h2>
            <TaskStatusPieChart
              data={registerStatusData}
              emptyMessage="No register data available yet."
              totalLabel={L.totalPeriodsDue}
            />
          </div>
        </div>

        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
                Staff Productivity
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Top Performers (Registers)</h2>
            </div>
            <Badge variant="gray">{topRegisterPerformers.length} People</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {topRegisterPerformers.length > 0 ? (
              topRegisterPerformers.map((user) => (
                <div
                  className="flex items-center justify-between rounded-[16px] border border-[#EFF2F6] bg-[#FAFCFE] px-4 py-4"
                  key={user.userId}
                >
                  <div>
                    <p className="text-sm font-semibold text-[#1E293B]">{user.name}</p>
                    <p className="text-sm text-[#5B6E8C]">{getRoleLabel(user.role)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#1E293B]">{user.registerPerformance}%</p>
                    <p className="text-xs text-[#8A99B0]">{user.totalRegisters} registers</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#8A99B0]">No register data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 1: Recent task assignments | Active alerts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent Task Assignments</h3>
            <Button onClick={() => navigate('/chairman/task-assignment')} size="sm">
              Assign Task +
            </Button>
          </div>
          <TaskTable
            emptyMessage="Newly assigned tasks will appear here."
            onRowClick={(task) => navigate(`/task/${task.id}`)}
            currentUserId={currentUser?.id}
            onStatusChange={handleStatusChange}
            showActions={false}
            tasks={dashboardData.recentTasks.slice(0, 5)}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Active Alerts</h3>
            <Button onClick={() => navigate('/chairman/alerts')} size="sm" variant="ghost">
              Open Alerts
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {dashboardData.alerts.length > 0 ? (
              dashboardData.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center space-x-3">
                  <div className="text-lg">!</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-gray-500">{alert.subLabel}</p>
                  </div>
                  <Badge variant={severityVariantMap[alert.severity]}>{alert.severity}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#8A99B0]">No active alerts right now.</p>
            )}
          </div>
        </div>
      </div>

      {/* Pending approvals */}
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Pending Approvals</h3>
            <Button onClick={() => navigate('/chairman/approvals')} size="sm" variant="ghost">
              View All
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {dashboardData.pendingApprovalsList.length > 0 ? (
              dashboardData.pendingApprovalsList.map((approval) => (
                <div key={approval.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                      {approval.submitter
                        .split(' ')
                        .map((name) => name[0])
                        .join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{approval.title}</p>
                      <p className="text-xs text-gray-500">
                        {approval.submitter} | {approval.department} | {approval.amount}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      loading={approvalMutation.isPending}
                      onClick={() =>
                        void approvalMutation.mutateAsync({ id: approval.id, decision: 'approve' })
                      }
                      size="sm"
                      variant="primary"
                    >
                      Approve
                    </Button>
                    <Button
                      loading={approvalMutation.isPending}
                      onClick={() =>
                        void approvalMutation.mutateAsync({ id: approval.id, decision: 'reject' })
                      }
                      size="sm"
                      variant="danger"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#8A99B0]">No pending approvals at the moment.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChairmanOverview;
