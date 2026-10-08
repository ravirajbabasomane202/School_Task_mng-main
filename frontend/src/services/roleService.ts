import api from './api';

export interface RoleOption {
  id: number;
  /** Stable identity (what users.role stores). Never changes. */
  key: string;
  /** Display label only; an admin can rename it. */
  name: string;
  is_builtin?: boolean;
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

export async function renameRole(id: number, name: string): Promise<RoleOption> {
  const response = await api.put<{ data: RoleOption; message: string; success: boolean }>(
    `/roles/${id}`,
    { name }
  );
  return response.data.data;
}
