import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRoleLabel } from '../../utils/roleUtils';
import { useAuth } from '../../hooks/useAuth';
import { useAppSelector } from '../../store/hooks';
import Badge from './Badge';
import Button from './Button';
import NotificationBell from './NotificationBell';

interface NavbarProps {
  actions?: ReactNode;
  title?: string;
}

const pageTitles: Record<string, string> = {
  '/chairman': 'Dashboard',
  '/chairman/alerts': 'Alerts',
  '/chairman/announcements': 'Announcements',
  '/chairman/approvals': 'Approvals',
  '/chairman/meetings': 'Schedule Meeting',
  '/chairman/performance': 'Performance',
  '/chairman/reports': 'MIS Reports',
  '/chairman/task-assignment': 'Task Assignment',
  '/chairman/task-monitor': 'Task Monitor',
  '/chairman/users': 'User Management',
  '/department': 'Dashboard',
  '/department/announcements': 'Announcements',
  '/department/my-tasks': 'My Tasks',
  '/department/notifications': 'Notifications',
  '/director': 'Dashboard',
  '/director/announcements': 'Announcements',
  '/director/my-tasks': 'My Tasks',
  '/director/notifications': 'Notifications',
  '/notifications': 'Notifications',
  '/task': 'Task Detail'
};

function getInitials(name?: string) {
  if (!name) {
    return 'U';
  }

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatNavbarDate() {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    weekday: 'long',
    year: 'numeric'
  });
}

function Navbar({ actions, title }: NavbarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const location = useLocation();
  const { user } = useAppSelector((state) => state.auth);
  const { unreadCount } = useAppSelector((state) => state.notifications);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const pendingApprovals = useAppSelector(
    (state) => state.tasks.tasks.filter((task) => task.status === 'PENDING').length
  );
  const resolvedTitle =
    title ??
    pageTitles[location.pathname] ??
    Object.entries(pageTitles).find(([path]) => location.pathname.startsWith(path))?.[1] ??
    'Dashboard';
  const subtitleParts = [
    formatNavbarDate(),
    user?.departmentName ?? (user ? getRoleLabel(user.role) : 'All Departments')
  ];

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-b-[0.5px] border-[#EFF2F6] bg-white px-[18px] py-[11px]">
      <div className="min-w-0">
        <h1 className="truncate text-[14px] font-medium text-[#1E293B]">{resolvedTitle}</h1>
        <p className="mt-1 text-[11px] text-[#8A99B0]">{subtitleParts.join(' | ')}</p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="red">{unreadCount} alerts</Badge>
        <Badge variant="amber">{pendingApprovals} pending approvals</Badge>
        {actions}
        <Button
          className="hidden sm:inline-flex"
          onClick={() => navigate('/change-password')}
          size="sm"
          variant="ghost"
        >
          Change password
        </Button>
        <Button loading={isLoggingOut} onClick={() => void handleLogout()} size="sm" variant="danger">
          Logout
        </Button>
        <NotificationBell />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E6F1FB] text-[12px] font-semibold text-[#0C447C]">
          {getInitials(user?.name)}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
