import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import RegistryPerformancePanel from '../../components/registers/RegistryPerformancePanel';
import { PERFORMANCE_LABELS as L } from '../../constants/performanceLabels';
import { useRoles } from '../../hooks/useRoles';
import { getStaffPerformance, type StaffPerformance } from '../../services/dashboardService';
import {
  aggregateByRole,
  buildRoleOptions,
  filterRowsByRole,
  summarizeTaskTotals,
  toHeadLabel
} from '../../utils/performanceUtils';

/** Light, professional per-column colors for the Task performance / Register
 * performance tables below, replacing the old whole-row red/green highlight
 * (which painted every column the same color regardless of what it
 * measured). Each column keeps its own subtle tint so figures stay easy to
 * tell apart without being loud or reducing contrast. */
type StaffColumnColor = 'blue' | 'green' | 'red' | 'cyan' | 'purple' | 'indigo';

const STAFF_COLUMN_COLOR: Record<StaffColumnColor, { header: string; text: string }> = {
  blue: { header: 'bg-[#2E75B6] text-white', text: 'text-blue-700' },
  green: { header: 'bg-[#2E75B6] text-white', text: 'text-emerald-700' },
  red: { header: 'bg-[#2E75B6] text-white', text: 'text-red-700' },
  cyan: { header: 'bg-[#2E75B6] text-white', text: 'text-cyan-700' },
  purple: { header: 'bg-[#2E75B6] text-white', text: 'text-purple-700' },
  indigo: { header: 'bg-[#2E75B6] text-white', text: 'text-indigo-700' }
};

/** Soft tints for the three completion categories (same palette as the exports). */
const CATEGORY_CELL = {
  onTime: 'bg-[#E3F6E8] text-[#14532D]',
  late: 'bg-[#FEF3C7] text-[#78350F]',
  pending: 'bg-[#FDE2E2] text-[#7F1D1D]'
};

function PerformanceAnalytics() {
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const { roles, getRoleName } = useRoles();
  // ONE label for a role everywhere on this page (dropdown, both tables, top performer).
  // Department roles read "<Name> Head"; Chairman, Director and Principal stay plain.
  const roleLabel = (key: string, rowName?: string | null) => toHeadLabel(getRoleName(key, rowName));
  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['staffPerformance'],
    queryFn: () => getStaffPerformance()
  });

  const allRows = (performanceData ?? []) as StaffPerformance[];

  if (performanceLoading) {
    return <div className="p-6">Loading...</div>;
  }

  // Role list comes from the backend; the filter value is the role KEY, so
  // renaming a role changes only its label.
  const roleOptions = buildRoleOptions(roles, allRows);
  const staffRows = filterRowsByRole(allRows, roleFilter);
  const roleRows = aggregateByRole(staffRows, roles);

  const sum = (pick: (row: (typeof roleRows)[number]) => number) =>
    roleRows.reduce((acc, row) => acc + pick(row), 0);
  // Same helper the Dashboard's Task cards use, so both screens show the same numbers.
  const { totalTasks } = summarizeTaskTotals(staffRows);
  const totalCompleted = sum((r) => r.completedTasks);
  const schoolAverage = totalTasks ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const topPerformer = [...roleRows].sort(
    (left, right) => right.overallPerformance - left.overallPerformance
  )[0];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="performance-role-filter" className="text-sm font-semibold text-[#1E293B]">
            Filter Tasks and Registers by Role
          </label>
          <select
            id="performance-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
          >
            <option value="ALL">All Roles</option>
            {roleOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
          <p className="text-sm text-[#5B6E8C]">Top performer</p>
          <p className="mt-3 text-xl font-semibold text-[#1E293B]">
            {topPerformer ? roleLabel(topPerformer.role, topPerformer.roleName) : 'N/A'}
          </p>
          <p className="mt-2 text-sm text-[#8A99B0]">
            {topPerformer ? `${topPerformer.overallPerformance}% performance` : 'No task data yet'}
          </p>
        </div>

        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
          <p className="text-sm text-[#5B6E8C]">School average</p>
          <p className="mt-3 text-xl font-semibold text-[#1E293B]">{schoolAverage}%</p>
          <p className="mt-2 text-sm text-[#8A99B0]">Completion across all tracked staff.</p>
        </div>

        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
          <p className="text-sm text-[#5B6E8C]">{L.totalTasks}</p>
          <p className="mt-3 text-xl font-semibold text-[#1E293B]">{totalTasks}</p>
          <p className="mt-2 text-sm text-[#8A99B0]">Same total as the table below.</p>
        </div>
      </div>

      {/* Task performance — its own table, separate from Register
          performance below, so each metric reads as its own report instead
          of one wide combined row. */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#1E293B]">Task Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EFF2F6]">
                <th className="pl-6 pr-4 py-3 text-left font-semibold bg-[#2E75B6] text-white">{L.role}</th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.blue.header}`}>
                  {L.totalTasks}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.green.header}`}>
                  {L.onTimeComplete}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.green.header}`}>
                  {L.completedAfterDueDate}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.red.header}`}>
                  {L.pending}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.cyan.header}`}>
                  {L.inProgress}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.red.header}`}>
                  {L.delayed}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.red.header}`}>
                  {L.escalated}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.purple.header}`}>
                  {L.taskPerformance}
                </th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map((row) => (
                <tr key={row.role} className="border-b border-[#EFF2F6] hover:bg-[#FAFCFE]">
                  <td className="pl-6 pr-4 py-3 text-left text-[#5B6E8C]">{roleLabel(row.role, row.roleName)}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.blue.text}`}>{row.totalTasks}</td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.onTime}`}>{row.onTimeCompleteTasks}</td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.late}`}>{row.completedAfterDueTasks}</td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.pending}`}>{row.pendingTasks}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.cyan.text}`}>{row.inProgressTasks}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.red.text}`}>{row.delayedTasks}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.red.text}`}>{row.escalatedTasks}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.purple.text}`}>{row.performanceScore}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RegistryPerformancePanel roleFilter={roleFilter} />
    </div>
  );
}

export default PerformanceAnalytics;