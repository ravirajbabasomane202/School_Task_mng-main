import { useQuery } from '@tanstack/react-query';
import { getAllRoles, type RoleOption } from '../services/roleService';
import { resolveRoleName } from '../utils/performanceUtils';

/** Roles from the backend (single source of truth). */
export function useRoles() {
  const query = useQuery<RoleOption[]>({ queryKey: ['roles'], queryFn: getAllRoles, staleTime: 60_000 });
  const roles = query.data ?? [];
  return {
    roles,
    isLoading: query.isLoading,
    /** Display name for a role key; safe fallback if the role is missing. */
    getRoleName: (key: string, rowName?: string | null) => resolveRoleName(key, roles, rowName),
  };
}
