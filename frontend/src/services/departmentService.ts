import api from './api';

export interface DepartmentOption {
  id: number;
  name: string;
  description?: string | null;
}

export async function getAllDepartments(): Promise<DepartmentOption[]> {
  const response = await api.get<DepartmentOption[]>('/departments');
  return response.data;
}

export async function createDepartment(name: string): Promise<DepartmentOption> {
  const response = await api.post<{ data: DepartmentOption; message: string; success: boolean }>(
    '/departments',
    { name }
  );
  return response.data.data;
}
