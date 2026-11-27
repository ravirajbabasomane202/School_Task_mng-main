export interface ImportantDocument {
  id: number;
  name: string;
  description: string | null;
  category: string;
  original_filename: string;
  uploaded_by: string;
  uploaded_by_id: number | null;
  upload_date: string;
  file_type: string;
  file_size: number;
  folder_id?: number | null;
  folder_path?: string[];
  /** True when every signed-in user may see it (the default for older documents). */
  visible_to_all?: boolean;
  /** Only sent to managers. */
  audience_user_ids?: number[];
}

export interface DocumentAudienceSelection {
  visibleToAll: boolean;
  userIds: number[];
}

export interface ImportantDocumentDetails {
  name: string;
  description: string;
  category: string;
  folder_id?: number | null;
  visible_to_all?: boolean;
  audience_user_ids?: number[];
}

export interface UploadImportantDocument extends ImportantDocumentDetails {
  file: File;
}

export interface DocumentFolder {
  id: number;
  name: string;
  parent_id: number | null;
  path: string[];
  document_count: number;
  total_document_count: number;
  subfolder_count: number;
  created_at: string | null;
}

export interface DocumentSearchParams {
  q?: string;
  folder_id?: number | 'root';
  recursive?: boolean;
  category?: string;
  uploaded_by?: string;
  file_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface DocumentListResult {
  documents: ImportantDocument[];
  total: number;
  page: number;
  pageSize: number;
}
