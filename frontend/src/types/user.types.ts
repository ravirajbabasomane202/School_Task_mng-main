import type { Role } from '../constants/roles';

export interface KeyResponsibility {
  id: number;
  description: string;
  sort_order: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  head_type?: string | null;
  sort_order?: number | null;
  department_id: number | null;
  departmentName?: string;
  department?: {
    id: number;
    name: string;
    description?: string | null;
  } | null;
  is_active: boolean;
  last_login: string | null;
  responsibility_summary?: string | null;
  key_responsibilities?: KeyResponsibility[];
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  department_id: number | null;
  departmentName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
