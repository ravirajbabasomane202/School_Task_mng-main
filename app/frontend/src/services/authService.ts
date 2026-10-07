import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { ChangePasswordPayload, LoginPayload, AuthUser } from '../types/user.types';
import api from './api';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const login = async (payload: LoginPayload) => {
  const response = await api.post<ApiResponse<LoginResponse>>(API_ENDPOINTS.auth.login, payload);
  return response.data.data;
};

export const logout = async () => {
  const refreshToken = localStorage.getItem('refreshToken');

  await api.post(API_ENDPOINTS.auth.logout, {
    refreshToken
  });
};

export const changePassword = async (payload: ChangePasswordPayload) => {
  const response = await api.post<ApiResponse<null>>(API_ENDPOINTS.auth.changePassword, payload);
  return response.data;
};

export const refreshToken = async () => {
  const storedRefreshToken = localStorage.getItem('refreshToken');

  if (!storedRefreshToken) {
    throw new Error('Refresh token is missing');
  }

  const response = await api.post<ApiResponse<{ accessToken: string }>>(API_ENDPOINTS.auth.refresh, {
    refreshToken: storedRefreshToken
  });
  return response.data.data;
};
