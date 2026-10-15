import { useQuery } from '@tanstack/react-query';
import { getAllUsers } from '../services/userService';

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

export function useOrderedHeads() {
  return useQuery({
    queryKey: ['users', 'ordered-heads'],
    queryFn: async () => {
      const users = await getAllUsers();
      const activeByEmail = new Map(users.filter((user) => user.is_active).map((user) => [user.email.toLowerCase(), user]));
      return HEAD_ORDER.flatMap((entry) => {
        const user = activeByEmail.get(entry.email);
        if (!user) return [];
        const headType = user.head_type || entry.headType;
        return [{ id: user.id, label: formatHeadLabel(headType, user.name || entry.name), role: user.role, position: entry.position }];
      });
    }
  });
}
