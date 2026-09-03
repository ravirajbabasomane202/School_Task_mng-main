import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import DepartmentHealthBar from '../../components/charts/DepartmentHealthBar';
import TaskTable from '../../components/tables/TaskTable';
import { ROLE_LABELS, TASK_ASSIGNABLE_ROLES } from '../../constants/roles';
import { getRoleLabel } from '../../utils/roleUtils';
import { approveApproval, rejectApproval } from '../../services/approvalService';
import api from '../../services/api';
import { getStaffPerformance } from '../../services/dashboardService';
import * as taskService from '../../services/taskService';
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
  departments: { name: string; completionPct: number; healthColor: string }[];
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
  totalTasks: number;
  completedTasks: number;
  delayedTasks: number;
  performanceScore: number;
  delayRate: number;
}

const severityVariantMap = {
  Critical: 'red',
  Escalated: 'red',
  Warning: 'amber',
  Delay: 'amber'
} as const;

function ChairmanOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleStatusChange = async (taskId: number, newStatus: TaskStatus, proofFile?: File) => {
    await taskService.updateTaskStatus(taskId, newStatus, proofFile);
    await queryClient.invalidateQueries({ queryKey: ['chairman-dashboard'] });
    toast.success('Task status updated.');
  };

  const dashboardQuery = useQuery({
    queryKey: ['chairman-dashboard'],
    queryFn: async () => {
      const response = await api.get('/dashboard/chairman');
      return response.data.data as DashboardData;
    },
    refetchInterval: 30000
  });

  const performanceQuery = useQuery({
    queryKey: ['chairman-performance-overview'],
    queryFn: getStaffPerformance
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
    return ((performanceQuery.data ?? []) as PerformanceRow[])
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

  if (dashboardQuery.isLoading || !dashboardData) {
    return <div className="p-6">Loading...</div>;
  }

  const statCards = [
    {
      label: 'Total tasks',
      tone: 'text-blue-600',
      value: dashboardData.totalTasks,
      statusFilter: 'ALL'
    },
    {
      label: 'Pending',
      tone: 'text-[#A86A00]',
      value: dashboardData.taskBreakdown?.pending ?? 0,
      statusFilter: 'PENDING'
    },
    {
      label: 'Completed',
      tone: 'text-green-600',
      value: dashboardData.completedTasks,
      statusFilter: 'COMPLETED'
    },
    {
      label: 'Delayed',
      tone: 'text-red-600',
      value: dashboardData.delayedTasks,
      statusFilter: 'DELAYED'
    },
    {
      label: 'Pending approvals',
      tone: 'text-amber-600',
      value: dashboardData.pendingApprovals,
      statusFilter: null  // navigate to approvals page
    }
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Master View
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#1E293B]">
              School status and leadership control
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5B6E8C]">
              Review task health, department performance, staff productivity, approvals, and
              active alerts from one chairman dashboard.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/chairman/task-assignment')}>Assign task</Button>
            <Button onClick={() => navigate('/chairman/meetings')} variant="ghost">
              Schedule meeting
            </Button>
            <Button onClick={() => navigate('/chairman/task-monitor')} variant="ghost">
              Monitor tasks
            </Button>
            <Button onClick={() => navigate('/chairman/reports')} variant="ghost">
              Open MIS
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => (
          <button
            className="rounded-lg bg-gray-50 p-4 text-left transition hover:bg-gray-100 hover:shadow-sm cursor-pointer"
            key={card.label}
            onClick={() => {
              if (card.statusFilter === null) {
                navigate('/chairman/approvals');
              } else if (card.statusFilter === 'ALL') {
                navigate('/chairman/task-monitor');
              } else {
                navigate(`/chairman/task-monitor?status=${card.statusFilter}`);
              }
            }}
            type="button"
          >
            <h3 className="text-sm font-medium text-gray-500">{card.label}</h3>
            <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
            <p className="mt-1 text-[11px] text-[#8A99B0]">Click to view →</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Department health</h3>
            <button
              className="bg-transparent text-xs text-blue-600"
              onClick={() => navigate('/chairman/performance')}
              type="button"
            >
              Full analytics
            </button>
          </div>
          <DepartmentHealthBar departments={dashboardData.departments} />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Active alerts</h3>
            <Button onClick={() => navigate('/chairman/alerts')} size="sm" variant="ghost">
              Open alerts
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
                Department Performance Panel
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Leadership performance</h2>
            </div>
            <Badge variant="blue">{performanceData.length} profiles</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {performanceData.map((user) => (
              <div
                className="grid gap-2 rounded-[16px] border border-[#EFF2F6] bg-[#FAFCFE] px-4 py-4 md:grid-cols-[1.3fr,0.7fr,0.7fr,0.7fr]"
                key={user.userId}
              >
                <div>
                  <p className="text-sm font-semibold text-[#1E293B]">{getRoleLabel(user.role)}</p>
                  <p className="text-sm text-[#5B6E8C]">{user.name}</p>
                </div>
                <div className="text-sm text-[#36506C]">
                  <p className="font-medium text-[#1E293B]">{user.completedTasks}/{user.totalTasks}</p>
                  <p>Completed</p>
                </div>
                <div className="text-sm text-[#36506C]">
                  <p className="font-medium text-[#1E293B]">{user.performanceScore}%</p>
                  <p>Score</p>
                </div>
                <div className="text-sm text-[#36506C]">
                  <p className="font-medium text-[#1E293B]">{user.delayRate}%</p>
                  <p>Delay rate</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
                Staff Productivity
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Top performers</h2>
            </div>
            <Badge variant="gray">{topPerformers.length} people</Badge>
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
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent task assignments</h3>
            <Button onClick={() => navigate('/chairman/task-assignment')} size="sm">
              Assign task +
            </Button>
          </div>
          <TaskTable
            emptyMessage="Newly assigned tasks will appear here."
            onRowClick={(task) => navigate(`/task/${task.id}`)}
            onStatusChange={handleStatusChange}
            showActions={false}
            tasks={dashboardData.recentTasks.slice(0, 5)}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Pending approvals</h3>
            <Button onClick={() => navigate('/chairman/approvals')} size="sm" variant="ghost">
              View all
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
