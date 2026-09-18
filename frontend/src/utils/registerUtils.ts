import type { Register } from '../types/register.types';
import { formatDate, todayISO } from './dateUtils';

export interface RegisterUpdatability {
  updatable: boolean;
  /** Human-readable explanation, set whenever `updatable` is false. */
  reason?: string;
}

/**
 * The one date "Update Status" is currently allowed to act on for this
 * register: `register.current_due_date`, computed by the BACKEND as today
 * for DAILY registers, or the most recent cyclic occurrence at/before today
 * (walked from `start_date` + `checking_cycle`) for every other cycle.
 *
 * IMPORTANT: this is deliberately NOT `register.next_due_date`. That field
 * is set once at register creation and never advances on its own — "Edit
 * This Occurrence" (the only thing the quick action and the calendar popup
 * ever call) intentionally never mutates the shared Register row (see
 * `update_occurrence_status` on the backend) — so for any register whose
 * series has moved past its very first due date, `next_due_date` is simply
 * stale. Example: a WEEKLY register that started 18 Aug 2026 has cyclic
 * occurrences on 18, 25 Aug, then 1, 8, 15, 22, 29 Sep, ... — but
 * `next_due_date` stays frozen at 25 Aug 2026 forever. On 18 Sep 2026,
 * `current_due_date` correctly resolves to 15 Sep 2026 (the most recent
 * occurrence not yet in the future) — the same cell the calendar itself
 * highlights as due — while `next_due_date` would wrongly point at a date
 * over three weeks in the past.
 *
 * The cyclic math is intentionally done server-side (same step function the
 * calendar's own occurrence generator uses) rather than re-implemented here,
 * so the two can never drift apart.
 *
 * Returns `null` when the register's series hasn't started yet
 * (`start_date` is still in the future) — there is nothing to update yet.
 */
export function currentCycleOccurrenceDate(register: Register): string | null {
  return register.current_due_date ?? null;
}

/**
 * Decide whether a Register's status can currently be updated — purely from
 * data the API already returns (`current_due_date`, `status`), no new
 * backend endpoint required.
 *
 * A register is updatable once it has a current cyclic occurrence at all
 * (`current_due_date` is set — i.e. its series has actually started) AND
 * that occurrence hasn't already been recorded. A missed cycle stays
 * flagged as due (by design: it can be caught up on any later day, and
 * `current_due_date` keeps pointing at the same overdue occurrence until it
 * is recorded — see `generate_occurrences` on the Register model for the
 * same off-cycle allowance).
 *
 * What closes the door until the next cycle is the `status` check below:
 * the API returns the current cycle's own recorded outcome in
 * `register.status` — the occurrence at `current_due_date` — when one
 * exists (falling back to the register's stale default otherwise), so once
 * that date has been recorded, this correctly disables until
 * `current_due_date` itself moves on to the next occurrence (which happens
 * automatically as today advances, no explicit "advance the cycle" step
 * needed).
 */
export function isRegisterUpdatable(register: Register): RegisterUpdatability {
  const dueDate = currentCycleOccurrenceDate(register);
  if (!dueDate) {
    return {
      updatable: false,
      reason: `Status can only be updated once the register's Start Date (${formatDate(
        register.start_date
      )}) arrives.`,
    };
  }

  if (register.status === 'OK' || register.status === 'REJECTED') {
    return { updatable: false, reason: 'Already recorded for the current cycle.' };
  }

  return { updatable: true };
}

/**
 * Whether a specific calendar date (YYYY-MM-DD) is the one date this
 * register can currently be edited from — the cycle's exact current due
 * date (see `currentCycleOccurrenceDate`) — and only while the register as
 * a whole is updatable per `isRegisterUpdatable` (so an already-closed or
 * not-yet-started cycle blocks editing even on that cell).
 */
export function isEditableOccurrenceDate(register: Register, date: string, today: string = todayISO()): boolean {
  void today; // kept for call-site backward compatibility; the due date now comes from the backend.
  if (!isRegisterUpdatable(register).updatable) {
    return false;
  }
  return date === currentCycleOccurrenceDate(register);
}