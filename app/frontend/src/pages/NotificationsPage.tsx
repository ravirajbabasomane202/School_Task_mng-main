import Button from '../components/common/Button';
import { useNotifications } from '../hooks/useNotifications';

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function NotificationsPage() {
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotifications();

  return (
    <section className="space-y-5 p-5">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Activity Center
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1E293B]">All notifications</h2>
            <p className="mt-2 text-sm leading-6 text-[#5B6E8C]">
              Review task alerts, announcement updates, and live workflow events in one place.
            </p>
          </div>
          <Button onClick={() => void markAllAsRead()}>{`Mark all read (${unreadCount})`}</Button>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-4">
        {notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <button
                className={[
                  'flex w-full items-start justify-between gap-4 rounded-[16px] border px-4 py-4 text-left transition',
                  notification.is_read
                    ? 'border-[#EFF2F6] bg-white'
                    : 'border-[#D7E7F7] bg-[#F7FBFF]'
                ].join(' ')}
                key={`${notification.type}-${notification.id}`}
                onClick={() => void markAsRead(notification.id)}
                type="button"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1E293B]">{notification.message}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#8A99B0]">
                    {notification.type.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-[#8A99B0]">{formatTimestamp(notification.created_at)}</p>
                  <p className="mt-2 text-xs font-semibold text-[#185FA5]">
                    {notification.is_read ? 'Read' : 'Mark as read'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#D7E1EC] bg-[#FAFCFE] px-4 py-10 text-center text-sm text-[#8A99B0]">
            No notifications available right now.
          </div>
        )}
      </div>
    </section>
  );
}

export default NotificationsPage;
