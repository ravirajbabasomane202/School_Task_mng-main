import type { Register, RegisterCalendarEvent, RegisterDotColor } from '../types/register.types';

/**
 * Per-register Performance counts, built ONLY from the backend's
 * `check_outcome` -- this file never compares a due date with a check time.
 *
 * Unit = one checking period due in the selected range (a period belongs to
 * the range by its `due_date`; a check made after the range end still counts
 * for its original period). Every period is in exactly one bucket, so
 *   onTime + late + notChecked + rejected === total
 * An open period (unchecked, window not over) is not counted yet.
 */
export interface RegisterSummary {
  register: Register;
  onTime: number;
  late: number;
  notChecked: number;
  rejected: number;
  /** onTime + late */
  completed: number;
  total: number;
  completionRate: number;
  /** Newest-first dots for the activity strip. */
  strip: { date: string; color: RegisterDotColor }[];
}

export interface RegisterChecksTotals {
  totalRegisters: number;
  totalChecks: number;
  onTime: number;
  late: number;
  notChecked: number;
  rejected: number;
  completionRate: number;
}

export function summarizeRegisterEvents(
  registers: Register[],
  events: RegisterCalendarEvent[],
  range: { from: string; to: string },
  today: string,
): RegisterSummary[] {
  const byRegister = new Map<number, RegisterSummary>();
  for (const register of registers) {
    byRegister.set(register.id, {
      register, onTime: 0, late: 0, notChecked: 0, rejected: 0,
      completed: 0, total: 0, completionRate: 0, strip: [],
    });
  }

  for (const event of events) {
    const due = event.due_date ?? event.period_start ?? event.date;
    if (due < range.from || due > range.to || due > today) continue;
    const summary = byRegister.get(event.register_id);
    if (!summary) continue;

    switch (event.check_outcome) {
      case 'ON_TIME': summary.onTime += 1; break;
      case 'LATE': summary.late += 1; break;
      case 'DELAYED': summary.notChecked += 1; break;
      case 'REJECTED': summary.rejected += 1; break;
      default: continue; // still open (or an older API without check_outcome)
    }
    summary.strip.push({ date: event.date, color: event.dot_color });
  }

  for (const s of byRegister.values()) {
    s.completed = s.onTime + s.late;
    s.total = s.completed + s.notChecked + s.rejected;
    s.completionRate = s.total ? Math.round((s.completed / s.total) * 100) : 0;
    s.strip.sort((a, b) => b.date.localeCompare(a.date));
  }
  return Array.from(byRegister.values()).sort((a, b) => a.completionRate - b.completionRate);
}

export function totalsFromSummaries(summaries: RegisterSummary[]): RegisterChecksTotals {
  const sum = (pick: (s: RegisterSummary) => number) => summaries.reduce((acc, s) => acc + pick(s), 0);
  const onTime = sum((s) => s.onTime);
  const late = sum((s) => s.late);
  const notChecked = sum((s) => s.notChecked);
  const rejected = sum((s) => s.rejected);
  const totalChecks = onTime + late + notChecked + rejected;
  return {
    totalRegisters: summaries.length,
    totalChecks, onTime, late, notChecked, rejected,
    completionRate: totalChecks ? Math.round(((onTime + late) / totalChecks) * 100) : 0,
  };
}
