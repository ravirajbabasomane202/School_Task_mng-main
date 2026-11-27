import api from './api';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import type {
  DocumentFolder,
  DocumentListResult,
  DocumentSearchParams,
  ImportantDocument,
  ImportantDocumentDetails
} from '../types/importantDocument.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getImportantDocuments(): Promise<ImportantDocument[]> {
  const response = await api.get<ApiResponse<ImportantDocument[]>>(API_ENDPOINTS.documents.list);
  return response.data.data;
}

interface ListResponse extends ApiResponse<ImportantDocument[]> {
  meta?: { total: number; page: number; page_size: number };
}

/** Server-side search/filter/browse; the server only returns documents the caller may open. */
export async function searchImportantDocuments(params: DocumentSearchParams = {}): Promise<DocumentListResult> {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== false)
  );
  const response = await api.get<ListResponse>(API_ENDPOINTS.documents.list, { params: clean });
  const documents = response.data.data;
  return {
    documents,
    total: response.data.meta?.total ?? documents.length,
    page: response.data.meta?.page ?? 1,
    pageSize: response.data.meta?.page_size ?? documents.length
  };
}

export async function getDocumentFolders(): Promise<DocumentFolder[]> {
  const response = await api.get<ApiResponse<DocumentFolder[]>>(API_ENDPOINTS.documents.folders);
  return response.data.data;
}

export async function createDocumentFolder(name: string, parentId: number | null): Promise<DocumentFolder> {
  const response = await api.post<ApiResponse<DocumentFolder>>(API_ENDPOINTS.documents.folders, {
    name,
    parent_id: parentId
  });
  return response.data.data;
}

export async function updateDocumentFolder(
  id: number,
  changes: { name?: string; parent_id?: number | null }
): Promise<DocumentFolder> {
  const response = await api.put<ApiResponse<DocumentFolder>>(API_ENDPOINTS.documents.folder(id), changes);
  return response.data.data;
}

export async function deleteDocumentFolder(id: number): Promise<void> {
  await api.delete(API_ENDPOINTS.documents.folder(id));
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
