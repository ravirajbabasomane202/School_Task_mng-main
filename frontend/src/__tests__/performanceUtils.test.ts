import { describe, expect, it } from 'vitest';
import { PERFORMANCE_LABELS } from '../constants/performanceLabels';
import type { StaffPerformance } from '../services/dashboardService';
import type { RoleOption } from '../services/roleService';
import {
  aggregateByRole,
  buildRoleOptions,
  fallbackRoleLabel,
  filterRowsByRole,
  latestEntries,
  taskBucketTotal,
  toHeadLabel,
} from '../utils/performanceUtils';

const row = (over: Partial<StaffPerformance>): StaffPerformance => ({
  userId: 1, name: 'A', role: 'ADMISSION', roleId: 7, roleName: 'Admission Head',
  totalTasks: 0, completedTasks: 0, onTimeCompleteTasks: 0, completedAfterDueTasks: 0,
  pendingTasks: 0, inProgressTasks: 0, escalatedTasks: 0, delayedTasks: 0,
  performanceScore: 0, delayRate: 0, totalRegisters: 0, checkingCycles: [],
  completedRegisters: 0, onTimeCompleteRegisters: 0, completedAfterDueRegisters: 0,
  pendingRegisters: 0, missedRegisters: 0, rejectedRegisters: 0,
  registerPerformance: 0, overallPerformance: 0, ...over,
});

const roles: RoleOption[] = [
  { id: 7, key: 'ADMISSION', name: 'Admission Head' },
  { id: 9, key: 'Librarian', name: 'Library Head' },
];

describe('role grouping (Admission Head shows 2 tasks, not 1)', () => {
  it('sums two people holding the same role: 2 tasks => total 2', () => {
    const rows = [
      row({ userId: 1, name: 'Anita Rao', totalTasks: 1, pendingTasks: 1 }),
      row({ userId: 2, name: 'Admission Head', totalTasks: 1, inProgressTasks: 1 }),
    ];
    const [admission] = aggregateByRole(filterRowsByRole(rows, 'ADMISSION'), roles);
    expect(admission.totalTasks).toBe(2);
    expect(admission.userCount).toBe(2);
    expect(taskBucketTotal({ ...admission })).toBe(admission.totalTasks);
  });

  it('filters by role key, not by a name that matches someone', () => {
    const rows = [row({ userId: 1, name: 'Admission Head' }), row({ userId: 2, name: 'Zed' })];
    expect(filterRowsByRole(rows, 'ADMISSION')).toHaveLength(2);
    expect(filterRowsByRole(rows, 'ALL')).toHaveLength(2);
  });
});

describe('roles come from the backend', () => {
  it('a new role appears in options and rows with no code change', () => {
    const rows = [row({ role: 'Librarian', roleId: 9, roleName: 'Library Head', totalTasks: 3 })];
    // EVERY backend role is offered, with " Head" added once; the value is the role key.
    expect(buildRoleOptions(roles, rows)).toEqual([
      { key: 'ADMISSION', label: 'Admission Head' },
      { key: 'Librarian', label: 'Library Head' },
    ]);
    expect(aggregateByRole(rows, roles)[0].roleName).toBe('Library Head');
  });

  it('lists roles that have no performance rows yet', () => {
    const withTransport = [...roles, { id: 11, key: 'TRANSPORT', name: 'Transport' }];
    expect(buildRoleOptions(withTransport, []).map((o) => o.label)).toEqual([
      'Admission Head', 'Library Head', 'Transport Head',
    ]);
  });

  it('a renamed role keeps working and shows the new name', () => {
    const renamed = roles.map((r) => (r.id === 9 ? { ...r, name: 'Knowledge Centre Head' } : r));
    const rows = [row({ role: 'Librarian', roleId: 9, roleName: 'Library Head', totalTasks: 3 })];
    expect(buildRoleOptions(renamed, rows).find((o) => o.key === 'Librarian')).toEqual({
      key: 'Librarian', label: 'Knowledge Centre Head',
    });
    expect(filterRowsByRole(rows, 'Librarian')).toHaveLength(1);
  });

  it('uses a safe fallback label when a role is missing', () => {
    expect(fallbackRoleLabel('FRONT_DESK')).toBe('Front Desk');
    expect(fallbackRoleLabel('')).toBe('Unknown Role');
    const rows = [row({ role: 'GHOST_ROLE', roleName: undefined, totalTasks: 1 })];
    expect(aggregateByRole(rows, [])[0].roleName).toBe('Ghost Role');
  });
});

describe('labels', () => {
  it('uses the agreed names, all Title Case', () => {
    expect(PERFORMANCE_LABELS.onTimeChecked).toBe('On Time Checked');
    expect(PERFORMANCE_LABELS.checkedAfterDueDate).toBe('Checked After Due Date');
    expect(PERFORMANCE_LABELS.notChecked).toBe('Not Checked');
    for (const label of Object.values(PERFORMANCE_LABELS)) {
      expect(label.split(' ').every((w) => /^[A-Z]/.test(w))).toBe(true);
    }
  });
});

describe('latestEntries (Recent Activity)', () => {
  const entries = Array.from({ length: 8 }, (_, i) => ({ date: `2026-10-0${i + 1}` }));
  it('returns the latest 5, newest first, with a +N more count', () => {
    const { shown, more } = latestEntries(entries, 5);
    expect(shown.map((e) => e.date)).toEqual(['2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04']);
    expect(more).toBe(3);
  });
  it('shows no indicator when there are 5 or fewer', () => {
    expect(latestEntries(entries.slice(0, 5), 5).more).toBe(0);
  });
});


describe('toHeadLabel', () => {
  it('adds " Head" to the end of a role name', () => {
    expect(toHeadLabel('Admission')).toBe('Admission Head');
    expect(toHeadLabel('Front Desk / Reception')).toBe('Front Desk / Reception Head');
    expect(toHeadLabel('HR')).toBe('HR Head');
    expect(toHeadLabel('Headmaster')).toBe('Headmaster Head'); // only a trailing word "Head" counts
  });

  it('never adds it twice (any case)', () => {
    expect(toHeadLabel('Admission Head')).toBe('Admission Head');
    expect(toHeadLabel('admission head')).toBe('Admission Head');
    expect(toHeadLabel('Admin HEAD')).toBe('Admin HEAD');
    expect(toHeadLabel('Head')).toBe('Head');
  });

  it('is display only: it does not change the role key', () => {
    const [option] = buildRoleOptions([{ id: 1, key: 'ADMISSION', name: 'Admission' }], []);
    expect(option).toEqual({ key: 'ADMISSION', label: 'Admission Head' });
  });

  it('handles blanks and extra spaces', () => {
    expect(toHeadLabel('')).toBe('');
    expect(toHeadLabel(null)).toBe('');
    expect(toHeadLabel('  Principal  ')).toBe('Principal Head');
  });
});
