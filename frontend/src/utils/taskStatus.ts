import type { Task, TaskStatus } from '../types/task.types';

export const ALL_TASK_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];
export const ASSIGNEE_TASK_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'COMPLETED'];

/** Shown to assignees next to the status control. */
export const ASSIGNEE_STATUS_HINT =
  'Pending and Delayed are set automatically. Escalated is set by the assigner.';

type TaskRelation = Pick<Task, 'assigned_by' | 'assigned_to'> & Partial<Pick<Task, 'status'>>;

const sameId = (a: unknown, b: unknown) =>
  a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);

/** The assigner is whoever is in task.assigned_by - never decided by role. */
export function isTaskAssigner(task: TaskRelation, currentUserId?: number | string | null): boolean {
  return sameId(task.assigned_by, currentUserId);
}

export function isTaskAssignee(task: TaskRelation, currentUserId?: number | string | null): boolean {
  return !isTaskAssigner(task, currentUserId) && sameId(task.assigned_to, currentUserId);
}

/**
 * Statuses the current user may move this task to (mirrors the backend rules).
 *  - assigner: all 5
 *  - assignee: IN_PROGRESS / COMPLETED, none once the task is COMPLETED or ESCALATED
 *  - everyone else: none (view only)
 */
export function getAllowedStatuses(
  task: TaskRelation,
  currentUserId?: number | string | null
): TaskStatus[] {
  if (isTaskAssigner(task, currentUserId)) return [...ALL_TASK_STATUSES];
  if (isTaskAssignee(task, currentUserId)) {
    if (task.status === 'COMPLETED' || task.status === 'ESCALATED') return [];
    return [...ASSIGNEE_TASK_STATUSES];
  }
  return [];
}

/** Pull the backend's message (e.g. the 403 reason) out of an Axios-style error. */
export function getStatusErrorMessage(err: unknown, fallback = 'Failed to update task status. Please try again.'): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
