import { useQuery } from '@tanstack/react-query';
import { getAllUsers } from '../services/userService';
import type { User } from '../types/user.types';

/**
 * Kept for legacy display fallbacks only. These entries must never determine
 * which users appear in live dropdowns; eligibility comes from backend records.
 */
export const HEAD_ORDER = [
  { position: 1, headType: 'Principal', name: 'Prachi Pande', email: 'principal@school.com' },
  { position: 2, headType: 'Admin Head', name: 'Shruti Shah', email: 'admin@school.com' },
  { position: 3, headType: 'Finance Head', name: 'Snehal Madam', email: 'finance@school.com' },
  { position: 4, headType: 'Transport & Property Head', name: 'Thite Sir', email: 'transport@school.com' },
  { position: 5, headType: 'Admission & HR Head', name: 'Kruhika Madam', email: 'admission@school.com' },
  { position: 6, headType: 'Jr. Clerk (Admin Assistance)', name: 'Mallika Madam', email: 'admin.assistance@school.com' },
  { position: 7, headType: 'IT & ERP Head', name: 'Ekta Madam', email: 'it@school.com' },
  { position: 8, headType: 'Front Desk / Reception', name: 'Shipral Madam', email: 'frontdesk@school.com' },
  { position: 9, headType: 'Accountant & Store Fund', name: 'Pallavi Madam', email: 'purchase@school.com' },
  { position: 10, headType: 'House Keeping Head', name: 'Savita Patlnane Madam', email: 'housekeeping@school.com' }
] as const;

export const formatHeadLabel = (headType: string, name: string) => `${headType} - ${name}`;

const normalizeRole = (role?: string | null) => String(role ?? '').trim().replace(/\s+/g, '_').toUpperCase();

/** Active task-assignable users are fetched from the backend on every query refresh.
 * No email/name whitelist is used, so newly created eligible users appear naturally.
 */
export function useOrderedHeads() {
  return useQuery({
    queryKey: ['users', 'ordered-heads'],
    queryFn: async () => {
      const users: User[] = await getAllUsers();
      const seen = new Set<number>();
      return users
        // Every active user except the Chairman (the assigner) is assignable.
        // Do NOT restrict to built-in roles: users with custom roles (added via
        // "Other") or no head_type were silently dropped before.
        .filter((user) => user.is_active && normalizeRole(user.role) !== 'CHAIRMAN')
        .filter((user) => {
          if (seen.has(user.id)) return false;
          seen.add(user.id);
          return true;
        })
        .sort((a, b) => {
          const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB || a.name.localeCompare(b.name);
        })
        .map((user, index) => ({
          id: user.id,
          label: formatHeadLabel(user.head_type?.trim() || roleLabel(user), user.name),
          role: user.role,
          position: user.sort_order ?? index + 1,
          department_id: user.department_id
        }));
    },
    staleTime: 0,
    refetchOnWindowFocus: true
  });
}

function roleLabel(user: User): string {
  const labels: Record<string, string> = {
    DIRECTOR: 'School Director', PRINCIPAL: 'Principal', ADMIN: 'Admin Head', PROPERTY: 'Property & Maintenance Head',
    FINANCE: 'Finance Head', ADMISSION: 'Admission Head', HR: 'HR Head', PURCHASE: 'Purchase Head',
    IT: 'IT & ERP Head', TRANSPORT: 'Transport Head', HOUSEKEEPING: 'HouseKeeping Head', FRONT_DESK: 'Front Desk / Reception'
  };
  return labels[normalizeRole(user.role)] ?? user.role;
}