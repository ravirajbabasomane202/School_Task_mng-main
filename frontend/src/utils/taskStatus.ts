import { ASSIGNEE_ONLY_ROLES, isChairmanLevel } from '../constants/roles';
import type { Task, TaskStatus } from '../types/task.types';

export const ALL_TASK_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];
export const ASSIGNEE_TASK_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'COMPLETED'];

/** Shown to assignees next to the status control. */
export const ASSIGNEE_STATUS_HINT =
  'Pending and Delayed are set automatically. Escalated is set by the assigner.';

type TaskRelation = Pick<Task, 'assigned_by' | 'assigned_to'> &
  Partial<Pick<Task, 'status'>> & { assignedBy?: { role?: string | null } | null };

const sameId = (a: unknown, b: unknown) =>
  a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);

/**
 * A Chairman-level user (the Principal) looking at a task assigned TO them is only
 * the assignee: they work on it but never administer it. Mirrors the backend.
 */
export function isRestrictedAssignee(task: TaskRelation, userId?: number | string | null, role?: string | null): boolean {
  return !!role && (ASSIGNEE_ONLY_ROLES as string[]).includes(role) && sameId(task.assigned_to, userId);
}

/**
 * Who holds assigner powers (mirrors the backend ``_is_assigner``):
 *  - whoever is in task.assigned_by
 *  - a Chairman-level user, for tasks that a Chairman-level user assigned
 *  - never a Principal for a task assigned to themselves
 * ``currentUserRole`` is optional; without it only the assigned_by identity counts.
 */
export function isTaskAssigner(
  task: TaskRelation,
  currentUserId?: number | string | null,
  currentUserRole?: string | null
): boolean {
  if (isRestrictedAssignee(task, currentUserId, currentUserRole)) return false;
  if (sameId(task.assigned_by, currentUserId)) return true;
  return isChairmanLevel(currentUserRole) && isChairmanLevel(task.assignedBy?.role);
}

export function isTaskAssignee(
  task: TaskRelation,
  currentUserId?: number | string | null,
  currentUserRole?: string | null
): boolean {
  return !isTaskAssigner(task, currentUserId, currentUserRole) && sameId(task.assigned_to, currentUserId);
}

/**
 * Statuses the current user may move this task to (mirrors the backend rules).
 *  - assigner: all 5
 *  - assignee: IN_PROGRESS / COMPLETED, none once the task is COMPLETED or ESCALATED
 *  - everyone else: none (view only)
 */
export function getAllowedStatuses(
  task: TaskRelation,
  currentUserId?: number | string | null,
  currentUserRole?: string | null
): TaskStatus[] {
  if (isTaskAssigner(task, currentUserId, currentUserRole)) return [...ALL_TASK_STATUSES];
  if (isTaskAssignee(task, currentUserId, currentUserRole)) {
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
