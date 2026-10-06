export type RegisterCycle = 'DAILY' | 'WEEKLY' | '15_DAYS' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type RegisterPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type RegisterStatus = 'IDLE' | 'OK' | 'REJECTED';

// Auto-derived status shown on the calendar (Section 7 of the spec):
// COMPLETED (on time), PENDING (due date passed, no record), FAILED (rejected),
// UPCOMING (future scheduled date).
export type RegisterComputedStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'UPCOMING';
export type RegisterDotColor = 'green' | 'yellow' | 'red' | 'gray';

export const STATUS_DOT_COLOR: Record<RegisterComputedStatus, RegisterDotColor> = {
  COMPLETED: 'green',
  PENDING: 'yellow',
  FAILED: 'red',
  UPCOMING: 'gray',
};

export const REGISTER_CYCLES: { value: RegisterCycle; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: '15_DAYS', label: '15 Days' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-Yearly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export const REGISTER_PRIORITIES: { value: RegisterPriority; label: string }[] = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export const REGISTER_STATUSES: { value: RegisterStatus; label: string }[] = [
  { value: 'IDLE', label: 'Idle' },
  { value: 'OK', label: 'OK' },
  { value: 'REJECTED', label: 'Rejected' },
];

export interface Register {
  id: number;
  name: string;
  register_no: string;
  head_id?: number | null;
  head_name: string;
  /** Preferred field going forward — see task: rename "Cycle" to "Checking Cycle". */
  checking_cycle: RegisterCycle;
  /** @deprecated use checking_cycle */
  cycle: RegisterCycle;
  priority: RegisterPriority;
  status: RegisterStatus;
  computed_status: RegisterComputedStatus;
  dot_color: RegisterDotColor;
  start_date: string;
  next_due_date: string;
  /**
   * The date "Update Status" actually targets right now — the most recent
   * cyclic occurrence at/before today (today itself for DAILY), computed by
   * the backend from `start_date` + `checking_cycle`. This is deliberately
   * NOT `next_due_date`, which is frozen at creation and never advances, so
   * it goes stale as soon as a register has been due more than once (e.g. a
   * WEEKLY register that started 18 Aug 2026 keeps `next_due_date` at
   * 25 Aug 2026 forever, while `current_due_date` correctly walks forward
   * to 15 Sep, 22 Sep, ... as today advances). `null` means the series
   * hasn't started yet (`start_date` is in the future).
   */
  current_due_date: string | null;
  /**
   * The register's CURRENT checking period (inclusive, YYYY-MM-DD): the day
   * for DAILY, Monday–Sunday for WEEKLY, the calendar month for MONTHLY, and
   * so on for every cycle. `null` until the register's start date arrives.
   */
  current_period_start: string | null;
  current_period_end: string | null;
  /** A check has already been recorded in the current period. */
  checked_in_current_period: boolean;
  /**
   * Whether "Check Register" is available right now. Decided by the backend
   * (one check per period), so the button state can't drift from the rule
   * the API itself enforces.
   */
  can_check: boolean;
  /** Why `can_check` is false (already checked / not started yet). */
  check_block_reason: string | null;
  last_completed_date?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at?: string;
}

/** A user eligible to be selected as a Register's Head Name. */
export interface RegisterHead {
  id: number;
  name: string;
  role: string;
  department_id?: number | null;
  department_name?: string | null;
}

export interface CreateRegisterPayload {
  name: string;
  register_no: string;
  head_id: number | '';
  checking_cycle: RegisterCycle;
  priority: RegisterPriority;
  start_date: string;
}

export interface RegisterFilters {
  search?: string;
  cycle?: RegisterCycle;
  priority?: RegisterPriority;
  status?: RegisterStatus;
  /** Filters registers to the ones assigned to this Head (user id). */
  head_id?: number;
}

export interface RegisterCalendarEvent {
  /**
   * Composite `"{registerId}:{date}"` — display-only React key. This is NOT
   * what identifies the occurrence to the backend for updates; it is never
   * sent in an update request.
   */
  id: string;
  register_id: number;
  /**
   * The real, unique identity of this occurrence once it has been
   * individually edited at least once (the `RegisterOccurrence.id` row).
   * `null` until the occurrence has never been touched — in that case the
   * update endpoint is addressed by `register_id` + `occurrence_date`
   * instead, and the backend upserts the row on first edit.
   */
  occurrence_id: number | null;
  /** The exact calendar date this occurrence falls on (YYYY-MM-DD). Required, alongside register_id, to update only this one occurrence. */
  occurrence_date: string;
  /** The checking period this entry represents (inclusive). `date` is its start. */
  period_start?: string;
  period_end?: string;
  /** When the check was recorded (ISO), or null if unchecked. */
  completed_at?: string | null;
  title: string;
  date: string;
  status: RegisterStatus;
  computed_status: RegisterComputedStatus;
  color: 'gray' | 'green' | 'red';
  dot_color: RegisterDotColor;
  is_future_or_pending: boolean;
  register: Register;
}

export interface RegisterCalendarEntry {
  /** Start date of the checking period this entry represents. */
  date: string;
  status: RegisterComputedStatus;
  dot_color: RegisterDotColor;
  occurrence_id: number | null;
  period_start?: string;
  period_end?: string;
  /** The period is still running (today falls inside it). */
  is_open?: boolean;
}

export interface RegisterCalendarResponse {
  register: Register;
  month: string;
  entries: RegisterCalendarEntry[];
}