import React, { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

interface Notification {
  id: number;
  title?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  /** Path to navigate when "View all" is clicked. Defaults to /notifications */
  notificationsPath?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ notificationsPath = '/notifications' }) => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [preview, setPreview] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      const notifs: Notification[] = res.data.data || [];
      setUnreadCount(notifs.filter((n) => !n.is_read).length);
      setPreview(notifs.slice(0, 5));
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const markAllRead = async () => {
    try {
      setLoading(true);
      await api.put("/notifications/read-all");
      setUnreadCount(0);
      setPreview((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border z-40">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h4 className="font-semibold text-sm text-gray-800">Notifications</h4>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            {preview.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No notifications.</p>
            ) : (
              <ul className="divide-y max-h-72 overflow-y-auto">
                {preview.map((n) => (
                  <li
                    key={n.id}
                    className={`px-4 py-3 text-sm ${n.is_read ? "bg-white" : "bg-blue-50"}`}
                  >
                    {n.title && <p className="font-medium text-gray-800 line-clamp-1">{n.title}</p>}
                    <p className="text-gray-500 text-xs line-clamp-2 mt-0.5">{n.message}</p>
                    <p className="text-gray-400 text-xs mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-4 py-3 border-t">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate(notificationsPath);
                }}
                className="w-full text-center text-xs text-blue-600 hover:underline"
              >
                View all notifications
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;