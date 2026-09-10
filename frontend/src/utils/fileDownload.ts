import api from '../services/api';
import { getBackendBaseUrl } from './apiBase';

/**
 * The backend now requires a valid JWT (and an ownership/authorization
 * check) to serve anything under /uploads/<filename> — see
 * backend/app/__init__.py's serve_upload route. A bare <a href="..."> or
 * <img src="..."> can't carry the Authorization header, so any download of
 * a server-stored file (task attachment/proof, recruitment resume, etc.)
 * must go through this helper instead, which reuses the authenticated
 * axios instance (including its token-refresh-on-401 handling) and streams
 * the response back as a blob.
 *
 * `relativePath` is whatever the backend stored, e.g. "uploads/tasks/12/abc_brief.pdf".
 */
export async function fetchAuthenticatedUpload(relativePath: string): Promise<Blob> {
  const path = relativePath.replace(/^\/+/, '');
  const response = await api.get(`/${path}`, {
    baseURL: getBackendBaseUrl(),
    responseType: 'blob'
  });
  return response.data as Blob;
}

/**
 * Fetches a file from /uploads/<relativePath> with the user's auth token
 * and triggers a browser download for it (equivalent to what a plain
 * <a href download> would have done, before auth was required).
 */
export async function downloadAuthenticatedUpload(relativePath: string, downloadName?: string): Promise<void> {
  const blob = await fetchAuthenticatedUpload(relativePath);
  const blobUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadName ?? relativePath.split('/').pop() ?? 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Escapes a single CSV cell value (quotes it if it contains a comma,
 * double-quote, or newline). Shared by every client-side CSV export in the
 * app so formatting/edge-case handling only needs to live in one place.
 */
export function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds a CSV file from an array of rows (first row is typically the
 * header) and triggers a browser download for it. This is the single
 * client-side CSV export path for report-style screens (Task/Register
 * reports, etc.) that export data the user already fetched through an
 * authorized API call — no extra backend round-trip needed.
 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
