import api from './api';
import type {
  LeaveRequest,
  LeaveStatus,
  ResumptionRequest,
  CreateLeavePayload,
  CreateResumptionPayload,
  ProcessLeavePayload,
} from '../types/leave.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getLeaveRequests(status?: LeaveStatus): Promise<LeaveRequest[]> {
  const res = await api.get<ApiResponse<LeaveRequest[]>>('/leave', {
    params: status ? { status } : undefined,
  });
  return res.data.data;
}

export async function createLeaveRequest(payload: CreateLeavePayload): Promise<LeaveRequest> {
  const res = await api.post<ApiResponse<LeaveRequest>>('/leave', payload);
  return res.data.data;
}

export async function processLeaveRequest(
  id: number,
  payload: ProcessLeavePayload
): Promise<LeaveRequest> {
  const res = await api.put<ApiResponse<LeaveRequest>>(`/leave/${id}/process`, payload);
  return res.data.data;
}

export async function getResumptionRequests(status?: LeaveStatus): Promise<ResumptionRequest[]> {
  const res = await api.get<ApiResponse<ResumptionRequest[]>>('/leave/resumption', {
    params: status ? { status } : undefined,
  });
  return res.data.data;
}

export async function createResumptionRequest(
  payload: CreateResumptionPayload
): Promise<ResumptionRequest> {
  const res = await api.post<ApiResponse<ResumptionRequest>>('/leave/resumption', payload);
  return res.data.data;
}

export async function processResumptionRequest(
  id: number,
  payload: ProcessLeavePayload
): Promise<ResumptionRequest> {
  const res = await api.put<ApiResponse<ResumptionRequest>>(
    `/leave/resumption/${id}/process`,
    payload
  );
  return res.data.data;
}
