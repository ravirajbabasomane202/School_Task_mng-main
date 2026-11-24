import api from './api';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type { ImportantDocument, ImportantDocumentDetails } from '../types/importantDocument.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getImportantDocuments(): Promise<ImportantDocument[]> {
  const response = await api.get<ApiResponse<ImportantDocument[]>>(API_ENDPOINTS.documents.list);
  return response.data.data;
}

export async function uploadImportantDocument(payload: FormData): Promise<ImportantDocument> {
  const response = await api.post<ApiResponse<ImportantDocument>>(
    API_ENDPOINTS.documents.upload,
    payload
  );
  return response.data.data;
}

export async function updateImportantDocument(
  id: number,
  payload: ImportantDocumentDetails
): Promise<ImportantDocument> {
  const response = await api.put<ApiResponse<ImportantDocument>>(
    API_ENDPOINTS.documents.detail(id),
    payload
  );
  return response.data.data;
}

export async function downloadImportantDocument(id: number, filename: string): Promise<void> {
  const response = await api.get<Blob>(API_ENDPOINTS.documents.download(id), {
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

export async function deleteImportantDocument(id: number): Promise<void> {
  await api.delete(API_ENDPOINTS.documents.delete(id));
}
