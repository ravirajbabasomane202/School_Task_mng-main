import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import { DEPARTMENT_HEAD_ROLES, ROLES } from '../constants/roles';
import { useSocket } from '../hooks/useSocket';
import ChangePassword from '../pages/auth/ChangePassword';
import LandingPage from '../pages/LandingPage';
import Login from '../pages/auth/Login';
import UnauthorizedPage from '../pages/auth/UnauthorizedPage';
import NotificationsPage from '../pages/NotificationsPage';
import ChairmanDashboard from '../pages/chairman/ChairmanDashboard';
import TaskDetail from '../pages/chairman/TaskDetail';
import DirectorDashboard from '../pages/director/DirectorDashboard';
import DeptOverview from '../pages/departments/DeptOverview';
import AssignedTasks from '../pages/departments/AssignedTasks';
import Announcements from '../pages/departments/Announcements';
import LeaveRequestsPage from '../pages/departments/LeaveRequestsPage';
import DeptApprovalsPage from '../pages/departments/DeptApprovalsPage';
import SalaryIncrementsPage from '../pages/departments/SalaryIncrementsPage';
import RecruitmentPage from '../pages/departments/RecruitmentPage';
import AssetManagementPage from '../pages/departments/AssetManagementPage';
import PurchaseOrdersPage from '../pages/departments/PurchaseOrdersPage';
import RegistersPage from '../pages/departments/RegistersPage';
import ProtectedRoute from './ProtectedRoute';
import AnalyticsRouter from '../pages/departments/analytics/AnalyticsRouter';

const DailyReport  = lazy(() => import('../pages/reports/DailyReport'));
const WeeklyReport = lazy(() => import('../pages/reports/WeeklyReport'));

const PageSpinner = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
  </div>
);

/** Single shared layout used by all authenticated roles. */
function AppLayout() {
  useSocket();
  return (
    <div className="flex min-h-screen bg-[#F1F4F9] text-[#1E293B]">
      <Sidebar />
      <main className="custom-scrollbar ml-[196px] h-screen min-w-0 flex-1 overflow-y-auto">
        <Navbar />
        <Outlet />
      </main>
    </div>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/notifications"   element={<NotificationsPage />} />
            <Route path="/reports/daily"   element={<Suspense fallback={<PageSpinner />}><DailyReport /></Suspense>} />
            <Route path="/reports/weekly"  element={<Suspense fallback={<PageSpinner />}><WeeklyReport /></Suspense>} />
          </Route>
          <Route path="/task/:id" element={<TaskDetail />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={[ROLES.CHAIRMAN]} />}>
          <Route path="/chairman/*" element={<ChairmanDashboard />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={[ROLES.DIRECTOR]} />}>
          <Route path="/director/*" element={<DirectorDashboard />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={DEPARTMENT_HEAD_ROLES} />}>
          <Route path="/department" element={<AppLayout />}>
            <Route index                element={<DeptOverview />} />
            <Route path="my-tasks"      element={<AssignedTasks />} />
            <Route path="analytics"     element={<AnalyticsRouter />} />
            <Route path="approvals"     element={<DeptApprovalsPage />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="leave"         element={<LeaveRequestsPage />} />
            <Route path="registers"     element={<RegistersPage />} />
            <Route path="salary"        element={<SalaryIncrementsPage />} />
            <Route path="recruitment"   element={<RecruitmentPage />} />
            <Route path="assets"        element={<AssetManagementPage />} />
            <Route path="purchase"      element={<PurchaseOrdersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
