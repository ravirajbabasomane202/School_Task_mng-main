import api from './api';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type {
  AcademicEvent,
  AcademicEventFilters,
  AcademicEventHistoryEntry,
  ApprovalStatus,
  CompleteEventPayload
} from '../types/academicEvent.types';

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

export async function getPendingEventUpdates(): Promise<AcademicEvent[]> {
  const response = await api.get<ApiResponse<AcademicEvent[]>>(API_ENDPOINTS.academicEvents.pendingUpdates);
  return response.data.data;
}

export async function submitEventReason(id: number, reason: string): Promise<AcademicEvent> {
  const response = await api.post<ApiResponse<AcademicEvent>>(API_ENDPOINTS.academicEvents.reason(id), { reason });
  return response.data.data;
}

export async function completeAcademicEvent(id: number, payload: CompleteEventPayload): Promise<AcademicEvent> {
  const response = await api.post<ApiResponse<AcademicEvent>>(API_ENDPOINTS.academicEvents.complete(id), payload);
  return response.data.data;
}

export async function updateEventApproval(
  id: number,
  approval_status: ApprovalStatus,
  remarks?: string
): Promise<AcademicEvent> {
  const response = await api.post<ApiResponse<AcademicEvent>>(API_ENDPOINTS.academicEvents.approval(id), {
    approval_status,
    remarks
  });
  return response.data.data;
}

export async function getAcademicEventHistory(id: number): Promise<AcademicEventHistoryEntry[]> {
  const response = await api.get<ApiResponse<AcademicEventHistoryEntry[]>>(API_ENDPOINTS.academicEvents.history(id));
  return response.data.data;
}
