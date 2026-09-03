import { API_ENDPOINTS } from '../constants/apiEndpoints';
import api from './api';

export type ReportType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM' | 'HOUSEKEEPING';

export interface ReportParams {
  dateFrom?: string;
  dateTo?: string;
  departmentId?: number | 'all';
  status?: string;
  assignedTo?: number | 'all';
  search?: string;
  startDateFrom?: string;
  dueDateTo?: string;
}

export interface ReportSummary {
  total: number;
  completed: number;
  delayed: number;
  pending: number;
  inProgress?: number;
  escalated?: number;
  performanceScore?: number;
}

export interface ReportDepartmentRow {
  department: string;
  total: number;
  completed: number;
  delayed: number;
  pending: number;
  inProgress?: number;
  escalated?: number;
  completionPercentage: number;
  performanceScore: number;
}

export interface ReportTaskRow {
  id: number;
  task: string;
  assignedTo: string;
  priority: string;
  status: string;
  dueDate: string | null;
  department: string;
  daysOverdue: number;
}

export interface ReportPreview {
  summary: ReportSummary;
  departments: ReportDepartmentRow[];
  tasks: ReportTaskRow[];
}

export interface ReportHistoryItem {
  id: number;
  type: ReportType;
  department?: { id: number; name: string } | null;
  dateFrom: string | null;
  dateTo: string | null;
  createdAt: string;
  pdfPath: string | null;
  excelPath: string | null;
}

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

const buildReportParams = (params: ReportParams) => {
  return {
    date_from: params.dateFrom,
    date_to: params.dateTo,
    department_id:
      params.departmentId && params.departmentId !== 'all' ? params.departmentId : undefined,
    status: params.status && params.status !== 'ALL' ? params.status : undefined,
    assigned_to:
      params.assignedTo && params.assignedTo !== 'all'
        ? params.assignedTo
        : undefined,
    search: params.search || undefined,
    start_date_from: params.startDateFrom,
    due_date_to: params.dueDateTo
  };
};

export const getDailyReport = async (params: ReportParams) => {
  const response = await api.get<ApiResponse<ReportPreview>>(API_ENDPOINTS.reports.daily, {
    params: buildReportParams(params)
  });
  return response.data.data;
};

export const getWeeklyReport = async (params: ReportParams) => {
  const response = await api.get<ApiResponse<ReportPreview>>(API_ENDPOINTS.reports.weekly, {
    params: buildReportParams(params)
  });
  return response.data.data;
};

export const getMonthlyReport = async (params: ReportParams) => {
  const response = await api.get<ApiResponse<ReportPreview>>(API_ENDPOINTS.reports.monthly, {
    params: buildReportParams(params)
  });
  return response.data.data;
};

export const getReportPreview = async (reportType: ReportType, params: ReportParams) => {
  if (reportType === 'DAILY') {
    return getDailyReport(params);
  }

  if (reportType === 'WEEKLY') {
    return getWeeklyReport(params);
  }

  return getMonthlyReport(params);
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const exportReportFile = async ({
  reportType,
  format,
  params
}: {
  reportType: ReportType;
  format: 'pdf' | 'excel';
  params: ReportParams;
}) => {
  const response = await api.get(API_ENDPOINTS.reports.export, {
    params: {
      ...buildReportParams(params),
      type: reportType,
      format
    },
    responseType: 'blob'
  });

  triggerDownload(
    response.data as Blob,
    `${reportType.toLowerCase()}-report.${format === 'pdf' ? 'pdf' : 'xls'}`
  );
};

export const exportPerformanceReport = async (format: 'pdf' | 'excel') => {
  const response = await api.get(API_ENDPOINTS.reports.performanceExport, {
    params: { format },
    responseType: 'blob'
  });

  triggerDownload(
    response.data as Blob,
    `performance-report.${format === 'pdf' ? 'pdf' : 'xls'}`
  );
};

<<<<<<< HEAD
export interface PerformanceExportFilters {
  dateFrom: string;
  dateTo: string;
  /** Head name, or 'ALL' for every head. */
  head: string;
  /** Register checking cycle, or 'ALL'. */
  cycle: string;
  /** Register status (IDLE/OK/REJECTED), or 'ALL'. */
  status: string;
}

/**
 * Backend-driven export for the Performance screen's Registry Performance
 * panel. Sends the SAME filters shown on screen (date range, Head, Cycle,
 * Status); the backend computes the CSV from the same shared functions the
 * on-screen numbers use, so it can never disagree with what's displayed.
 */
export const exportPerformanceReportFiltered = async (filters: PerformanceExportFilters) => {
  const response = await api.get(API_ENDPOINTS.reports.performanceFilteredExport, {
    params: {
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      head: filters.head === 'ALL' ? undefined : filters.head,
      cycle: filters.cycle === 'ALL' ? undefined : filters.cycle,
      status: filters.status === 'ALL' ? undefined : filters.status
    },
    responseType: 'blob'
  });

  triggerDownload(response.data as Blob, `performance_export_${filters.dateTo}.csv`);
};

=======
>>>>>>> 9ef7ff741ab2c33484f668db43b12c0ac76fae30
export const downloadReport = async (id: number, format: 'pdf' | 'excel') => {
  const response = await api.get(API_ENDPOINTS.reports.download(id, format), {
    responseType: 'blob'
  });

  triggerDownload(
    response.data as Blob,
    `report-${id}.${format === 'pdf' ? 'pdf' : 'xls'}`
  );
};

export const getReportHistory = async (): Promise<ReportHistoryItem[]> => {
  const response = await api.get<ApiResponse<ReportHistoryItem[]>>(API_ENDPOINTS.reports.history);
  return response.data.data;
};

export const exportDailyReportPdf = async () => {
  const response = await api.get(API_ENDPOINTS.reports.daily, {
    params: { format: 'pdf' },
    responseType: 'blob'
  });

  return response.data as Blob;
};
