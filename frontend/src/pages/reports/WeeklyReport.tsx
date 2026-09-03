import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getWeeklyReport } from '../../services/reportService';

const today = new Date();
const monday = new Date(today);
monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function WeeklyReport() {
  const [dateFrom, setDateFrom] = useState(fmt(monday));
  const [dateTo, setDateTo]     = useState(fmt(sunday));

  const { data: reportData, isLoading, error, refetch } = useQuery({
    queryKey: ['weeklyReport', dateFrom, dateTo],
    queryFn: () => getWeeklyReport({ dateFrom, dateTo }),
    enabled: !!dateFrom && !!dateTo,
  });

  // Build chart data from daily breakdown if available
  const chartData = reportData?.daily ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E293B]">Weekly Report</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Task summary for a selected week</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">From</label>
            <input type="date" value={dateFrom} max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">To</label>
            <input type="date" value={dateTo} min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none" />
          </div>
          <button onClick={() => refetch()}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#1251A0] transition">
            Generate
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load report. Please try again.
        </div>
      )}

      {reportData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Total Tasks', value: reportData.summary?.total ?? reportData.summary?.totalTasks ?? 0, color: 'text-blue-600' },
              { label: 'Completed', value: reportData.summary?.completed ?? 0, color: 'text-green-600' },
              { label: 'Delayed', value: reportData.summary?.delayed ?? 0, color: 'text-red-600' },
              { label: 'In Progress', value: reportData.summary?.inProgress ?? reportData.summary?.in_progress ?? 0, color: 'text-amber-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-[#EFF2F6] bg-white p-5 shadow-sm text-center">
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="mt-1 text-xs text-[#8A99B0]">{label}</p>
              </div>
            ))}
          </div>

          {/* Daily breakdown chart (if available) */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Daily Breakdown</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" name="Completed" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delayed" name="Delayed" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Task list */}
          {Array.isArray(reportData.tasks) && reportData.tasks.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[#EFF2F6] bg-white">
              <div className="border-b border-[#EFF2F6] bg-[#F8F9FC] px-5 py-3">
                <h3 className="text-sm font-semibold text-[#1E293B]">Task Details</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-[#EFF2F6]">
                  <tr>
                    {['Title', 'Assignee', 'Priority', 'Status', 'Due Date'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F4F9]">
                  {reportData.tasks.map((t: any) => (
                    <tr key={t.id} className="hover:bg-[#F8F9FC]">
                      <td className="px-4 py-3 font-medium text-[#1E293B]">{t.title}</td>
                      <td className="px-4 py-3 text-[#5B6E8C]">{t.assignee?.name ?? t.assigned_to ?? '--'}</td>
                      <td className="px-4 py-3 text-[#5B6E8C]">{t.priority}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          t.status === 'DELAYED'   ? 'bg-red-100 text-red-700' :
                          t.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>{t.status?.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8A99B0]">
                        {t.due_date ? new Date(t.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default WeeklyReport;
