import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
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

const LEAVE_COLORS: Record<string, string> = {
  APPROVED: '#22C55E',
  REJECTED: '#EF4444',
  PENDING: '#F59E0B',
};

const HRAnalytics: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  const taskData = useQuery({
    queryKey: ['analytics', 'hr', user?.department_id],
    queryFn: async () => {
      const params = user?.department_id ? { department_id: user.department_id } : {};
      const res = await api.get('/dashboard/analytics/hr', { params });
      return res.data.data ?? res.data;
    },
  });

  const leaveData = useQuery({
    queryKey: ['leave-requests'],
    queryFn: async () => {
      const res = await api.get('/leave/requests');
      return (res.data.data ?? res.data) as Array<{ status: string; leave_type: string }>;
    },
  });

  const recruitmentData = useQuery({
    queryKey: ['recruitment'],
    queryFn: async () => {
      const res = await api.get('/recruitment');
      return (res.data.data ?? res.data) as Array<{ status: string }>;
    },
  });

  const salaryData = useQuery({
    queryKey: ['salary-increments'],
    queryFn: async () => {
      const res = await api.get('/salary-increments');
      return (res.data.data ?? res.data) as Array<{ status: string }>;
    },
  });

  if (taskData.isLoading || !taskData.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-pink-600" />
      </div>
    );
  }

  const { summary, monthly, taskStatusData } = taskData.data;
  const leaves = leaveData.data ?? [];
  const recruitments = recruitmentData.data ?? [];
  const salaries = salaryData.data ?? [];

  // Leave stats
  const leaveStats = ['APPROVED', 'PENDING', 'REJECTED'].map((s) => ({
    name: s,
    value: leaves.filter((l) => l.status === s).length,
    color: LEAVE_COLORS[s],
  }));

  // Leave type breakdown
  const leaveTypes = ['SICK', 'CASUAL', 'ANNUAL', 'OTHER'];
  const leaveTypeData = leaveTypes.map((t) => ({
    name: t,
    count: leaves.filter((l) => l.leave_type === t).length,
  }));

  // Recruitment pipeline
  const recStages = ['OPEN', 'SCREENING', 'INTERVIEW', 'CLOSED'];
  const recData = recStages.map((s) => ({
    name: s,
    count: recruitments.filter((r) => r.status === s).length,
  }));

  // Salary status
  const salStatuses = ['PENDING_HR', 'PENDING_FINANCE', 'APPROVED', 'REJECTED'];
  const salData = salStatuses.map((s) => ({
    name: s.replace('_', ' '),
    count: salaries.filter((r) => r.status === s).length,
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-600">Human Resources</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#1E293B]">HR Department Analytics</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Leave management, recruitment pipeline, and payroll insights</p>
      </div>

      {/* Task KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={summary.total} color="bg-pink-100 text-pink-700" icon="📋" />
        <StatCard label="Completed" value={summary.completed} color="bg-green-100 text-green-700" icon="✅" />
        <StatCard label="Leave Requests" value={leaves.length} color="bg-amber-100 text-amber-700" icon="🗓️" />
        <StatCard label="Open Positions" value={recruitments.filter((r) => r.status === 'OPEN').length} color="bg-blue-100 text-blue-700" icon="💼" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Leave status pie */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Leave Request Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={leaveStats} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {leaveStats.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Leave type bar */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Leave Types Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={leaveTypeData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" name="Requests" fill="#EC4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recruitment pipeline */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Recruitment Pipeline</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={recData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" name="Openings" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Salary increment status */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Salary Increments Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={salData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" name="Requests" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Monthly Task Trend</h3>
        <ResponsiveContainer width="100%" height={240}>
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

export default HRAnalytics;
