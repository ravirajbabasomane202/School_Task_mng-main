export const ROLES = {
  CHAIRMAN: 'CHAIRMAN',
  DIRECTOR: 'DIRECTOR',
  PROPERTY: 'PROPERTY',
  FINANCE: 'FINANCE',
  ADMIN: 'ADMIN',
  PRINCIPAL: 'PRINCIPAL',
  ADMISSION: 'ADMISSION',
  HR: 'HR',
  PURCHASE: 'PURCHASE',
  IT: 'IT',
  TRANSPORT: 'TRANSPORT',
  HOUSEKEEPING: 'HOUSEKEEPING',
  FRONT_DESK: 'FRONT_DESK'
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.CHAIRMAN]: 'Chairman',
  [ROLES.DIRECTOR]: 'School Director',
  [ROLES.PROPERTY]: 'Property & Maintenance Head',
  [ROLES.FINANCE]: 'Finance Head',
  [ROLES.ADMIN]: 'Admin Head',
  [ROLES.PRINCIPAL]: 'Principal',
  [ROLES.ADMISSION]: 'Admission Head',
  [ROLES.HR]: 'HR Head',
  [ROLES.PURCHASE]: 'Purchase Head',
  [ROLES.IT]: 'IT & ERP Head',
  [ROLES.TRANSPORT]: 'Transport Head',
  [ROLES.HOUSEKEEPING]: 'HouseKeeping Head',
  [ROLES.FRONT_DESK]: 'Front Desk / Reception'
};

export const DEPARTMENT_HEAD_ROLES: Role[] = [
  ROLES.PROPERTY,
  ROLES.FINANCE,
  ROLES.ADMIN,
  ROLES.PRINCIPAL,
  ROLES.ADMISSION,
  ROLES.HR,
  ROLES.PURCHASE,
  ROLES.IT,
  ROLES.TRANSPORT,
  ROLES.HOUSEKEEPING,
  ROLES.FRONT_DESK
];

/**
 * Roles with full Chairman authority (mirrors backend utils/permissions.py).
 * Use these instead of comparing against ROLES.CHAIRMAN.
 */
export const CHAIRMAN_LEVEL_ROLES: Role[] = [ROLES.CHAIRMAN, ROLES.PRINCIPAL];

/** Chairman-level roles plus the Director: roles with school-wide visibility. */
export const ELEVATED_ROLES: Role[] = [...CHAIRMAN_LEVEL_ROLES, ROLES.DIRECTOR];

/**
 * Chairman-level roles that are also task assignees. On a task assigned to them
 * they only act as the assignee. The Chairman is never restricted.
 */
export const ASSIGNEE_ONLY_ROLES: Role[] = CHAIRMAN_LEVEL_ROLES.filter((role) => role !== ROLES.CHAIRMAN);

export const isChairmanLevel = (role?: string | null): boolean =>
  !!role && (CHAIRMAN_LEVEL_ROLES as string[]).includes(role);

export const isElevatedRole = (role?: string | null): boolean =>
  !!role && (ELEVATED_ROLES as string[]).includes(role);

export const TASK_ASSIGNABLE_ROLES: Role[] = [ROLES.DIRECTOR, ...DEPARTMENT_HEAD_ROLES];
