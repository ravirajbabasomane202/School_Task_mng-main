import { describe, expect, it } from 'vitest';
import { isEditableOccurrenceDate, isInCurrentPeriod, isRegisterUpdatable } from '../utils/registerUtils';
import type { Register } from '../types/register.types';

// A WEEKLY register whose current period is Mon 5 Oct – Sun 11 Oct 2026.
function weekly(overrides: Partial<Register> = {}): Register {
  return {
    id: 1,
    name: 'Attendance Register',
    register_no: 'R-1',
    head_name: 'Head',
    checking_cycle: 'WEEKLY',
    cycle: 'WEEKLY',
    priority: 'LOW',
    status: 'IDLE',
    computed_status: 'PENDING',
    dot_color: 'yellow',
    start_date: '2026-01-01',
    next_due_date: '2026-10-05',
    current_due_date: '2026-10-05',
    current_period_start: '2026-10-05',
    current_period_end: '2026-10-11',
    checked_in_current_period: false,
    can_check: true,
    check_block_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('registerUtils (period-based checking)', () => {
  it('enables the check while the current period is unchecked', () => {
    expect(isRegisterUpdatable(weekly())).toEqual({ updatable: true });
  });

  it('allows checking from ANY day of the current period', () => {
    const register = weekly();
    for (const day of ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']) {
      expect(isEditableOccurrenceDate(register, day)).toBe(true);
    }
  });

  it('does not treat days outside the current period as checkable', () => {
    const register = weekly();
    expect(isInCurrentPeriod(register, '2026-10-04')).toBe(false);
    expect(isEditableOccurrenceDate(register, '2026-10-04')).toBe(false);
    expect(isEditableOccurrenceDate(register, '2026-10-12')).toBe(false);
  });

  it('disables the check once the period has been checked, with the reason', () => {
    const checked = weekly({
      status: 'OK',
      checked_in_current_period: true,
      can_check: false,
      check_block_reason: 'Already checked for this week.',
    });
    expect(isRegisterUpdatable(checked)).toEqual({ updatable: false, reason: 'Already checked for this week.' });
    expect(isEditableOccurrenceDate(checked, '2026-10-08')).toBe(false);
  });

  it('is disabled before the register has started', () => {
    const notStarted = weekly({
      can_check: false,
      current_period_start: null,
      current_period_end: null,
      check_block_reason: null,
      start_date: '2026-12-01',
    });
    const result = isRegisterUpdatable(notStarted);
    expect(result.updatable).toBe(false);
    expect(result.reason).toMatch(/Start Date/);
  });

  it('re-enables by itself when the backend reports the next period', () => {
    const nextWeek = weekly({
      current_period_start: '2026-10-12',
      current_period_end: '2026-10-18',
      can_check: true,
      checked_in_current_period: false,
    });
    expect(isRegisterUpdatable(nextWeek).updatable).toBe(true);
  });
});
