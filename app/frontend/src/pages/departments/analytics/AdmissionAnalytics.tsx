import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
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

const AdmissionAnalytics: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  const taskData = useQuery({
    queryKey: ['analytics', 'admission', user?.department_id],
    queryFn: async () => {
      const params = user?.department_id ? { department_id: user.department_id } : {};
      const res = await api.get('/dashboard/analytics/admission', { params });
      return res.data.data ?? res.data;
    },
  });

  // Recruitment serves as proxy for admission application pipeline
  const recruitmentData = useQuery({
    queryKey: ['recruitment', 'admission'],
    queryFn: async () => {
      const res = await api.get('/recruitment');
      return (res.data.data ?? res.data) as Array<{ status: string; position_title: string }>;
    },
  });

  if (taskData.isLoading || !taskData.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  const { summary, monthly, taskStatusData } = taskData.data;
  const recruitments = recruitmentData.data ?? [];

  const pipelineData = [
    { name: 'Open', count: recruitments.filter((r) => r.status === 'OPEN').length },
    { name: 'Screening', count: recruitments.filter((r) => r.status === 'SCREENING').length },
    { name: 'Interview', count: recruitments.filter((r) => r.status === 'INTERVIEW').length },
    { name: 'Closed', count: recruitments.filter((r) => r.status === 'CLOSED').length },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Admissions</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#1E293B]">Admission Department Analytics</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Application pipeline, task performance, and monthly progress</p>
      </div>

      {/* Task KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={summary.total} color="bg-indigo-100 text-indigo-700" icon="📋" />
        <StatCard label="Completed" value={summary.completed} color="bg-green-100 text-green-700" icon="✅" />
        <StatCard label="In Progress" value={summary.inProgress} color="bg-amber-100 text-amber-700" icon="⏳" />
        <StatCard label="Completion %" value={`${summary.completionPct}%`} color="bg-blue-100 text-blue-700" icon="📊" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Task status pie */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Task Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={taskStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                {taskStatusData.map((entry: { color: string }, i: number) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Admission pipeline */}
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Admission / Recruitment Pipeline</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pipelineData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFF2F6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Openings" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status breakdown progress bars */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1E293B]">Detailed Status Breakdown</h3>
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
                <div className="h-2 rounded-full transition-all"
                  style={{ width: summary.total ? `${(value / summary.total) * 100}%` : '0%', backgroundColor: color }} />
              </div>
              <span className="w-8 text-right text-xs font-medium text-[#1E293B]">{value}</span>
            </div>
          ))}
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
            <Line type="monotone" dataKey="total" name="Total" stroke="#CBD5E1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="completed" name="Completed" stroke="#6366F1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AdmissionAnalytics;
