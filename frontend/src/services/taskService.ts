import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type {
  CreateTaskPayload,
  Task,
  TaskFilters,
  UpdateTaskPayload
} from '../types/task.types';
import api from './api';

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

const appendTaskPayload = (formData: FormData, payload: CreateTaskPayload | UpdateTaskPayload) => {
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    formData.append(key, String(value));
  });
};

const buildTaskFilters = (filters?: TaskFilters) => {
  if (!filters) {
    return undefined;
  }

  const params = new URLSearchParams();

  if (filters.status && filters.status !== 'ALL') {
    params.set('status', filters.status);
  }

  if (filters.priority && filters.priority !== 'ALL') {
    params.set('priority', filters.priority);
  }

  if (filters.department_id) {
    params.set('department_id', String(filters.department_id));
  }

  if (filters.assigned_to) {
    params.set('assigned_to', String(filters.assigned_to));
  }

  if (filters.from) {
    params.set('from', filters.from);
  }

  if (filters.to) {
    params.set('to', filters.to);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  return params;
};

export const createTask = async (payload: CreateTaskPayload, file?: File) => {
  const formData = new FormData();
  appendTaskPayload(formData, payload);

  if (file) {
    formData.append('attachment', file);
  }

  const response = await api.post<ApiResponse<Task>>(API_ENDPOINTS.tasks.create, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data.data;
};

export const getAllTasks = async (filters?: TaskFilters) => {
  const response = await api.get<ApiResponse<Task[]>>(API_ENDPOINTS.tasks.list, {
    params: buildTaskFilters(filters)
  });

  return response.data.data;
};

export const getMyTasks = async () => {
  const response = await api.get<ApiResponse<Task[]>>(API_ENDPOINTS.tasks.myTasks);
  return response.data.data;
};

export const updateTask = async (id: number, payload: UpdateTaskPayload, file?: File) => {
  const hasFile = Boolean(file);

  if (hasFile) {
    const formData = new FormData();
    appendTaskPayload(formData, payload);
    formData.append('attachment', file as File);

    const response = await api.put<ApiResponse<Task>>(API_ENDPOINTS.tasks.update(id), formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data.data;
  }

  const response = await api.put<ApiResponse<Task>>(API_ENDPOINTS.tasks.update(id), payload);
  return response.data.data;
};

export const getTaskById = async (id: number) => {
  const response = await api.get<ApiResponse<Task>>(API_ENDPOINTS.tasks.detail(id));
  return response.data.data;
};

export const getTasksByDept = async (deptId: number) => {
  const response = await api.get<ApiResponse<Task[]>>(API_ENDPOINTS.tasks.byDept(deptId));
  return response.data.data;
};

export const deleteTask = async (id: number): Promise<void> => {
  await api.delete(API_ENDPOINTS.tasks.detail(id));
};

export const updateTaskStatus = async (
  id: number,
  status: import('../types/task.types').TaskStatus,
  proofFile?: File,
  comment?: string
): Promise<Task> => {
  // With proof: multipart PUT to /tasks/{id} (handles both status + attachment in one request)
  if (proofFile) {
    const formData = new FormData();
    formData.append('status', status);
    formData.append('attachment', proofFile);
    if (comment) formData.append('comment', comment);
    const response = await api.put<ApiResponse<Task>>(API_ENDPOINTS.tasks.update(id), formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
  }
  // Status-only: use dedicated /tasks/{id}/status endpoint
  const body: Record<string, string> = { status };
  if (comment) body.comment = comment;
  const response = await api.put<ApiResponse<Task>>(API_ENDPOINTS.tasks.status(id), body);
  return response.data.data;
};
