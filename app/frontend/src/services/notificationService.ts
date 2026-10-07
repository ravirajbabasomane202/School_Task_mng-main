import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { Notification } from '../types/notification.types';
import api from './api';

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export const getNotifications = async () => {
  const response = await api.get<ApiResponse<Notification[]>>(API_ENDPOINTS.notifications.list);
  return response.data.data;
};

export const markAsRead = async (id: number) => {
  const response = await api.put<ApiResponse<Notification | null>>(
    API_ENDPOINTS.notifications.markRead(id)
  );
  return response.data.data;
};

export const markAllRead = async () => {
  const response = await api.put<ApiResponse<null>>(API_ENDPOINTS.notifications.markAllRead);
  return response.data.data;
};
