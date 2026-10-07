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

const ASSET_CATEGORY_COLORS: Record<string, string> = {
  HARDWARE: '#3B82F6',
  SOFTWARE: '#8B5CF6',
  FURNITURE: '#F59E0B',
  VEHICLE: '#F97316',
};

const PropertyAnalytics: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  const taskData = useQuery({
    queryKey: ['analytics', 'property', user?.department_id],
    queryFn: async () => {
      const params = user?.department_id ? { department_id: user.department_id } : {};
      const res = await api.get('/dashboard/analytics/property', { params });
      return res.data.data ?? res.data;
    },
  });

  const assetData = useQuery({
    queryKey: ['assets', 'property'],
    queryFn: async () => {
      const res = await api.get('/assets');
      return (res.data.data ?? res.data) as Array<{ category: string; status: string; condition: string; purchase_value: number }>;
    },
  });

  const poData = useQuery({
    queryKey: ['purchase-orders', 'property'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders');
      return (res.data.data ?? res.data) as Array<{ status: string; total_amount: number }>;
    },
  });

  const housekeepingData = useQuery({
    queryKey: ['housekeeping'],
    queryFn: async () => {
      const res = await api.get('/housekeeping');
      return (res.data.data ?? res.data) as Array<{ status: string; priority: string; task_type: string }>;
    },
  });

  if (taskData.isLoading || !taskData.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-teal-600" />
      </div>
    );
  }

  const { summary, monthly } = taskData.data;
  const assets = assetData.data ?? [];
  const orders = poData.data ?? [];
  const hkTasks = housekeepingData.data ?? [];

  const totalAssetValue = assets.reduce((sum, a) => sum + (a.purchase_value || 0), 0);
  const pendingPOs = orders.filter((o) => o.status === 'PENDING').length;

  const assetByCategory = ['HARDWARE', 'SOFTWARE', 'FURNITURE', 'VEHICLE'].map((cat) => ({
    name: cat.charAt(0) + cat.slice(1).toLowerCase(),
    count: assets.filter((a) => a.category === cat).length,
    color: ASSET_CATEGORY_COLORS[cat],
  }));

  const hkByStatus = ['PENDING', 'IN_PROGRESS', 'COMPLETED'].map((s) => ({
    name: s.replace('_', ' '),
    count: hkTasks.filter((h) => h.status === s).length,
  }));

  const hkByType = ['CLEANING', 'MAINTENANCE', 'INSPECTION', 'REPAIR'].map((t) => ({
    name: t.charAt(0) + t.slice(1).toLowerCase(),
    count: hkTasks.filter((h) => h.task_type === t).length,
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-600">Property &amp; Maintenance</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#1E293B]">Property Department Analytics</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Asset inventory, housekeeping tasks, and procurement overview</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={summary.total} color="bg-teal-100 text-teal-700" icon="📋" />
        <StatCard label="Total Assets" value={assets.length} color="bg-blue-100 text-blue-700" icon="🏗️" />
        <StatCard label="Asset Value" value={`₦${(totalAssetValue / 1000000).toFixed(1)}M`} color="bg-green-100 text-green-700" icon="💰" />
        <StatCard label="Pending POs" value={pendingPOs} color="bg-amber-100 text-amber-700" icon="📦" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Assets by category */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Assets by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={assetByCategory} cx="50%" cy="50%" outerRadius={70} dataKey="count"
                label={({ name, count }) => count > 0 ? `${name}: ${count}` : ''}>
                {assetByCategory.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Housekeeping task status */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Housekeeping Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hkByStatus} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Tasks" fill="#14B8A6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Housekeeping by type */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Housekeeping by Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hkByType} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Tasks" fill="#0D9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task breakdown bars */}
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
      </div>

      {/* Monthly trend */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Monthly Task Completion Trend</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={monthly} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="total" name="Total" stroke="#CBD5E1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="completed" name="Completed" stroke="#14B8A6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PropertyAnalytics;
