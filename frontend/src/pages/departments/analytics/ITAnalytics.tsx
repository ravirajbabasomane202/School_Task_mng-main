import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { useSelector } from 'react-redux';
import api from '../../../services/api';
import type { RootState } from '../../../store';

const COLORS = ['#3B82F6', '#F59E0B', '#22C55E', '#EF4444', '#8B5CF6'];

const StatCard: React.FC<{ label: string; value: string | number; color: string; icon: string }> = ({
  label, value, color, icon,
}) => (
  <div className="rounded-xl border border-[#EFF2F6] bg-white p-5 shadow-sm flex items-center gap-4">
    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${color}`}>{icon}</div>
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[#8A99B0]">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-[#1E293B]">{value}</p>
    </div>
  </div>
);

const ITAnalytics: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'it', user?.department_id],
    queryFn: async () => {
      const params = user?.department_id ? { department_id: user.department_id } : {};
      const res = await api.get('/dashboard/analytics/it', { params });
      return res.data.data ?? res.data;
    },
  });

  const assetStats = useQuery({
    queryKey: ['assets', 'stats'],
    queryFn: async () => {
      const res = await api.get('/assets/stats');
      return res.data.data ?? res.data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-600" />
      </div>
    );
  }

  const { summary, monthly, taskStatusData } = data;
  const assets = assetStats.data ?? {};

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600">IT &amp; ERP</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#1E293B]">IT Department Analytics</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Asset management, task performance, and infrastructure overview</p>
      </div>

      {/* Task KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={summary.total} color="bg-cyan-100 text-cyan-700" icon="📋" />
        <StatCard label="Completed" value={summary.completed} color="bg-green-100 text-green-700" icon="✅" />
        <StatCard label="Delayed" value={summary.delayed} color="bg-red-100 text-red-700" icon="⚠️" />
        <StatCard label="Completion %" value={`${summary.completionPct}%`} color="bg-blue-100 text-blue-700" icon="📈" />
      </div>

      {/* Asset KPIs */}
      {assets && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Assets" value={assets.total ?? 0} color="bg-purple-100 text-purple-700" icon="🖥️" />
          <StatCard label="Active" value={assets.active ?? 0} color="bg-green-100 text-green-700" icon="🟢" />
          <StatCard label="In Maintenance" value={assets.maintenance ?? 0} color="bg-amber-100 text-amber-700" icon="🔧" />
          <StatCard label="Disposed" value={assets.disposed ?? 0} color="bg-gray-100 text-gray-700" icon="🗑️" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Task Status Pie */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Task Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={taskStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {taskStatusData.map((entry: { color: string }, i: number) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Status breakdown bars */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Status Breakdown</h3>
          <div className="space-y-3">
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
                  <div className="h-2 rounded-full" style={{ width: summary.total ? `${(value / summary.total) * 100}%` : '0%', backgroundColor: color }} />
                </div>
                <span className="w-8 text-right text-xs font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Monthly Task Completion Trend</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={monthly} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="completed" name="Completed" stroke="#22C55E" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total" name="Total" stroke="#CBD5E1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ITAnalytics;
