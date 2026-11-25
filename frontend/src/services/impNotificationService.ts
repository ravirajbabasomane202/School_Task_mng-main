import api from './api';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type {
  ImpAssignmentOptions,
  ImpNotification,
  ImpNotificationFilters,
  ImpNotificationPayload,
  ImpStatus,
} from '../types/impNotification.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

const E = API_ENDPOINTS.impNotifications;

export async function getImpNotifications(filters?: ImpNotificationFilters): Promise<ImpNotification[]> {
  const response = await api.get<ApiResponse<ImpNotification[]>>(E.list, { params: filters });
  return response.data.data;
}

export async function getImpNotification(id: number): Promise<ImpNotification> {
  const response = await api.get<ApiResponse<ImpNotification>>(E.detail(id));
  return response.data.data;
}

export async function getImpAssignmentOptions(): Promise<ImpAssignmentOptions> {
  const response = await api.get<ApiResponse<ImpAssignmentOptions>>(E.options);
  return response.data.data;
}

export async function createImpNotification(payload: ImpNotificationPayload): Promise<ImpNotification> {
  const response = await api.post<ApiResponse<ImpNotification>>(E.create, payload);
  return response.data.data;
}

export async function updateImpNotification(
  id: number,
  payload: Partial<ImpNotificationPayload>
): Promise<ImpNotification> {
  const response = await api.put<ApiResponse<ImpNotification>>(E.update(id), payload);
  return response.data.data;
}

export async function updateImpNotificationStatus(id: number, status: ImpStatus): Promise<ImpNotification> {
  const response = await api.patch<ApiResponse<ImpNotification>>(E.status(id), { status });
  return response.data.data;
}

export async function setImpNotificationActive(id: number, is_active: boolean): Promise<ImpNotification> {
  const response = await api.patch<ApiResponse<ImpNotification>>(E.active(id), { is_active });
  return response.data.data;
}

export async function deleteImpNotification(id: number): Promise<void> {
  await api.delete(E.delete(id));
}
