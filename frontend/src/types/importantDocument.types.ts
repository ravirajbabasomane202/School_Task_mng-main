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
}

export interface ImportantDocumentDetails {
  name: string;
  description: string;
  category: string;
}

export interface UploadImportantDocument extends ImportantDocumentDetails {
  file: File;
}
