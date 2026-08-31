import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import RegistryPerformancePanel from '../../components/registers/RegistryPerformancePanel';
import { ROLE_LABELS } from '../../constants/roles';
import { getRoleLabel } from '../../utils/roleUtils';
import { getMonthlyComparison, getStaffPerformance } from '../../services/dashboardService';
import { exportPerformanceReport } from '../../services/reportService';

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
  registerPerformance: number;
  overallPerformance: number;
}

interface MonthlyDepartmentData {
  departmentId: number;
  name: string;
  monthlyRates: Array<{
    month: string;
    completionRate: number;
    totalTasks: number;
    completedTasks: number;
  }>;
}

const MONTH_ORDER = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

function PerformanceAnalytics() {
  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['staffPerformance'],
    queryFn: getStaffPerformance
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['monthlyComparison'],
    queryFn: getMonthlyComparison
  });

  const staffRows = (performanceData ?? []) as PerformanceData[];
  const monthlyRows = (monthlyData ?? []) as MonthlyDepartmentData[];

  const departmentEfficiency = useMemo(() => {
    return monthlyRows
      .map((department) => {
        const latestMonth = [...department.monthlyRates]
          .sort(
            (left, right) =>
              MONTH_ORDER.indexOf(left.month as (typeof MONTH_ORDER)[number]) -
              MONTH_ORDER.indexOf(right.month as (typeof MONTH_ORDER)[number])
          )
          .slice(-1)[0];

        return {
          id: department.departmentId,
          name: department.name,
          completionRate: latestMonth?.completionRate ?? 0,
          totalTasks: latestMonth?.totalTasks ?? 0
        };
      })
      .sort((left, right) => right.completionRate - left.completionRate);
  }, [monthlyRows]);

  if (performanceLoading || monthlyLoading) {
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
        <h2 className="mb-4 text-xl font-semibold text-[#1E293B]">Department efficiency</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departmentEfficiency.map((department) => (
            <div
              className="rounded-[16px] border border-[#EFF2F6] bg-[#FAFCFE] p-4"
              key={department.id}
            >
              <p className="text-sm font-semibold text-[#1E293B]">{department.name}</p>
              <p className="mt-3 text-2xl font-semibold text-[#185FA5]">
                {department.completionRate}%
              </p>
              <p className="mt-2 text-sm text-[#8A99B0]">
                Based on {department.totalTasks} tasks in the latest tracked month.
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#1E293B]">Staff performance</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportPerformanceReport('excel')}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B] hover:bg-[#FAFCFE]"
            >
              Export Performance Report (Excel)
            </button>
            <button
              type="button"
              onClick={() => exportPerformanceReport('pdf')}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B] hover:bg-[#FAFCFE]"
            >
              Export (PDF)
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EFF2F6]">
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Role</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Total tasks</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Completed</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Delayed</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Delay rate</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Total registers</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Completed registers</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Task performance</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Register performance</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Overall performance</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((user) => (
                <tr
                  key={user.userId}
                  className={`border-b border-[#EFF2F6] ${
                    user.overallPerformance >= 75
                      ? 'bg-green-50'
                      : user.overallPerformance < 50
                        ? 'bg-red-50'
                        : ''
                  }`}
                >
                  <td className="px-4 py-3 text-[#5B6E8C]">{getRoleLabel(user.role)}</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.totalTasks}</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.completedTasks}</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.delayedTasks}</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.delayRate}%</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.totalRegisters}</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.completedRegisters}</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.performanceScore}%</td>
                  <td className="px-4 py-3 text-[#1E293B]">{user.registerPerformance}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${user.overallPerformance}%` }}
                        />
                      </div>
                      <span className="text-sm text-[#1E293B]">{user.overallPerformance}%</span>
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
