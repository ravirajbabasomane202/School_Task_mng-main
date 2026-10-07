import api from './api';

export interface RoleOption {
  id: number;
  name: string;
}

export async function getAllRoles(): Promise<RoleOption[]> {
  const response = await api.get<RoleOption[]>('/roles');
  return response.data;
}

export async function createRole(name: string): Promise<RoleOption> {
  const response = await api.post<{ data: RoleOption; message: string; success: boolean }>(
    '/roles',
    { name }
  );
  return response.data.data;
}
