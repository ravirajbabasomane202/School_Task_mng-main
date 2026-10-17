import type { User } from '../../types/user.types';
import { getRoleLabel } from '../../utils/roleUtils';
import Badge from '../common/Badge';
import Button from '../common/Button';
import ResponsiveTable from '../common/ResponsiveTable';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatHeadLabel } from '../../constants/headOrder';

const displayUserName = (user: User) => {
  const headType = user.head_type?.trim();
  return headType ? formatHeadLabel(headType, user.name) : user.name;
};

interface UserTableProps {
  onDeactivate?: (user: User) => void;
  onEdit?: (user: User) => void;
  users: User[];
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

function UserTable({ onDeactivate, onEdit, users }: UserTableProps) {
  const isMobile = useIsMobile();

  if (users.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[18px] border border-[#EFF2F6] bg-white p-8">
        <p className="text-sm text-[#8A99B0]">No users found.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <ul className="space-y-3" data-testid="user-card-list">
        {users.map((user) => (
          <li className="rounded-[14px] border border-[#EFF2F6] bg-white p-4" key={user.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E6F1FB] text-xs font-semibold text-[#0C447C]">
                  {getInitials(user.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1E293B]">{displayUserName(user)}</p>
                  <p className="truncate text-xs text-[#5B6E8C]">{getRoleLabel(user.role)}</p>
                </div>
              </div>
              <Badge variant={user.is_active ? 'green' : 'gray'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="mt-2 break-all text-xs text-[#36506C]">{user.email}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => onEdit?.(user)} size="sm">
                Edit
              </Button>
              <Button onClick={() => onDeactivate?.(user)} size="sm" variant="danger">
                Deactivate
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#EFF2F6] bg-white">
      <ResponsiveTable minWidth={800}>
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-[#F8F9FC] text-left">
              {['Head Type - Name', 'Role', 'Email', 'Status', 'Actions'].map((heading) => (
                <th
                  className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A99B0]"
                  key={heading}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-t border-[#EFF2F6]" key={user.id}>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E6F1FB] text-xs font-semibold text-[#0C447C]">
                      {getInitials(user.name)}
                    </div>
                    <span className="text-sm font-medium text-[#1E293B]">{displayUserName(user)}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-[#36506C]">{getRoleLabel(user.role)}</td>
                <td className="px-4 py-3.5 text-sm text-[#36506C]">{user.email}</td>
                <td className="px-4 py-3.5">
                  <Badge variant={user.is_active ? 'green' : 'gray'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onEdit?.(user)} size="sm">
                      Edit
                    </Button>
                    <Button onClick={() => onDeactivate?.(user)} size="sm" variant="danger">
                      Deactivate
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
}

export default UserTable;
