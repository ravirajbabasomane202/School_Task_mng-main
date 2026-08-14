import type { User } from '../../types/user.types';
import { getRoleLabel } from '../../utils/roleUtils';
import Badge from '../common/Badge';
import Button from '../common/Button';

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
  if (users.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[18px] border border-[#EFF2F6] bg-white p-8">
        <p className="text-sm text-[#8A99B0]">No users found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#EFF2F6] bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-[#F8F9FC] text-left">
              {['Name', 'Role', 'Department', 'Email', 'Status', 'Actions'].map((heading) => (
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
                    <span className="text-sm font-medium text-[#1E293B]">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-[#36506C]">{getRoleLabel(user.role)}</td>
                <td className="px-4 py-3.5 text-sm text-[#36506C]">
                  {user.departmentName ?? user.department?.name ?? '--'}
                </td>
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
      </div>
    </div>
  );
}

export default UserTable;
