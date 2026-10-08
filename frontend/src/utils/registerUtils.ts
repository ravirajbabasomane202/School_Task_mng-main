import type { Register } from '../types/register.types';
import { formatDate } from './dateUtils';

export interface RegisterUpdatability {
  updatable: boolean;
  /** Human-readable explanation, set whenever `updatable` is false. */
  reason?: string;
}

/**
 * A register is checked ONCE PER CHECKING PERIOD — not on one exact date.
 * The period depends on the register's Checking Cycle (the day for Daily,
 * Monday–Sunday for Weekly, the calendar month for Monthly, and so on), and
 * the backend reports it as `current_period_start` / `current_period_end`.
 *
 * The backend also decides whether the check is still available
 * (`can_check`): true until a check is recorded in the current period, then
 * false until the next period begins — at which point it turns true again
 * by itself, with no manual reset. The same rule is enforced by the API, so
 * this is only a mirror of it for the UI; it deliberately does no date
 * arithmetic of its own, which keeps it identical for every cycle.
 */
export function isRegisterUpdatable(register: Register): RegisterUpdatability {
  if (register.can_check) {
    return { updatable: true };
  }

  if (register.check_block_reason) {
    return { updatable: false, reason: register.check_block_reason };
  }

  if (!register.current_period_start) {
    return {
      updatable: false,
      reason: `Checking starts once the register's Start Date (${formatDate(register.start_date)}) arrives.`,
    };
  }

  return { updatable: false, reason: 'Already checked for the current period.' };
}

/** Start date of the current checking period — the key a check is stored under. */
export function currentCycleOccurrenceDate(register: Register): string | null {
  return register.current_period_start ?? register.current_due_date ?? null;
}

/**
 * Whether a calendar date (YYYY-MM-DD) falls inside the register's current
 * checking period. ISO dates compare correctly as plain strings.
 */
export function isInCurrentPeriod(register: Register, date: string): boolean {
  const { current_period_start: start, current_period_end: end } = register;
  return !!start && !!end && date >= start && date <= end;
}

/**
 * Whether a check can be recorded from this calendar date: ANY day of the
 * current checking period qualifies (not just one scheduled date), but only
 * while the period hasn't been checked yet.
 */
export function isEditableOccurrenceDate(register: Register, date: string): boolean {
  return isRegisterUpdatable(register).updatable && isInCurrentPeriod(register, date);
}

/** "5 Oct 2026 – 11 Oct 2026", or a single date when the period is one day. */
export function formatPeriod(register: Register): string | null {
  const { current_period_start: start, current_period_end: end } = register;
  if (!start || !end) return null;
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

// ---------------------------------------------------------------------------
// Due Date / Checked On display. These only FORMAT what the backend sends;
// nothing here decides whether a check was on time or late (that is the
// backend's `check_outcome`).
// ---------------------------------------------------------------------------

/** The school's time zone; check times are stored in UTC and shown in this zone. */
export const SCHOOL_TIMEZONE: string =
  (import.meta.env?.VITE_SCHOOL_TIMEZONE as string | undefined) || 'Asia/Kolkata';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-05" -> "5 Oct 2026" (a calendar day: no time-zone shifting). */
export function formatCalendarDay(day: string | null | undefined): string {
  if (!day) return '—';
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-08T05:12:00+00:00" -> "8 Oct 2026, 10:42 AM" in school time. */
export function formatCheckedOn(checkedAt: string | null | undefined, unknown = false): string {
  if (!checkedAt) return unknown ? 'Checked (Date Unknown)' : 'Not Checked Yet';
  const d = new Date(checkedAt);
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** School-local calendar day of a check time, e.g. "8 Oct 2026". */
export function formatCheckedDay(checkedAt: string | null | undefined): string {
  if (!checkedAt) return '—';
  const d = new Date(checkedAt);
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}

export const CHECK_OUTCOME_LABEL = {
  ON_TIME: 'On Time Checked',
  LATE: 'Checked After Due Date',
  DELAYED: 'Not Checked',
  UPCOMING: 'Open',
  REJECTED: 'Rejected',
} as const;

interface CheckInfo {
  check_outcome?: keyof typeof CHECK_OUTCOME_LABEL | null;
  due_date?: string | null;
  checked_at?: string | null;
  checked_at_unknown?: boolean;
}

/**
 * Marker tooltip. Yellow: "Checked After Due Date - Due 5 Oct 2026, Checked 8 Oct 2026".
 * Every other outcome shows its own label (plus the due date).
 */
export function checkTooltip(info: CheckInfo): string {
  const outcome = info.check_outcome;
  if (!outcome) return '';
  const label = CHECK_OUTCOME_LABEL[outcome];
  const due = info.due_date ? formatCalendarDay(info.due_date) : null;
  if (outcome === 'LATE') {
    return `${label} - Due ${due ?? '—'}, Checked ${formatCheckedDay(info.checked_at)}`;
  }
  if (outcome === 'ON_TIME' && info.checked_at) {
    return `${label} - Due ${due ?? '—'}, Checked ${formatCheckedDay(info.checked_at)}`;
  }
  if (outcome === 'ON_TIME' && info.checked_at_unknown) return `${label} - Due ${due ?? '—'}, Check Date Unknown`;
  return due ? `${label} - Due ${due}` : label;
}

/** Today's date (YYYY-MM-DD) in the school time zone. */
export function schoolTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
