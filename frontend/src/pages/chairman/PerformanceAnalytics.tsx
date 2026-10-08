import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import RegistryPerformancePanel from '../../components/registers/RegistryPerformancePanel';
import { PERFORMANCE_LABELS as L } from '../../constants/performanceLabels';
import { useRoles } from '../../hooks/useRoles';
import { getStaffPerformance, type StaffPerformance } from '../../services/dashboardService';
import { REGISTER_CYCLES, type RegisterCycle } from '../../types/register.types';
import { aggregateByRole, buildRoleOptions, filterRowsByRole } from '../../utils/performanceUtils';

// Reuse the same Daily/Weekly/... labels the Register screens already use,
// so "Estimated checking cycle" reads the same way everywhere in the app.
const CYCLE_LABEL: Record<string, string> = Object.fromEntries(
  REGISTER_CYCLES.map(({ value, label }) => [value, label])
);

function formatCheckingCycles(cycles: string[]): string {
  if (!cycles.length) return 'N/A';
  return cycles.map((cycle) => CYCLE_LABEL[cycle as RegisterCycle] ?? cycle).join(', ');
}

/** Light, professional per-column colors for the Task performance / Register
 * performance tables below, replacing the old whole-row red/green highlight
 * (which painted every column the same color regardless of what it
 * measured). Each column keeps its own subtle tint so figures stay easy to
 * tell apart without being loud or reducing contrast. */
type StaffColumnColor = 'blue' | 'green' | 'red' | 'cyan' | 'purple' | 'indigo' | 'teal';

const STAFF_COLUMN_COLOR: Record<StaffColumnColor, { header: string; text: string }> = {
  blue: { header: 'bg-[#2E75B6] text-white', text: 'text-blue-700' },
  green: { header: 'bg-[#2E75B6] text-white', text: 'text-emerald-700' },
  red: { header: 'bg-[#2E75B6] text-white', text: 'text-red-700' },
  cyan: { header: 'bg-[#2E75B6] text-white', text: 'text-cyan-700' },
  purple: { header: 'bg-[#2E75B6] text-white', text: 'text-purple-700' },
  indigo: { header: 'bg-[#2E75B6] text-white', text: 'text-indigo-700' },
  teal: { header: 'bg-[#2E75B6] text-white', text: 'text-teal-700' }
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
  const totalTasks = sum((r) => r.totalTasks);
  const totalCompleted = sum((r) => r.completedTasks);
  const totalOnTimeChecked = sum((r) => r.onTimeCompleteRegisters);
  const totalCheckedAfterDue = sum((r) => r.completedAfterDueRegisters);
  const totalNotChecked = sum((r) => r.notCheckedRegisters);
  const totalRejected = sum((r) => r.rejectedRegisters);
  const totalChecksDue = sum((r) => r.registerChecksDue);
  const schoolAverage = totalTasks ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const topPerformer = [...roleRows].sort(
    (left, right) => right.overallPerformance - left.overallPerformance
  )[0];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="performance-role-filter" className="text-xs font-medium text-[#5B6E8C]">
            Role
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
            {topPerformer ? getRoleName(topPerformer.role, topPerformer.roleName) : 'N/A'}
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

      {/* Register check summary. Every card counts register checks (periods) due in
          the selected range and uses the SAME label constants and totals as the
          Register Performance table columns, so a card and its column always
          match and On Time Checked + Checked After Due Date + Not Checked +
          Rejected = Total Estimated Check. */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[#1E293B]">Register Checks</h2>
        <div className="grid gap-4 md:grid-cols-5">
          {[
            { label: L.onTimeChecked, value: totalOnTimeChecked, cls: CATEGORY_CELL.onTime },
            { label: L.checkedAfterDueDate, value: totalCheckedAfterDue, cls: CATEGORY_CELL.late },
            { label: L.notChecked, value: totalNotChecked, cls: CATEGORY_CELL.pending },
            { label: L.rejected, value: totalRejected, cls: CATEGORY_CELL.pending },
            { label: L.totalEstimatedCheck, value: totalChecksDue, cls: 'bg-[#E0F2FE] text-[#0C4A6E]' }
          ].map((card) => (
            <div key={card.label} className={`rounded-[16px] p-4 ${card.cls}`}>
              <h3 className="text-sm font-semibold">{card.label}</h3>
              <p className="mt-2 text-2xl font-semibold">{card.value}</p>
            </div>
          ))}
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
                  {L.onTimeChecked}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.green.header}`}>
                  {L.checkedAfterDueDate}
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
                  <td className="pl-6 pr-4 py-3 text-left text-[#5B6E8C]">{row.roleName}</td>
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

      {/* Register performance — separate table, with its own Total/Completed/
          Missed/Rejected/Estimated checking cycle/Performance columns plus
          Overall performance (which blends both halves), instead of being
          combined into the Task performance table above. */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#1E293B]">Register Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EFF2F6]">
                <th className="pl-6 pr-4 py-3 text-left font-semibold bg-[#2E75B6] text-white">{L.role}</th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.cyan.header}`}>
                  {L.totalRegisters}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.blue.header}`}>
                  {L.checkingCycle}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.green.header}`}>
                  {L.onTimeChecked}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.green.header}`}>
                  {L.checkedAfterDueDate}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.red.header}`}>
                  {L.notChecked}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.red.header}`}>
                  {L.rejected}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.cyan.header}`}>
                  {L.totalEstimatedCheck}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.indigo.header}`}>
                  {L.registerPerformance}
                </th>
                <th className={`px-4 py-3 text-center font-semibold ${STAFF_COLUMN_COLOR.teal.header}`}>
                  {L.overallPerformance}
                </th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map((user) => (
                <tr key={user.role} className="border-b border-[#EFF2F6] hover:bg-[#FAFCFE]">
                  <td className="pl-6 pr-4 py-3 text-left text-[#5B6E8C]">{user.roleName}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.cyan.text}`}>{user.totalRegisters}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.blue.text}`}>
                    {formatCheckingCycles(user.checkingCycles)}
                  </td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.onTime}`}>{user.onTimeCompleteRegisters}</td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.late}`}>{user.completedAfterDueRegisters}</td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.pending}`}>{user.notCheckedRegisters}</td>
                  <td className={`px-4 py-3 text-center ${CATEGORY_CELL.pending}`}>{user.rejectedRegisters}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.cyan.text}`}>{user.registerChecksDue}</td>
                  <td className={`px-4 py-3 text-center ${STAFF_COLUMN_COLOR.indigo.text}`}>{user.registerPerformance}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-teal-500"
                          style={{ width: `${user.overallPerformance}%` }}
                        />
                      </div>
                      <span className={`text-sm font-medium ${STAFF_COLUMN_COLOR.teal.text}`}>
                        {user.overallPerformance}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RegistryPerformancePanel />
    </div>
  );
}

export default PerformanceAnalytics;