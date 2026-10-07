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

export const TASK_ASSIGNABLE_ROLES: Role[] = [ROLES.DIRECTOR, ...DEPARTMENT_HEAD_ROLES];
