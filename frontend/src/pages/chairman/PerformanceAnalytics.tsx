import { useQuery } from '@tanstack/react-query';

import RegistryPerformancePanel from '../../components/registers/RegistryPerformancePanel';
import { ROLE_LABELS } from '../../constants/roles';
import { getRoleLabel } from '../../utils/roleUtils';
import { getStaffPerformance } from '../../services/dashboardService';

interface PerformanceData {
  userId: number;
  name: string;
  role: keyof typeof ROLE_LABELS;
  totalTasks: number;
  completedTasks: number;
  delayedTasks: number;
  performanceScore: number;
  delayRate: number;
  totalRegisters: number;
  completedRegisters: number;
  missedRegisters: number;
  rejectedRegisters: number;
  registerPerformance: number;
  overallPerformance: number;
}

/** Light, professional per-column colors for the Staff performance table
 * below, replacing the old whole-row red/green highlight (which painted
 * every column the same color regardless of what it measured). Each
 * column keeps its own subtle tint so figures stay easy to tell apart
 * without being loud or reducing contrast. */
type StaffColumnColor = 'blue' | 'green' | 'red' | 'cyan' | 'purple' | 'indigo' | 'teal';

const STAFF_COLUMN_COLOR: Record<StaffColumnColor, { header: string; text: string }> = {
  blue: { header: 'bg-blue-50 text-blue-700', text: 'text-blue-700' },
  green: { header: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-700' },
  red: { header: 'bg-red-50 text-red-700', text: 'text-red-700' },
  cyan: { header: 'bg-cyan-50 text-cyan-700', text: 'text-cyan-700' },
  purple: { header: 'bg-purple-50 text-purple-700', text: 'text-purple-700' },
  indigo: { header: 'bg-indigo-50 text-indigo-700', text: 'text-indigo-700' },
  teal: { header: 'bg-teal-50 text-teal-700', text: 'text-teal-700' }
};

function PerformanceAnalytics() {
  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['staffPerformance'],
    queryFn: getStaffPerformance
  });

  const staffRows = (performanceData ?? []) as PerformanceData[];

  if (performanceLoading) {
    return <div className="p-6">Loading...</div>;
  }

  const totalTasks = staffRows.reduce((sum, user) => sum + user.totalTasks, 0);
  const totalCompleted = staffRows.reduce((sum, user) => sum + user.completedTasks, 0);
  const totalDelayed = staffRows.reduce((sum, user) => sum + user.delayedTasks, 0);
  const schoolAverage = totalTasks ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const delayRate = totalTasks ? Math.round((totalDelayed / totalTasks) * 100) : 0;
  const topPerformer = [...staffRows].sort(
    (left, right) => right.overallPerformance - left.overallPerformance
  )[0];

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
          <p className="text-sm text-[#5B6E8C]">Top performer</p>
          <p className="mt-3 text-xl font-semibold text-[#1E293B]">
            {topPerformer ? getRoleLabel(topPerformer.role) : 'N/A'}
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
          <p className="text-sm text-[#5B6E8C]">Delay rate</p>
          <p className="mt-3 text-xl font-semibold text-[#1E293B]">{delayRate}%</p>
          <p className="mt-2 text-sm text-[#8A99B0]">Share of tasks currently delayed.</p>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#1E293B]">Staff performance</h2>
          {/* Export buttons removed from here — Staff Performance values are
              now included directly in the Register Monitoring export
              (Chairman -> Register Monitoring -> Export), scoped to whatever
              filters are applied there, instead of a second, separate
              export flow. */}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EFF2F6]">
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Role</th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.blue.header}`}>
                  Total tasks
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.green.header}`}>
                  Completed
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.red.header}`}>
                  Delayed
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.red.header}`}>
                  Delay rate
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.purple.header}`}>
                  Task performance
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.cyan.header}`}>
                  Total registers
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.green.header}`}>
                  Completed
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.red.header}`}>
                  Missed
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.red.header}`}>
                  Rejected
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.indigo.header}`}>
                  Register performance
                </th>
                <th className={`px-4 py-3 text-left font-medium ${STAFF_COLUMN_COLOR.teal.header}`}>
                  Overall performance
                </th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((user) => (
                <tr key={user.userId} className="border-b border-[#EFF2F6] hover:bg-[#FAFCFE]">
                  <td className="px-4 py-3 text-[#5B6E8C]">{getRoleLabel(user.role)}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.blue.text}`}>{user.totalTasks}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.green.text}`}>{user.completedTasks}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.red.text}`}>{user.delayedTasks}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.red.text}`}>{user.delayRate}%</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.purple.text}`}>{user.performanceScore}%</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.cyan.text}`}>{user.totalRegisters}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.green.text}`}>{user.completedRegisters}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.red.text}`}>{user.missedRegisters}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.red.text}`}>{user.rejectedRegisters}</td>
                  <td className={`px-4 py-3 ${STAFF_COLUMN_COLOR.indigo.text}`}>{user.registerPerformance}%</td>
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