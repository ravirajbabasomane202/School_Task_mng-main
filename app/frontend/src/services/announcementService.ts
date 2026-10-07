import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { Announcement, CreateAnnouncementPayload } from '../types/notification.types';
import api from './api';

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export const getAnnouncements = async (target?: string) => {
  const response = await api.get<ApiResponse<Announcement[]>>(API_ENDPOINTS.announcements.list, {
    params: target ? { target } : undefined,
  });
  return response.data.data;
};

export const createAnnouncement = async (payload: CreateAnnouncementPayload) => {
  const response = await api.post<ApiResponse<Announcement>>(API_ENDPOINTS.announcements.create, payload);
  return response.data.data;
};

export const updateAnnouncement = async (id: number, payload: Partial<CreateAnnouncementPayload>) => {
  const response = await api.put<ApiResponse<Announcement>>(`/announcements/${id}`, payload);
  return response.data.data;
};

export const deleteAnnouncement = async (id: number) => {
  await api.delete(`/announcements/${id}`);
};
