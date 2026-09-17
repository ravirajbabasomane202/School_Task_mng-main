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
 * - DAILY registers can always be updated (today's entry) — unchanged
 *   behaviour.
 * - WEEKLY / 15_DAYS / MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY registers
 *   are only updatable once their current cycle is actually due, i.e. once
 *   `next_due_date` has arrived (due today or overdue).
 *
 * Recording a status (OK or REJECTED) always advances `next_due_date` to
 * the next cycle server-side (`update_status` / `update_occurrence_status`
 * in the backend both do this), so once a cycle has been recorded,
 * `next_due_date` is already in the future — the same `next_due_date`
 * check below then naturally keeps blocking edits until the next cycle
 * actually arrives, with no separate "already recorded" bookkeeping
 * needed on the front end. The explicit `status` check is kept as a
 * defensive fallback for the (data-anomaly) case where `next_due_date`
 * wasn't advanced.
 */
export function isRegisterUpdatable(register: Register, today: string = todayISO()): RegisterUpdatability {
  if (register.checking_cycle === 'DAILY') {
    return { updatable: true };
  }

  const nextCycleReason = `Status can only be updated for the current cycle. Next cycle starts on ${formatDate(
    register.next_due_date
  )}.`;

  const cycleIsDue = !register.next_due_date || register.next_due_date <= today;
  if (!cycleIsDue) {
    return { updatable: false, reason: nextCycleReason };
  }

  if (register.status === 'OK' || register.status === 'REJECTED') {
    return { updatable: false, reason: nextCycleReason };
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