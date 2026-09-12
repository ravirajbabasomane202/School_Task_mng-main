import { API_ENDPOINTS } from '../constants/apiEndpoints';
import api from './api';

interface PerformanceData {
  userId: number;
  name: string;
  role: string;
  totalTasks: number;
  completedTasks: number;
  delayedTasks: number;
  performanceScore: number;
  delayRate: number;
  totalRegisters: number;
  checkingCycles: string[];
  completedRegisters: number;
  missedRegisters: number;
  rejectedRegisters: number;
  registerPerformance: number;
  overallPerformance: number;
}

interface MonthlyComparisonData {
  departmentId: number;
  name: string;
  monthlyRates: Array<{
    month: string;
    completionRate: number;
    totalTasks: number;
    completedTasks: number;
  }>;
}

interface DirectorDashboardData {
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  delayedTasks: number;
  taskBreakdown: {
    pending: number;
    inProgress: number;
    completed: number;
    delayed: number;
    escalated: number;
  };
  recentTasks: Array<{
    id: number;
    title: string;
    status: string;
    assignedTo?: { name: string };
  }>;
}

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export const getStaffPerformance = async (range?: { dateFrom?: string; dateTo?: string }): Promise<PerformanceData[]> => {
  const response = await api.get<ApiResponse<PerformanceData[]>>(API_ENDPOINTS.dashboard.performance, {
    params: range && {
      date_from: range.dateFrom,
      date_to: range.dateTo
    }
  });
  return response.data.data;
};

export const getMonthlyComparison = async (): Promise<MonthlyComparisonData[]> => {
  const response = await api.get<ApiResponse<MonthlyComparisonData[]>>(API_ENDPOINTS.dashboard.monthlyComparison);
  return response.data.data;
};

export const getDirectorDashboard = async (): Promise<DirectorDashboardData> => {
  const response = await api.get<ApiResponse<DirectorDashboardData>>(API_ENDPOINTS.dashboard.director);
  const data = response.data.data as Partial<DirectorDashboardData> | null;

  return {
    totalTasks: data?.totalTasks ?? 0,
    completedTasks: data?.completedTasks ?? 0,
    completionPercentage: data?.completionPercentage ?? 0,
    delayedTasks: data?.delayedTasks ?? 0,
    taskBreakdown: {
      pending: data?.taskBreakdown?.pending ?? 0,
      inProgress: data?.taskBreakdown?.inProgress ?? 0,
      completed: data?.taskBreakdown?.completed ?? 0,
      delayed: data?.taskBreakdown?.delayed ?? 0,
      escalated: data?.taskBreakdown?.escalated ?? 0
    },
    recentTasks: Array.isArray(data?.recentTasks) ? data.recentTasks : []
  };
};