import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { addNotification } from '../store/notificationSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { Announcement, Notification } from '../types/notification.types';
import type { Task } from '../types/task.types';
import { getBackendBaseUrl } from '../utils/apiBase';

interface SocketTaskPayload { task?: Task; }

const resolveTaskPayload = (payload: SocketTaskPayload | Task): Task | undefined =>
  'id' in payload ? payload : payload.task;

const normalizeAnnouncementNotification = (
  announcement: Announcement,
  userId: number | undefined
): Notification => ({
  id: announcement.id,
  user_id: userId ?? 0,
  type: 'ANNOUNCEMENT',
  message: announcement.message,
  task_id: null,
  is_read: false,
  created_at: announcement.created_at,
});

/** Query keys invalidated by each notification type */
const NOTIFICATION_QUERY_MAP: Partial<Record<Notification['type'], string[][]>> = {
  LEAVE_SUBMITTED:       [['leave-requests']],
  LEAVE_PROCESSED:       [['leave-requests']],
  RESUMPTION_SUBMITTED:  [['resumption-requests']],
  RESUMPTION_PROCESSED:  [['resumption-requests']],
  SALARY_UPDATE:         [['salary-increments']],
  SALARY_SUBMITTED:      [['salary-increments']],
  SALARY_PROCESSED:      [['salary-increments']],
  MEETING_SCHEDULED:     [['meetings']],
  TASK_ASSIGNED:         [['tasks']],
  TASK_UPDATED:          [['tasks']],
  TASK_DELAYED:          [['tasks']],
  TASK_ESCALATED:        [['tasks']],
};

export const useSocket = () => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { token, user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!token) return undefined;

    const socketBaseUrl = getBackendBaseUrl();
    const socket = io(socketBaseUrl, { auth: { token } });

    socket.on('notification:new', (notification: Notification) => {
      dispatch(addNotification(notification));
      toast.success(notification.message);

      // Invalidate related queries so UI stays fresh
      const keysToInvalidate = NOTIFICATION_QUERY_MAP[notification.type] ?? [];
      keysToInvalidate.forEach((queryKey) =>
        void queryClient.invalidateQueries({ queryKey })
      );
    });

    socket.on('task:updated', (payload: SocketTaskPayload | Task) => {
      const task = resolveTaskPayload(payload);
      if (task) {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
        void queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      }
    });

    socket.on('announcement:new', (announcement: Announcement) => {
      dispatch(addNotification(normalizeAnnouncementNotification(announcement, user?.id)));
    });

    return () => { socket.disconnect(); };
  }, [dispatch, queryClient, token, user?.id]);
};
