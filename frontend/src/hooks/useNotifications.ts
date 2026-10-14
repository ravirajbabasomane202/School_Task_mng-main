import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as notificationService from '../services/notificationService';
import {
  markAllRead as markAllReadAction,
  markAsRead as markAsReadAction,
  removeNotification as removeNotificationAction,
  setNotifications
} from '../store/notificationSlice';
import type { Notification } from '../types/notification.types';
import { isNotFoundError } from '../utils/apiError';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export const useNotifications = () => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { notifications, unreadCount } = useAppSelector((state) => state.notifications);

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationService.getNotifications,
    refetchInterval: 60_000
  });

  useEffect(() => {
    if (query.data) {
      dispatch(setNotifications(query.data));
    }
  }, [dispatch, query.data]);

  const markAsRead = async (id: number) => {
    await notificationService.markAsRead(id);
    dispatch(markAsReadAction(id));
  };

  const markAllAsRead = async () => {
    await notificationService.markAllRead();
    dispatch(markAllReadAction());
  };

  /**
   * Delete one of the user's notifications and drop it from the list right
   * away. A 404 means it is already gone (deleted elsewhere), which is the
   * state we wanted, so it is treated as success; any other error is rethrown
   * for the caller to show.
   */
  const deleteNotification = async (id: number) => {
    try {
      await notificationService.deleteNotification(id);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
    dispatch(removeNotificationAction(id));
    queryClient.setQueryData<Notification[]>(['notifications'], (old) =>
      old ? old.filter((item) => item.id !== id) : old
    );
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    ...query
  };
};
