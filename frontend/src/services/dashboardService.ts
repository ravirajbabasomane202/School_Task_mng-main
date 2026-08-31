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
  completedRegisters: number;
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
  departments: {
    name: string;
    completionPct: number;
    healthColor: string;
  }[];
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

export const getStaffPerformance = async (): Promise<PerformanceData[]> => {
  const response = await api.get<ApiResponse<PerformanceData[]>>(API_ENDPOINTS.dashboard.performance);
  return response.data.data;
};

export const getMonthlyComparison = async (): Promise<MonthlyComparisonData[]> => {
  const response = await api.get<ApiResponse<MonthlyComparisonData[]>>(API_ENDPOINTS.dashboard.monthlyComparison);
  return response.data.data;
};

export const getDirectorDashboard = async (): Promise<DirectorDashboardData> => {
  const response = await api.get<ApiResponse<DirectorDashboardData>>(API_ENDPOINTS.dashboard.director);
  return response.data.data;
};
