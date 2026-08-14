import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import * as taskService from '../../services/taskService';
import type { Task, TaskStatus } from '../../types/task.types';

type AlertKind = 'ESCALATED' | 'CRITICAL' | 'DELAYED' | 'NO_UPDATE';

interface AlertRecord {
  actionLabel: string;
  kind: AlertKind;
  lastUpdatedLabel: string;
  message: string;
  nextStatus: TaskStatus;
  severity: 'Critical' | 'Warning';
  task: Task;
}

const STALE_DAYS = 3;

const formatDate = (value?: string | null) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getStaleDays = (task: Task) => {
  const referenceValue = task.updated_at ?? task.created_at;
  if (!referenceValue) {
    return 0;
  }

  const reference = new Date(referenceValue);
  if (Number.isNaN(reference.getTime())) {
    return 0;
  }

  return Math.floor((Date.now() - reference.getTime()) / (1000 * 60 * 60 * 24));
};

const getEscalationPath = (task: Task) =>
  `Sub-head -> School Manager -> Chairman${task.department?.name ? ` | ${task.department.name}` : ''}`;

const buildAlert = (task: Task): AlertRecord | null => {
  const staleDays = getStaleDays(task);
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = Boolean(
    dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()
  );

  if (task.status === 'ESCALATED') {
    return {
      actionLabel: 'Mark In Progress',
      kind: 'ESCALATED',
      lastUpdatedLabel: formatDate(task.updated_at),
      message: 'Task has already been escalated and is awaiting chairman action.',
      nextStatus: 'IN_PROGRESS',
      severity: 'Critical',
      task
    };
  }

  if (task.priority === 'HIGH' && task.status !== 'COMPLETED' && isOverdue) {
    return {
      actionLabel: 'Mark In Progress',
      kind: 'CRITICAL',
      lastUpdatedLabel: formatDate(task.updated_at),
      message: 'High-priority task is overdue and needs immediate intervention.',
      nextStatus: 'IN_PROGRESS',
      severity: 'Critical',
      task
    };
  }

  if (task.status === 'DELAYED') {
    return {
      actionLabel: 'Escalate',
      kind: 'DELAYED',
      lastUpdatedLabel: formatDate(task.updated_at),
      message: 'Task is marked delayed and should be escalated if support is required.',
      nextStatus: 'ESCALATED',
      severity: 'Warning',
      task
    };
  }

  if (task.status !== 'COMPLETED' && staleDays >= STALE_DAYS) {
    return {
      actionLabel: 'Escalate',
      kind: 'NO_UPDATE',
      lastUpdatedLabel: formatDate(task.updated_at ?? task.created_at),
      message: `No update received for ${staleDays} days.`,
      nextStatus: 'ESCALATED',
      severity: 'Warning',
      task
    };
  }

  return null;
};

function AlertsEscalations() {
  const queryClient = useQueryClient();
  const alertsQuery = useQuery({
    queryKey: ['tasks', 'alerts-feed'],
    queryFn: () => taskService.getAllTasks()
  });

  const actionMutation = useMutation({
    mutationFn: ({ taskId, status, comment }: { taskId: number; status: TaskStatus; comment: string }) =>
      taskService.updateTask(taskId, { status, comment }),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.status === 'ESCALATED'
          ? 'Task escalated successfully.'
          : 'Task moved back into progress.'
      );
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Unable to update that task right now.');
    }
  });

  const alerts = useMemo(() => {
    return (alertsQuery.data ?? [])
      .map((task) => buildAlert(task))
      .filter((alert): alert is AlertRecord => Boolean(alert))
      .sort((left, right) => {
        if (left.severity !== right.severity) {
          return left.severity === 'Critical' ? -1 : 1;
        }

        return (right.task.updated_at ?? right.task.created_at ?? '').localeCompare(
          left.task.updated_at ?? left.task.created_at ?? ''
        );
      });
  }, [alertsQuery.data]);

  const metrics = useMemo(
    () => ({
      critical: alerts.filter((alert) => alert.severity === 'Critical').length,
      warnings: alerts.filter((alert) => alert.kind === 'DELAYED').length,
      noUpdate: alerts.filter((alert) => alert.kind === 'NO_UPDATE').length
    }),
    [alerts]
  );

  return (
    <section className="space-y-5 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[20px] border border-[#F2D1CF] bg-white p-5">
          <p className="text-sm font-semibold text-[#C13F3A]">Critical alerts</p>
          <p className="mt-4 text-3xl font-semibold text-[#1E293B]">{metrics.critical}</p>
          <p className="mt-2 text-sm text-[#8A99B0]">Escalated or overdue high-priority tasks.</p>
        </article>
        <article className="rounded-[20px] border border-[#F6E0AF] bg-white p-5">
          <p className="text-sm font-semibold text-[#A86A00]">Delay alerts</p>
          <p className="mt-4 text-3xl font-semibold text-[#1E293B]">{metrics.warnings}</p>
          <p className="mt-2 text-sm text-[#8A99B0]">Tasks already marked delayed by staff.</p>
        </article>
        <article className="rounded-[20px] border border-[#D7E7F7] bg-white p-5">
          <p className="text-sm font-semibold text-[#185FA5]">No update alerts</p>
          <p className="mt-4 text-3xl font-semibold text-[#1E293B]">{metrics.noUpdate}</p>
          <p className="mt-2 text-sm text-[#8A99B0]">
            Tasks with no movement for {STALE_DAYS}+ days.
          </p>
        </article>
      </div>

      <article className="rounded-[22px] border border-[#EFF2F6] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Alerts Module
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1E293B]">Alert & escalation feed</h2>
            <p className="mt-2 text-sm text-[#5B6E8C]">
              Delay alerts, no-update signals, critical tasks, and the escalation path are all
              tracked here.
            </p>
          </div>
          <Badge variant="gray">{alerts.length} live alerts</Badge>
        </div>

        <div className="mt-5 space-y-3">
          {alerts.length > 0 ? (
            alerts.map((alert) => (
              <div
                className="flex flex-col gap-4 rounded-[18px] border border-[#EFF2F6] bg-[#FAFCFE] px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                key={`${alert.kind}-${alert.task.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#1E293B]">{alert.task.title}</p>
                    <Badge variant={alert.severity === 'Critical' ? 'red' : 'amber'}>
                      {alert.kind.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[#5B6E8C]">{alert.message}</p>
                  <p className="mt-2 text-sm text-[#5B6E8C]">{getEscalationPath(alert.task)}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#8A99B0]">
                    <span>Assigned to: {alert.task.assignedTo?.name ?? alert.task.assignedToName ?? '--'}</span>
                    <span>Due: {formatDate(alert.task.due_date)}</span>
                    <span>Last update: {alert.lastUpdatedLabel}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={alert.severity === 'Critical' ? 'red' : 'amber'}>
                    {alert.severity}
                  </Badge>
                  <Button
                    loading={actionMutation.isPending}
                    onClick={() =>
                      void actionMutation.mutateAsync({
                        taskId: alert.task.id,
                        status: alert.nextStatus,
                        comment:
                          alert.nextStatus === 'ESCALATED'
                            ? 'Escalated by Chairman from alert center'
                            : 'Returned to in progress by Chairman from alert center'
                      })
                    }
                  >
                    {alert.actionLabel}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#D7E1EC] bg-[#FAFCFE] px-4 py-10 text-center text-sm text-[#8A99B0]">
              No delayed, stalled, or critical tasks are active right now.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

export default AlertsEscalations;
