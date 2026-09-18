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
 * What actually closes the door for the rest of TODAY is the `status`
 * check below: the API already returns TODAY's own recorded outcome in
 * `register.status` when an occurrence exists for today (falling back to
 * the register's stale default otherwise), so once today has been
 * recorded, this correctly disables until a fresh calendar day resets it
 * server-side.
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
    return { updatable: false, reason: 'Already recorded for today.' };
  }

  return { updatable: true };
}

/**
 * Whether a specific calendar date (YYYY-MM-DD) is the one date this
 * register can currently be edited from — either today or the cycle's
 * current due date — and only while the register as a whole is updatable
 * per `isRegisterUpdatable` (so an already-closed or not-yet-due cycle
 * blocks editing even on today's cell).
 */
export function isEditableOccurrenceDate(register: Register, date: string, today: string = todayISO()): boolean {
  if (!isRegisterUpdatable(register, today).updatable) {
    return false;
  }
  if (register.checking_cycle === 'DAILY') {
    return date === today;
  }
  return date === today || date === register.next_due_date;
}