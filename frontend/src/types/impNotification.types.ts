export type ImpRecurrence = 'ONE_TIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ImpPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ImpStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export const IMP_RECURRENCES: { value: ImpRecurrence; label: string }[] = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export const IMP_PRIORITIES: { value: ImpPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export const IMP_STATUSES: { value: ImpStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
];

export interface ImpCycle {
  id: number | null;
  cycle_number: number;
  due_date: string;
  notify_from?: string | null;
  /** UPCOMING = the next cycle, not generated yet. */
  status: ImpStatus | 'UPCOMING';
  completed_at: string | null;
  completed_by: number | null;
  completed_by_name: string | null;
  is_overdue: boolean;
  reminder_count?: number;
}

export interface ImpAssignee {
  id: number;
  name: string;
  role: string;
}

export interface ImpNotification {
  id: number;
  title: string;
  description: string | null;
  due_date: string;
  start_date: string;
  recurrence: ImpRecurrence;
  priority: ImpPriority;
  assigned_roles: string[];
  assigned_user_ids: number[];
  assignees: ImpAssignee[];
  is_active: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string | null;
  cycle: ImpCycle | null;
  /** Due date of the current cycle. */
  current_due_date: string;
  status: ImpStatus;
  next_reminder: string | null;
  history?: ImpCycle[];
}

export interface ImpNotificationPayload {
  title: string;
  description?: string;
  due_date: string;
  start_date: string;
  recurrence: ImpRecurrence;
  priority: ImpPriority;
  status?: ImpStatus;
  assigned_roles: string[];
  assigned_user_ids: number[];
  is_active: boolean;
}

export interface ImpAssignmentOptions {
  users: { id: number; name: string; role: string; head_type?: string | null }[];
  roles: string[];
}

export interface ImpNotificationFilters {
  search?: string;
  status?: ImpStatus;
  recurrence?: ImpRecurrence;
  active?: 'true' | 'false';
}
