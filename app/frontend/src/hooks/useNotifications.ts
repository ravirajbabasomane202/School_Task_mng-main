import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as notificationService from '../services/notificationService';
import {
  markAllRead as markAllReadAction,
  markAsRead as markAsReadAction,
  setNotifications
} from '../store/notificationSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export const useNotifications = () => {
  const dispatch = useAppDispatch();
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

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    ...query
  };
};
