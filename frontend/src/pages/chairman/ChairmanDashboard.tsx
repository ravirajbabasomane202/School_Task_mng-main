import { Route, Routes } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import AlertsEscalations from './AlertsEscalations';
import AnnouncementsPage from './AnnouncementsPage';
import ApprovalManagement from './ApprovalManagement';
import TaskAssignment from './TaskAssignment';
import TaskMonitoring from './TaskMonitoring';
import ChairmanOverview from './ChairmanOverview';
import MISReports from './MISReports';
import PerformanceAnalytics from './PerformanceAnalytics';
import UserManagement from './UserManagement';
import ScheduleMeeting from './ScheduleMeeting';
import LeaveRequestsPage from '../departments/LeaveRequestsPage';
import AddRegister from './AddRegister';
import RegisterMonitoring from './RegisterMonitoring';

function ChairmanDashboard() {
  useSocket();

  return (
    <div className="flex min-h-screen bg-[#F1F4F9] text-[#1E293B]">
      <Sidebar />
      <main className="custom-scrollbar ml-[196px] h-screen min-w-0 flex-1 overflow-y-auto">
        <Navbar />
        <Routes>
          <Route
            index
            element={<ChairmanOverview />}
          />
          <Route
            element={<TaskAssignment />}
            path="task-assignment"
          />
          <Route
            element={<TaskMonitoring />}
            path="task-monitor"
          />
          <Route
            element={<AlertsEscalations />}
            path="alerts"
          />
          <Route
            element={<ApprovalManagement />}
            path="approvals"
          />
          <Route
            element={<MISReports />}
            path="reports"
          />
          <Route
            element={<AnnouncementsPage />}
            path="announcements"
          />
          <Route
            element={<UserManagement />}
            path="users"
          />
          <Route
            element={<PerformanceAnalytics />}
            path="performance"
          />
          <Route
            element={<ScheduleMeeting />}
            path="meetings"
          />
          <Route
            element={<LeaveRequestsPage />}
            path="leave"
          />
          <Route
            element={<AddRegister />}
            path="add-register"
          />
          <Route
            element={<RegisterMonitoring />}
            path="register-monitoring"
          />
        </Routes>
      </main>
    </div>
  );
}

export default ChairmanDashboard;
