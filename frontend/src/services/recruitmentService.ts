import api from './api';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { Recruitment, RecruitmentApplication, CreateRecruitmentPayload, CreateApplicationPayload } from '../types/recruitment.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getRecruitments(status?: string, department_id?: number): Promise<Recruitment[]> {
  const res = await api.get<ApiResponse<Recruitment[]>>('/recruitment', {
    params: { status, department_id },
  });
  return res.data.data;
}

export async function getRecruitmentById(id: number): Promise<Recruitment> {
  const res = await api.get<ApiResponse<Recruitment>>(`/recruitment/${id}`);
  return res.data.data;
}

export async function createRecruitment(payload: CreateRecruitmentPayload): Promise<Recruitment> {
  const res = await api.post<ApiResponse<Recruitment>>('/recruitment', payload);
  return res.data.data;
}

export async function updateRecruitment(id: number, payload: Partial<CreateRecruitmentPayload>): Promise<Recruitment> {
  const res = await api.put<ApiResponse<Recruitment>>(`/recruitment/${id}`, payload);
  return res.data.data;
}

export async function getApplications(recruitmentId: number): Promise<RecruitmentApplication[]> {
  const res = await api.get<ApiResponse<RecruitmentApplication[]>>(`/recruitment/${recruitmentId}/applications`);
  return res.data.data;
}

export async function createApplication(recruitmentId: number, payload: CreateApplicationPayload): Promise<RecruitmentApplication> {
  const formData = new FormData();
  formData.append('applicant_name', payload.applicant_name);
  formData.append('email', payload.email);
  if (payload.notes) formData.append('notes', payload.notes);
  if (payload.resume) formData.append('resume', payload.resume);

  const res = await api.post<ApiResponse<RecruitmentApplication>>(`/recruitment/${recruitmentId}/applications`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function updateApplication(id: number, data: { stage?: string; notes?: string }): Promise<RecruitmentApplication> {
  const res = await api.put<ApiResponse<RecruitmentApplication>>(`/recruitment/applications/${id}`, data);
  return res.data.data;
}