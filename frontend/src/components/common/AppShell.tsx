import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Shared authenticated layout: fixed sidebar rail on lg+, slide-in drawer below lg.
 * Owns the drawer state so every role layout behaves the same.
 */
function AppShell({ children }: AppShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const close = useCallback(() => setSidebarOpen(false), []);

  // Close on route change.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close on Escape + lock body scroll while the drawer is open.
  useEffect(() => {
    if (!isSidebarOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSidebarOpen]);

  return (
    <div className="flex min-h-dvh bg-[#F1F4F9] text-[#1E293B]">
      <Sidebar isOpen={isSidebarOpen} onClose={close} />
      {isSidebarOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-[#1E293B]/40 lg:hidden"
          data-testid="sidebar-backdrop"
          onClick={close}
        />
      ) : null}
      <main className="custom-scrollbar h-dvh min-w-0 flex-1 overflow-y-auto lg:ml-[196px]">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        {children}
      </main>
    </div>
  );
}

export default AppShell;
