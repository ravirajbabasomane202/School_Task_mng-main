/**
 * One constant per Performance label. Summary cards, table headers and the
 * CSV export all import from here, so a card and its table column can never
 * show different names. (Mirrors backend/app/utils/labels.py.)
 *
 * A task is COMPLETED and a register is CHECKED, so the two have their own
 * wording: `onTimeComplete` / `completedAfterDueDate` / `notCompleted` for
 * tasks, `onTimeChecked` / `checkedAfterDueDate` / `notChecked` for registers.
 * Every label is Title Case.
 */
export const TASK_LABELS = {
  onTimeComplete: 'On Time Complete',
  completedAfterDueDate: 'Completed After Due Date',
  notCompleted: 'Not Completed',
} as const;

export const REGISTER_LABELS = {
  onTimeChecked: 'On Time Checked',
  checkedAfterDueDate: 'Checked After Due Date',
  notChecked: 'Not Checked',
} as const;

export const PERFORMANCE_LABELS = {
  role: 'Role',
  totalTasks: 'Total Tasks',
  ...TASK_LABELS,
  ...REGISTER_LABELS,
  delayed: 'Delayed',
  pending: 'Pending',
  inProgress: 'In Progress',
  escalated: 'Escalated',
  taskPerformance: 'Task Performance',
  totalRegisters: 'Total Registers',
  checkingCycle: 'Checking Cycle',
  totalEstimatedCheck: 'Total Estimated Check',
  totalPeriodsDue: 'Total Required Due',
  registerPerformance: 'Register Performance',
} as const;

export type PerformanceLabelKey = keyof typeof PERFORMANCE_LABELS;
