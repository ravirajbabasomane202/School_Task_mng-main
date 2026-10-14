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
  TASK_OVERDUE:          [['tasks']],
};

export const useSocket = () => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { token } = useAppSelector((state) => state.auth);

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

    // Every recipient already gets a real `notification:new` for an announcement
    // (persisted, with its own id). The old handler ALSO pushed a fake
    // notification here using the announcement's id as the notification id, which
    // duplicated the entry and would make "Delete" target the wrong row.
    // Just refresh the announcement lists instead.
    socket.on('announcement:new', (_announcement: Announcement) => {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['director-announcements'] });
    });

    return () => { socket.disconnect(); };
  }, [dispatch, queryClient, token]);
};
