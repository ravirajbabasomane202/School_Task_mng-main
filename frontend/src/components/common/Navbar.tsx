import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, LogOut, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRoleLabel } from '../../utils/roleUtils';
import { useAuth } from '../../hooks/useAuth';
import { useAppSelector } from '../../store/hooks';
import Badge from './Badge';
import Button from './Button';
import NotificationBell from './NotificationBell';

interface NavbarProps {
  actions?: ReactNode;
  /** Opens the sidebar drawer (shown as a hamburger below lg). */
  onMenuClick?: () => void;
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

function Navbar({ actions, onMenuClick, title }: NavbarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const location = useLocation();
  const { user } = useAppSelector((state) => state.auth);
  const { unreadCount } = useAppSelector((state) => state.notifications);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape for the avatar menu (phones/tablets).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
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
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-b-[0.5px] border-[#EFF2F6] bg-white px-3 py-[11px] pt-[calc(11px+env(safe-area-inset-top))] sm:gap-3 sm:px-[18px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          aria-label="Open navigation menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#5B6E8C] transition hover:bg-[#F1F4F9] lg:hidden"
          onClick={onMenuClick}
          type="button"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[14px] font-medium text-[#1E293B]">{resolvedTitle}</h1>
          <p className="mt-1 hidden truncate text-[11px] text-[#8A99B0] sm:block">{subtitleParts.join(' | ')}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Badge className="hidden md:inline-flex" variant="red">{unreadCount} Alerts</Badge>
        <Badge className="hidden md:inline-flex" variant="amber">{pendingApprovals} Pending Approvals</Badge>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        <Button
          className="hidden lg:inline-flex"
          onClick={() => navigate('/change-password')}
          size="sm"
          variant="ghost"
        >
          Change Password
        </Button>
        <Button
          className="hidden lg:inline-flex"
          loading={isLoggingOut}
          onClick={() => void handleLogout()}
          size="sm"
          variant="danger"
        >
          Logout
        </Button>
        <NotificationBell />
        <div className="relative lg:hidden" ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Account menu"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F1FB] text-[12px] font-semibold text-[#0C447C]"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {getInitials(user?.name)}
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-[#EFF2F6] bg-white p-1 shadow-xl"
              role="menu"
            >
              <div className="border-b border-[#EFF2F6] px-3 py-2">
                <p className="truncate text-sm font-medium text-[#1E293B]">{user?.name ?? 'User'}</p>
                <p className="truncate text-xs text-[#8A99B0]">{user ? getRoleLabel(user.role) : ''}</p>
              </div>
              <button
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#1E293B] hover:bg-[#F1F4F9]"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/change-password');
                }}
                role="menuitem"
                type="button"
              >
                <KeyRound size={16} /> Change Password
              </button>
              <button
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#C13F3A] hover:bg-[#FFF4F4] disabled:opacity-60"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
                role="menuitem"
                type="button"
              >
                <LogOut size={16} /> {isLoggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          ) : null}
        </div>
        <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#E6F1FB] text-[12px] font-semibold text-[#0C447C] lg:flex">
          {getInitials(user?.name)}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
