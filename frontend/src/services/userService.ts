import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { User } from '../types/user.types';
import api from './api';

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

interface UserFilters {
  department_id?: number;
  role?: string;
}

export const getAllUsers = async (filters?: UserFilters) => {
  const response = await api.get<ApiResponse<User[]>>(API_ENDPOINTS.users.list, {
    params: filters
  });

  return response.data.data;
};
