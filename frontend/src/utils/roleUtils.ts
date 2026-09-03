import {
  ROLES,
  ROLE_LABELS,
  DEPARTMENT_HEAD_ROLES,
  TASK_ASSIGNABLE_ROLES,
  type Role
} from '../constants/roles';

/**
 * Return the human-readable label for a role.
 */
export function getRoleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

/**
 * Check if a role belongs to a department head (not chairman / director).
 */
export function isDepartmentHead(role: Role | string): boolean {
  return DEPARTMENT_HEAD_ROLES.includes(role as Role);
}

/**
 * Check if a user is the Chairman.
 */
export function isChairman(role: Role | string): boolean {
  return role === ROLES.CHAIRMAN;
}

/**
 * Check if a user is the Director / Manager.
 */
export function isDirector(role: Role | string): boolean {
  return role === ROLES.DIRECTOR;
}

/**
 * Return true if the role has elevated access (chairman or director).
 */
export function hasElevatedAccess(role: Role | string): boolean {
  return role === ROLES.CHAIRMAN || role === ROLES.DIRECTOR;
}

/**
 * Get a Tailwind colour class for a given role badge.
 */
export function getRoleBadgeColor(role: Role | string): string {
  const colorMap: Record<string, string> = {
    [ROLES.CHAIRMAN]: 'bg-purple-100 text-purple-800',
    [ROLES.DIRECTOR]: 'bg-blue-100 text-blue-800',
    [ROLES.FINANCE]: 'bg-green-100 text-green-800',
    [ROLES.HR]: 'bg-pink-100 text-pink-800',
    [ROLES.IT]: 'bg-cyan-100 text-cyan-800',
    [ROLES.ADMIN]: 'bg-orange-100 text-orange-800',
    [ROLES.PRINCIPAL]: 'bg-indigo-100 text-indigo-800',
    [ROLES.PURCHASE]: 'bg-yellow-100 text-yellow-800',
    [ROLES.TRANSPORT]: 'bg-teal-100 text-teal-800',
    [ROLES.PROPERTY]: 'bg-lime-100 text-lime-800',
    [ROLES.ADMISSION]: 'bg-rose-100 text-rose-800'
  };
  return colorMap[role] ?? 'bg-gray-100 text-gray-800';
}

/**
 * Given a list of all roles, return only those accessible
 * as assignment targets by the chairman (all department heads + director).
 */
export function getAssignableRoles(): Role[] {
  return TASK_ASSIGNABLE_ROLES;
}

/**
 * Derive a short acronym / initials from a full name.
 * e.g. "Rahul Sharma" → "RS"
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0].toUpperCase())
    .slice(0, 2)
    .join('');
}
