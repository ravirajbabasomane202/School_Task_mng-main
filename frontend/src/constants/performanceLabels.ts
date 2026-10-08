/**
 * One constant per Performance label. Summary cards, table headers and the
 * CSV export all import from here, so a card and its table column can never
 * show different names. (Mirrors backend/app/utils/labels.py.)
 * Every label is Title Case.
 */
export const PERFORMANCE_LABELS = {
  role: 'Role',
  totalTasks: 'Total Tasks',
  onTimeChecked: 'On Time Checked',
  checkedAfterDueDate: 'Checked After Due Date',
  notChecked: 'Not Checked',
  delayed: 'Delayed',
  rejected: 'Rejected',
  pending: 'Pending',
  inProgress: 'In Progress',
  escalated: 'Escalated',
  taskPerformance: 'Task Performance',
  totalRegisters: 'Total Registers',
  checkingCycle: 'Checking Cycle',
  totalEstimatedCheck: 'Total Estimated Check',
  registerPerformance: 'Register Performance',
  overallPerformance: 'Overall Performance',
} as const;

export type PerformanceLabelKey = keyof typeof PERFORMANCE_LABELS;
