import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useSocket } from '../../hooks/useSocket';
import TaskStatusPieChart from '../../components/charts/TaskStatusPieChart';
import TaskTable from '../../components/tables/TaskTable';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { getDirectorDashboard } from '../../services/dashboardService';
import AssignedTasks from '../departments/AssignedTasks';
import Announcements from '../departments/Announcements';
import NotificationsPage from '../NotificationsPage';
import LeaveRequestsPage from '../departments/LeaveRequestsPage';
import RegistersPage from '../departments/RegistersPage';
import DirectorApprovalsPage from './DirectorApprovalsPage';
import DirectorReportsPage from './DirectorReportsPage';
import DirectorMeetingsPage from './DirectorMeetingsPage';
import DirectorCommunicationsPage from './DirectorCommunicationsPage';
import type { Task } from '../../types/task.types';
import type { RootState } from '../../store';

interface DashboardData {
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  delayedTasks: number;
  taskBreakdown: {
    pending: number;
    inProgress: number;
    completed: number;
    delayed: number;
    escalated: number;
  };
  departments: { name: string; completionPct: number; healthColor: string }[];
  recentTasks: Task[];
}

function DirectorOverview() {
  const user = useSelector((state: RootState) => state.auth.user);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['director-dashboard'],
    queryFn: () => getDirectorDashboard(),
  });

  const taskStatusData = data
    ? [
        { name: 'Pending',    value: data.taskBreakdown?.pending    ?? 0, color: '#3B82F6' },
        { name: 'In Progress',value: data.taskBreakdown?.inProgress ?? 0, color: '#F59E0B' },
        { name: 'Completed',  value: data.taskBreakdown?.completed  ?? 0, color: '#22C55E' },
        { name: 'Delayed',    value: data.taskBreakdown?.delayed    ?? 0, color: '#EF4444' },
        { name: 'Escalated',  value: data.taskBreakdown?.escalated  ?? 0, color: '#8B5CF6' },
      ]
    : [];

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1E293B]">School Manager Dashboard</h1>
        <p className="text-sm text-[#5B6E8C] mt-1">Welcome back, {user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks',   value: data.totalTasks,            color: 'text-[#1E293B]' },
          { label: 'Completed',     value: data.completedTasks,        color: 'text-green-600' },
          { label: 'Delayed',       value: data.delayedTasks,          color: 'text-red-600' },
          { label: 'Completion %',  value: `${data.completionPercentage}%`, color: 'text-blue-600' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[#EFF2F6] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-[#8A99B0] uppercase tracking-wide">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Chart + Department Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Task Status Distribution</h3>
          <TaskStatusPieChart data={taskStatusData} />
        </div>

        <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Department Health</h3>
          <div className="space-y-3">
            {data.departments.map((dept) => (
              <div key={dept.name} className="flex items-center gap-3">
                <span className="text-xs text-[#5B6E8C] w-24 truncate">{dept.name}</span>
                <div className="flex-1 h-2 rounded-full bg-[#EFF2F6]">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${dept.completionPct}%`, backgroundColor: dept.healthColor }}
                  />
                </div>
                <span className="text-xs font-medium text-[#1E293B] w-8 text-right">
                  {dept.completionPct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Recent Tasks (School-wide)</h3>
        <TaskTable tasks={data.recentTasks} />
      </div>
    </div>
  );
}

function DirectorDashboard() {
  useSocket();

  return (
    <div className="flex min-h-screen bg-[#F1F4F9] text-[#1E293B]">
      <Sidebar />
      <main className="custom-scrollbar ml-[196px] h-screen min-w-0 flex-1 overflow-y-auto">
        <Navbar />
<Routes>
           <Route index element={<DirectorOverview />} />
           <Route path="my-tasks"      element={<AssignedTasks />} />
           <Route path="approvals"     element={<DirectorApprovalsPage />} />
           <Route path="reports"       element={<DirectorReportsPage />} />
           <Route path="meetings"      element={<DirectorMeetingsPage />} />
           <Route path="communications" element={<DirectorCommunicationsPage />} />
           <Route path="announcements" element={<Announcements />} />
           <Route path="notifications" element={<NotificationsPage />} />
           <Route path="leave"         element={<LeaveRequestsPage />} />
           <Route path="registers"     element={<RegistersPage />} />
         </Routes>
      </main>
    </div>
  );
}

export default DirectorDashboard;
