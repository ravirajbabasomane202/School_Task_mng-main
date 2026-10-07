import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { useSelector } from 'react-redux';
import api from '../../../services/api';
import type { RootState } from '../../../store';

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

const TransportAnalytics: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  const taskData = useQuery({
    queryKey: ['analytics', 'transport', user?.department_id],
    queryFn: async () => {
      const params = user?.department_id ? { department_id: user.department_id } : {};
      const res = await api.get('/dashboard/analytics/transport', { params });
      return res.data.data ?? res.data;
    },
  });

  // Assets scoped to transport (VEHICLE category)
  const assetData = useQuery({
    queryKey: ['assets', 'transport'],
    queryFn: async () => {
      const res = await api.get('/assets', { params: { category: 'VEHICLE' } });
      return (res.data.data ?? res.data) as Array<{ status: string; condition: string }>;
    },
  });

  // Purchase orders for maintenance spend
  const poData = useQuery({
    queryKey: ['purchase-orders', 'transport'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders');
      return (res.data.data ?? res.data) as Array<{ status: string; total_amount: number }>;
    },
  });

  if (taskData.isLoading || !taskData.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-orange-600" />
      </div>
    );
  }

  const { summary, monthly, taskStatusData } = taskData.data;
  const assets = assetData.data ?? [];
  const orders = poData.data ?? [];

  const fleetCondition = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'].map((c) => ({
    name: c,
    count: assets.filter((a) => a.condition === c).length,
  }));

  const fleetStatus = ['ACTIVE', 'MAINTENANCE', 'DISPOSED'].map((s) => ({
    name: s,
    count: assets.filter((a) => a.status === s).length,
  }));

  const totalSpend = orders
    .filter((o) => o.status === 'ORDERED' || o.status === 'APPROVED')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Transport</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#1E293B]">Transport Department Analytics</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Fleet health, maintenance tasks, and operational performance</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={summary.total} color="bg-orange-100 text-orange-700" icon="📋" />
        <StatCard label="Fleet Vehicles" value={assets.length} color="bg-blue-100 text-blue-700" icon="🚌" />
        <StatCard label="In Maintenance" value={assets.filter((a) => a.status === 'MAINTENANCE').length} color="bg-amber-100 text-amber-700" icon="🔧" />
        <StatCard label="Approved Spend" value={`₦${totalSpend.toLocaleString()}`} color="bg-green-100 text-green-700" icon="💰" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fleet condition */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Fleet Condition</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fleetCondition} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Vehicles" fill="#F97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Fleet status pie */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Fleet Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={fleetStatus} cx="50%" cy="50%" outerRadius={70} dataKey="count"
                label={({ name, count }) => count > 0 ? `${name}: ${count}` : ''}>
                {fleetStatus.map((_, i) => (
                  <Cell key={i} fill={['#22C55E', '#F59E0B', '#9CA3AF'][i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Task status distribution */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Task Status Breakdown</h3>
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
                  <div className="h-2 rounded-full"
                    style={{ width: summary.total ? `${(value / summary.total) * 100}%` : '0%', backgroundColor: color }} />
                </div>
                <span className="w-8 text-right text-xs font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Completion % card */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5 flex flex-col items-center justify-center">
          <p className="text-sm font-semibold text-[#1E293B] mb-2">Overall Completion Rate</p>
          <div className="relative flex items-center justify-center h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#EFF2F6" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none" stroke="#F97316" strokeWidth="10"
                strokeDasharray={`${(summary.completionPct / 100) * 314} 314`} strokeLinecap="round" />
            </svg>
            <span className="absolute text-2xl font-bold text-[#1E293B]">{summary.completionPct}%</span>
          </div>
          <p className="mt-2 text-xs text-[#8A99B0]">{summary.completed} of {summary.total} tasks completed</p>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Monthly Task Trend</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={monthly} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="total" name="Total" stroke="#CBD5E1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="completed" name="Completed" stroke="#F97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TransportAnalytics;
