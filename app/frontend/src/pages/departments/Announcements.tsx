import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as announcementService from '../../services/announcementService';
import { useNotifications } from '../../hooks/useNotifications';

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function Announcements() {
  const { notifications, markAsRead } = useNotifications();
  const announcementsQuery = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementService.getAnnouncements
  });

  const announcementNotifications = useMemo(
    () => notifications.filter((notification) => notification.type === 'ANNOUNCEMENT'),
    [notifications]
  );

  const resolveNotificationId = (message: string) => {
    const snippet = message.length > 50 ? `${message.slice(0, 50)}...` : message;
    return announcementNotifications.find((notification) => notification.message.includes(snippet))
      ?.id;
  };

  return (
    <section className="space-y-5 p-5">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
          Department Comms
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[#1E293B]">Announcements</h2>
        <p className="mt-2 text-sm leading-6 text-[#5B6E8C]">
          Review institution-wide broadcasts and department-specific directions from the chairman.
        </p>
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-4">
        {announcementsQuery.data && announcementsQuery.data.length > 0 ? (
          <div className="space-y-3">
            {announcementsQuery.data.map((announcement) => {
              const notificationId = resolveNotificationId(announcement.message);

              return (
                <button
                  className={[
                    'w-full rounded-[18px] border-l-4 bg-[#FAFCFE] px-4 py-4 text-left transition hover:bg-white',
                    announcement.target === 'ALL' ? 'border-[#2C7BE5]' : 'border-[#D89B17]'
                  ].join(' ')}
                  key={announcement.id}
                  onClick={() => (notificationId ? void markAsRead(notificationId) : undefined)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#1E293B]">Chairman</p>
                      <p className="mt-2 text-sm leading-6 text-[#42566F]">{announcement.message}</p>
                    </div>
                    <span className="shrink-0 text-xs text-[#8A99B0]">
                      {formatDate(announcement.created_at)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-medium text-[#8A99B0]">
                    {announcement.target === 'ALL'
                      ? 'Sent to all staff'
                      : `Sent to ${announcement.department?.name ?? 'your department'}`}
                    {notificationId ? ' • Mark as read' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#D7E1EC] bg-[#FAFCFE] px-4 py-10 text-center text-sm text-[#8A99B0]">
            No announcements are available right now.
          </div>
        )}
      </div>
    </section>
  );
}

export default Announcements;
