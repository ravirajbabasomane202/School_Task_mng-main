import type { Register } from '../types/register.types';
import { formatDate, todayISO } from './dateUtils';

export interface RegisterUpdatability {
  updatable: boolean;
  /** Human-readable explanation, set whenever `updatable` is false. */
  reason?: string;
}

/**
 * Decide whether a Register's status can currently be updated — purely from
 * data the API already returns (`checking_cycle`, `next_due_date`,
 * `status`), no new backend endpoint required.
 *
 * All cycles (DAILY included) are only updatable once their current cycle
 * is actually due, i.e. once `next_due_date` has arrived (due today or
 * overdue). DAILY used to be special-cased to "always updatable", which
 * meant the "Update Status" action never disabled itself after today's
 * entry had already been recorded — this now matches the other cycles.
 *
 * IMPORTANT: `next_due_date` is set once at creation and never advances on
 * its own -- "Edit This Occurrence" (the only thing the quick action and
 * the calendar popup ever call) intentionally never mutates the shared
 * Register row (see `update_occurrence_status` on the backend), so this
 * check alone does NOT "close" a cycle once it's overdue -- it only ever
 * asks "has this series' first due date arrived yet". A missed cycle
 * stays flagged as due (by design: it can be caught up on any later day,
 * not only its exact recurring date -- see `generate_occurrences` on the
 * Register model for the same off-cycle allowance).
 *
 * What actually closes the door until the next cycle is the `status` check
 * below: the API returns the current cycle's own recorded outcome in
 * `register.status` — the occurrence at `currentCycleOccurrenceDate`
 * (today for DAILY, the exact overdue `next_due_date` otherwise) — when one
 * exists (falling back to the register's stale default otherwise), so once
 * that date has been recorded, this correctly disables until the due date
 * itself advances server-side.
 */
export function isRegisterUpdatable(register: Register, today: string = todayISO()): RegisterUpdatability {
  const nextCycleReason = `Status can only be updated for the current cycle. Next cycle starts on ${formatDate(
    register.next_due_date
  )}.`;

  const cycleIsDue = !register.next_due_date || register.next_due_date <= today;
  if (!cycleIsDue) {
    return { updatable: false, reason: nextCycleReason };
  }

  if (register.status === 'OK' || register.status === 'REJECTED') {
    return { updatable: false, reason: 'Already recorded for the current cycle.' };
  }

  return { updatable: true };
}

/**
 * The one date "Update Status" is currently allowed to act on for this
 * register: for DAILY registers that is always today (a daily register is
 * only ever about "did today get done"); for every other cycle it is the
 * register's exact cyclic `next_due_date` — the same date the calendar
 * highlights as due — which can be days or weeks away from today when the
 * cycle is overdue. Both the Register Monitoring quick action and the
 * calendar popup must target this exact date, not "today", or the recorded
 * status lands on the wrong occurrence and never matches what the calendar
 * shows as due.
 */
export function currentCycleOccurrenceDate(register: Register, today: string = todayISO()): string {
  return register.checking_cycle === 'DAILY' ? today : register.next_due_date;
}

/**
 * Whether a specific calendar date (YYYY-MM-DD) is the one date this
 * register can currently be edited from — the cycle's exact current due
 * date (see `currentCycleOccurrenceDate`) — and only while the register as
 * a whole is updatable per `isRegisterUpdatable` (so an already-closed or
 * not-yet-due cycle blocks editing even on that cell).
 */
export function isEditableOccurrenceDate(register: Register, date: string, today: string = todayISO()): boolean {
  if (!isRegisterUpdatable(register, today).updatable) {
    return false;
  }
  return date === currentCycleOccurrenceDate(register, today);
}