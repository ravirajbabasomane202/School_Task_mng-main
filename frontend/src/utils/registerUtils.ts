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
