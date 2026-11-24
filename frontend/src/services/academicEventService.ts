import api from './api';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { AcademicEvent, AcademicEventFilters } from '../types/academicEvent.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getAcademicEvents(filters?: AcademicEventFilters): Promise<AcademicEvent[]> {
  const response = await api.get<ApiResponse<AcademicEvent[]>>(API_ENDPOINTS.academicEvents.list, {
    params: filters
  });
  return response.data.data;
}

export async function createAcademicEvent(payload: FormData): Promise<AcademicEvent> {
  const response = await api.post<ApiResponse<AcademicEvent>>(
    API_ENDPOINTS.academicEvents.create,
    payload
  );
  return response.data.data;
}

export async function updateAcademicEvent(id: number, payload: FormData): Promise<AcademicEvent> {
  const response = await api.put<ApiResponse<AcademicEvent>>(
    API_ENDPOINTS.academicEvents.update(id),
    payload
  );
  return response.data.data;
}

export async function deleteAcademicEvent(id: number): Promise<void> {
  await api.delete(API_ENDPOINTS.academicEvents.delete(id));
}

export async function downloadAcademicEventAttachment(id: number, filename: string): Promise<void> {
  const response = await api.get<Blob>(API_ENDPOINTS.academicEvents.attachment(id), {
    responseType: 'blob'
  });
  const objectUrl = URL.createObjectURL(response.data);
  try {
    const link = globalThis.document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    globalThis.document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
