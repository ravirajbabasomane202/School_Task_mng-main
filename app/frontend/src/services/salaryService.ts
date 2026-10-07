import api from './api';
import { SALARY_ENDPOINTS } from '../constants/apiEndpoints';
import type {
  SalaryIncrement,
  SalaryStatus,
  CreateSalaryIncrementPayload,
  HRApproveSalaryPayload,
  FinanceProcessSalaryPayload,
} from '../types/salary.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getSalaryIncrements(status?: SalaryStatus): Promise<SalaryIncrement[]> {
  const res = await api.get<ApiResponse<SalaryIncrement[]>>(SALARY_ENDPOINTS.list, {
    params: status ? { status } : undefined,
  });
  return res.data.data;
}

export async function getSalaryIncrementById(id: number): Promise<SalaryIncrement> {
  const res = await api.get<ApiResponse<SalaryIncrement>>(SALARY_ENDPOINTS.detail(id));
  return res.data.data;
}

export async function createSalaryIncrement(payload: CreateSalaryIncrementPayload): Promise<SalaryIncrement> {
  const res = await api.post<ApiResponse<SalaryIncrement>>(SALARY_ENDPOINTS.create, payload);
  return res.data.data;
}

export async function hrApproveSalaryIncrement(id: number, payload?: HRApproveSalaryPayload): Promise<SalaryIncrement> {
  const res = await api.put<ApiResponse<SalaryIncrement>>(SALARY_ENDPOINTS.hrApprove(id), payload ?? {});
  return res.data.data;
}

export async function financeProcessSalaryIncrement(
  id: number,
  payload: FinanceProcessSalaryPayload
): Promise<SalaryIncrement> {
  const res = await api.put<ApiResponse<SalaryIncrement>>(SALARY_ENDPOINTS.financeProcess(id), payload);
  return res.data.data;
}
