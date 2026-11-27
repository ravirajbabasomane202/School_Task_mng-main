import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { KeyResponsibility } from '../types/user.types';
import api from './api';

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface MyKeyResponsibilities {
  user_id: number;
  name: string;
  head_type: string | null;
  role: string;
  summary: string | null;
  items: KeyResponsibility[];
}

export interface KeyResponsibilityTemplate {
  title: string;
  summary: string;
  items: string[];
}

/** The signed-in user's own responsibilities (the server reads the user from the token). */
export const getMyKeyResponsibilities = async () => {
  const response = await api.get<ApiResponse<MyKeyResponsibilities>>(API_ENDPOINTS.keyResponsibilities.mine);
  return response.data.data;
};

export const getKeyResponsibilityTemplates = async () => {
  const response = await api.get<ApiResponse<Record<string, KeyResponsibilityTemplate>>>(
    API_ENDPOINTS.keyResponsibilities.templates
  );
  return response.data.data;
};
