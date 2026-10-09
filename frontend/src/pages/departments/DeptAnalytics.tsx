import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import TaskStatusPieChart from '../../components/charts/TaskStatusPieChart';
import api from '../../services/api';
import type { RootState } from '../../store';

interface AnalyticsSummary {
  total: number;
  completed: number;
  delayed: number;
  pending: number;
  inProgress: number;
  escalated: number;
  completionPct: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  monthly: { month: string; total: number; completed: number; completionRate: number }[];
  taskStatusData: { name: string; value: number; color: string }[];
}

const StatCard: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className="rounded-xl border border-[#EFF2F6] bg-white p-4 shadow-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-[#8A99B0]">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
  </div>
);

interface DeptAnalyticsProps {
  roleSlug?: string;
}

const DeptAnalytics: React.FC<DeptAnalyticsProps> = ({ roleSlug }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  const slug = roleSlug ?? user?.role?.toLowerCase() ?? 'dept';

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['dept-analytics', slug, user?.department_id],
    queryFn: async () => {
      const params = user?.department_id ? { department_id: user.department_id } : {};
      const res = await api.get(`/dashboard/analytics/${slug}`, { params });
      return res.data.data ?? res.data;
    }
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  const { summary, monthly, taskStatusData } = data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1E293B]">Department Analytics</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Performance overview for your department</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Tasks" value={summary.total} color="text-gray-900" />
        <StatCard label="Completed" value={summary.completed} color="text-green-600" />
        <StatCard label="Delayed" value={summary.delayed} color="text-red-600" />
        <StatCard label="Completion %" value={`${summary.completionPct}%`} color="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Task Status Distribution</h3>
          <TaskStatusPieChart data={taskStatusData} />
        </div>

        {/* Progress bars */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Status Breakdown</h3>
          <div className="space-y-4">
            {[
              { label: 'Pending', value: summary.pending, color: '#3B82F6' },
              { label: 'In Progress', value: summary.inProgress, color: '#F59E0B' },
              { label: 'Completed', value: summary.completed, color: '#22C55E' },
              { label: 'Delayed', value: summary.delayed, color: '#EF4444' },
              { label: 'Escalated', value: summary.escalated, color: '#8B5CF6' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-24 text-xs text-[#5B6E8C]">{label}</span>
                <div className="h-2 flex-1 rounded-full bg-[#EFF2F6]">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: summary.total ? `${(value / summary.total) * 100}%` : '0%',
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium text-[#1E293B]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Monthly Completion Trend</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="total" name="Total" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" name="Completed" fill="#22C55E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DeptAnalytics;
