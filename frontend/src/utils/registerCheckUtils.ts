import { PERFORMANCE_LABELS as L } from '../constants/performanceLabels';
import { formatCalendarDate, formatSchoolDate, formatSchoolDateTime } from './dateUtils';

/**
 * Display helpers for a register period's check. They only FORMAT what the
 * backend sent (due_date, checked_at, check_timing, checked_at_unknown): the
 * browser never decides on-time vs late itself.
 */
export interface RegisterCheckInfo {
  due_date?: string | null;
  checked_at?: string | null;
  check_timing?: 'ON_TIME' | 'LATE' | null;
  checked_at_unknown?: boolean;
}

export const CHECK_TIMING_LABEL = {
  ON_TIME: L.onTimeChecked,
  LATE: L.checkedAfterDueDate,
} as const;

/** "Due Date" cell text. */
export function dueDateText(info: RegisterCheckInfo): string {
  return formatCalendarDate(info.due_date);
}

/** "Checked On" cell text: date + time, or a clear marker when unknown / unchecked. */
export function checkedOnText(info: RegisterCheckInfo): string {
  if (info.checked_at) return formatSchoolDateTime(info.checked_at);
  if (info.checked_at_unknown) return 'Checked (Date Unknown)';
  return '—';
}

/** Label of the outcome of a checked period, or null when not checked yet. */
export function timingLabel(info: RegisterCheckInfo): string | null {
  return info.check_timing ? CHECK_TIMING_LABEL[info.check_timing] : null;
}

/** Marker tooltip, e.g. "Checked After Due Date - Due 05 Oct 2026, Checked 08 Oct 2026". */
export function markerTooltip(info: RegisterCheckInfo, fallback: string): string {
  const label = timingLabel(info);
  if (!label) return fallback;
  const due = formatCalendarDate(info.due_date);
  if (info.checked_at) return `${label} - Due ${due}, Checked ${formatSchoolDate(info.checked_at)}`;
  return `${label} - Due ${due}, Checked (Date Unknown)`;
}
