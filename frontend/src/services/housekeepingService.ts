import api from './api';

export interface HousekeepingTask {
  id: number;
  area: string;
  task_type: 'CLEANING' | 'MAINTENANCE' | 'INSPECTION' | 'REPAIR';
  description?: string;
  assigned_to?: number;
  assigneeName?: string;
  created_by: number;
  createdByName?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  scheduled_date?: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
}

export interface CreateHousekeepingPayload {
  area: string;
  task_type: string;
  description?: string;
  assigned_to?: number;
  priority?: string;
  scheduled_date?: string;
  notes?: string;
}

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export const getHousekeepingTasks = async (filters?: { status?: string; priority?: string; task_type?: string }) => {
  const response = await api.get<ApiResponse<HousekeepingTask[]>>('/housekeeping', { params: filters });
  return response.data.data;
};

export const getHousekeepingStats = async () => {
  const response = await api.get<ApiResponse<{ total: number; pending: number; in_progress: number; completed: number }>>('/housekeeping/stats');
  return response.data.data;
};

export const createHousekeepingTask = async (payload: CreateHousekeepingPayload) => {
  const response = await api.post<ApiResponse<HousekeepingTask>>('/housekeeping', payload);
  return response.data.data;
};

export const updateHousekeepingTask = async (id: number, payload: Partial<CreateHousekeepingPayload> & { status?: string }) => {
  const response = await api.put<ApiResponse<HousekeepingTask>>(`/housekeeping/${id}`, payload);
  return response.data.data;
};

export const deleteHousekeepingTask = async (id: number) => {
  const response = await api.delete(`/housekeeping/${id}`);
  return response.data;
};
