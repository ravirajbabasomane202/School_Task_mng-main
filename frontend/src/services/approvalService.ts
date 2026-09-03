import { API_ENDPOINTS } from '../constants/apiEndpoints';
import api from './api';
import type { Approval, ApprovalStatus, CreateApprovalPayload } from '../types/approval.types';

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export const getAllApprovals = async (status?: ApprovalStatus): Promise<Approval[]> => {
  const response = await api.get<ApiResponse<Approval[]>>(API_ENDPOINTS.approvals.list, {
    params: status ? { status } : undefined,
  });
  return response.data.data;
};

export const getApprovalById = async (id: number): Promise<Approval> => {
  const response = await api.get<ApiResponse<Approval>>(API_ENDPOINTS.approvals.detail(id));
  return response.data.data;
};

export const createApprovalRequest = async (payload: CreateApprovalPayload): Promise<Approval> => {
  const response = await api.post<ApiResponse<Approval>>(API_ENDPOINTS.approvals.create, payload);
  return response.data.data;
};

export const approveApproval = async (id: number): Promise<Approval> => {
  const response = await api.put<ApiResponse<Approval>>(API_ENDPOINTS.approvals.process(id), {
    status: 'APPROVED',
  });
  return response.data.data;
};

export const rejectApproval = async (id: number, comment?: string): Promise<Approval> => {
  const response = await api.put<ApiResponse<Approval>>(API_ENDPOINTS.approvals.process(id), {
    status: 'REJECTED',
    ...(comment ? { comment } : {}),
  });
  return response.data.data;
};
