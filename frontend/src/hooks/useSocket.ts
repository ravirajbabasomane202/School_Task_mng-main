import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
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
  const { token, isAuthenticated } = useAppSelector((state) => state.auth);
  const tokenRef = useRef<string | null>(token);
  const socketRef = useRef<Socket | null>(null);
  tokenRef.current = token;

  // The access token is short-lived (15 min) and is silently refreshed by the
  // axios interceptor. Previously `token` was an effect dependency, so every
  // refresh tore the socket down and opened a brand-new Engine.IO session (a
  // new `sid`), each of which then tried - and failed - to upgrade to
  // WebSocket. Now the socket lives for the whole login session and reads the
  // *current* token through a callback each time it (re)connects.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const socketBaseUrl = getBackendBaseUrl();
    // Polling only: the Flask dev server (python run.py) cannot close a
    // WebSocket cleanly - it writes an HTTP 500 into the upgraded connection,
    // which the browser reports as "Invalid frame header". Long-polling is
    // reliable through Cloudflare and just as quick for notifications.
    const socket = io(socketBaseUrl, {
      transports: ['polling'],
      auth: (cb) => cb({ token: tokenRef.current })
    });
    socketRef.current = socket;

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

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [dispatch, queryClient, isAuthenticated]);

  // If the server dropped us because the token had expired ("io server
  // disconnect" does not auto-reconnect), reconnect once a fresh token exists.
  useEffect(() => {
    const socket = socketRef.current;
    if (token && socket && !socket.connected && socket.active === false) {
      socket.connect();
    }
  }, [token]);
};