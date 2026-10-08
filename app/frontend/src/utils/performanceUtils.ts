import type { RoleOption } from '../services/roleService';
import type { StaffPerformance } from '../services/dashboardService';

/** Readable fallback when a role is missing from the roles list: "FRONT_DESK" -> "Front Desk". */
export function fallbackRoleLabel(key: string | null | undefined): string {
  if (!key) return 'Unknown Role';
  return String(key)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, (_m, b: string, c: string) => b + c.toUpperCase());
}

/** Display name for a role key: roles list (backend) -> name the row carried -> fallback. */
export function resolveRoleName(
  key: string,
  roles: RoleOption[],
  rowName?: string | null
): string {
  return roles.find((r) => r.key === key)?.name ?? rowName ?? fallbackRoleLabel(key);
}

export interface RoleFilterOption {
  key: string;
  label: string;
}

/**
 * Filter options come from the backend roles list; any role that appears in the
 * performance rows but not in the list is still offered (with a fallback label).
 * Identity is the role key, never the display name.
 */
export function buildRoleOptions(roles: RoleOption[], rows: StaffPerformance[]): RoleFilterOption[] {
  const options = new Map<string, string>();
  for (const role of roles) options.set(role.key, role.name);
  for (const row of rows) {
    if (!options.has(row.role)) options.set(row.role, row.roleName ?? fallbackRoleLabel(row.role));
  }
  const present = new Set(rows.map((r) => r.role));
  return Array.from(options, ([key, label]) => ({ key, label }))
    .filter((o) => present.has(o.key))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function filterRowsByRole(rows: StaffPerformance[], roleKey: string): StaffPerformance[] {
  return roleKey === 'ALL' ? rows : rows.filter((row) => row.role === roleKey);
}

export interface RoleRow {
  role: string;
  roleId: number | null;
  roleName: string;
  userCount: number;
  totalTasks: number;
  completedTasks: number;
  onTimeCompleteTasks: number;
  completedAfterDueTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  escalatedTasks: number;
  delayedTasks: number;
  performanceScore: number;
  totalRegisters: number;
  checkingCycles: string[];
  onTimeCompleteRegisters: number;
  completedAfterDueRegisters: number;
  pendingRegisters: number;
  registerPerformance: number;
  overallPerformance: number;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * One row per ROLE (grouped by the role key, summing every person who holds it),
 * so a role with two people / two tasks reports a total of 2, not 1.
 */
export function aggregateByRole(rows: StaffPerformance[], roles: RoleOption[] = []): RoleRow[] {
  const groups = new Map<string, StaffPerformance[]>();
  for (const row of rows) {
    const list = groups.get(row.role) ?? [];
    list.push(row);
    groups.set(row.role, list);
  }
  const sum = (list: StaffPerformance[], pick: (r: StaffPerformance) => number) =>
    list.reduce((acc, r) => acc + (pick(r) || 0), 0);

  return Array.from(groups, ([role, list]) => {
    const totalTasks = sum(list, (r) => r.totalTasks);
    const completedTasks = sum(list, (r) => r.completedTasks);
    const delayedTasks = sum(list, (r) => r.delayedTasks);
    const onTimeReg = sum(list, (r) => r.onTimeCompleteRegisters);
    const lateReg = sum(list, (r) => r.completedAfterDueRegisters);
    const pendingReg = sum(list, (r) => r.pendingRegisters);
    const totalRegisters = sum(list, (r) => r.totalRegisters);
    const delayRate = pct(delayedTasks, totalTasks);
    const performanceScore = totalTasks
      ? Math.round((completedTasks / totalTasks) * 100 * (1 - delayRate / 100))
      : 0;
    const registerPerformance = pct(onTimeReg + lateReg, onTimeReg + lateReg + pendingReg);
    const overallPerformance =
      totalTasks && totalRegisters
        ? Math.round((performanceScore + registerPerformance) / 2)
        : totalTasks
          ? performanceScore
          : totalRegisters
            ? registerPerformance
            : 0;
    return {
      role,
      roleId: list[0].roleId ?? null,
      roleName: resolveRoleName(role, roles, list[0].roleName),
      userCount: list.length,
      totalTasks,
      completedTasks,
      onTimeCompleteTasks: sum(list, (r) => r.onTimeCompleteTasks),
      completedAfterDueTasks: sum(list, (r) => r.completedAfterDueTasks),
      pendingTasks: sum(list, (r) => r.pendingTasks),
      inProgressTasks: sum(list, (r) => r.inProgressTasks),
      escalatedTasks: sum(list, (r) => r.escalatedTasks),
      delayedTasks,
      performanceScore,
      totalRegisters,
      checkingCycles: Array.from(new Set(list.flatMap((r) => r.checkingCycles ?? []))),
      onTimeCompleteRegisters: onTimeReg,
      completedAfterDueRegisters: lateReg,
      pendingRegisters: pendingReg,
      registerPerformance,
      overallPerformance,
    };
  }).sort((a, b) => a.roleName.localeCompare(b.roleName));
}

/** completed + in progress + pending + delayed + escalated (must equal totalTasks). */
export function taskBucketTotal(row: Pick<RoleRow, 'completedTasks' | 'inProgressTasks' | 'pendingTasks' | 'delayedTasks' | 'escalatedTasks'>): number {
  return row.completedTasks + row.inProgressTasks + row.pendingTasks + row.delayedTasks + row.escalatedTasks;
}

/** Newest first, capped (default 5); `more` is how many older entries are not shown. */
export function latestEntries<T extends { date: string }>(entries: T[], limit = 5): { shown: T[]; more: number } {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return { shown: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}
