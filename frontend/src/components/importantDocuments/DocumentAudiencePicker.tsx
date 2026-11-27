import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllUsers } from '../../services/userService';
import type { DocumentAudienceSelection } from '../../types/importantDocument.types';
import Button from '../common/Button';

interface DocumentAudiencePickerProps {
  value: DocumentAudienceSelection;
  onChange: (next: DocumentAudienceSelection) => void;
  error?: string;
}

/**
 * "Who can see this document?" - checkbox list of active users.
 * Select All = visible to everyone (including users added later). Unticking one
 * user while "all" is on turns it into an explicit list of everyone else.
 * The server enforces the choice; this is only the editor.
 */
function DocumentAudiencePicker({ value, onChange, error }: DocumentAudiencePickerProps) {
  const [search, setSearch] = useState('');
  const usersQuery = useQuery({ queryKey: ['users', 'for-document-audience'], queryFn: () => getAllUsers() });
  const users = useMemo(() => (usersQuery.data ?? []).filter((user) => user.is_active), [usersQuery.data]);
  const shown = users.filter((user) =>
    `${user.name} ${user.head_type ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const isChecked = (id: number) => value.visibleToAll || value.userIds.includes(id);
  const selectedCount = value.visibleToAll ? users.length : value.userIds.length;

  const toggleUser = (id: number, checked: boolean) => {
    const current = value.visibleToAll ? users.map((user) => user.id) : value.userIds;
    const next = checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id);
    onChange({ visibleToAll: false, userIds: next });
  };

  return (
    <fieldset className="space-y-2" data-testid="document-audience-picker">
      <legend className="text-xs font-medium text-[#5B6E8C]">Who Can See This Document? *</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <input
            checked={value.visibleToAll}
            onChange={(event) => onChange({ visibleToAll: event.target.checked, userIds: [] })}
            type="checkbox"
          />
          Select All (everyone)
        </label>
        <Button onClick={() => onChange({ visibleToAll: false, userIds: [] })} size="sm" type="button" variant="ghost">
          Deselect All
        </Button>
        <span className="text-xs text-[#8A99B0]">{selectedCount} of {users.length} selected</span>
      </div>
      <input
        aria-label="Search users"
        className="w-full rounded-lg border border-[#E4EAF2] px-3 py-1.5 text-sm"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search users…"
        type="search"
        value={search}
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-[#E4EAF2] p-2">
        {usersQuery.isLoading ? (
          <p className="text-sm text-[#8A99B0]">Loading users…</p>
        ) : usersQuery.isError ? (
          <p className="text-sm text-red-600">Unable to load users.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[#8A99B0]">No users match.</p>
        ) : (
          <ul className="space-y-1">
            {shown.map((user) => (
              <li key={user.id}>
                <label className="flex items-center gap-2 text-sm text-[#1E293B]">
                  <input
                    checked={isChecked(user.id)}
                    onChange={(event) => toggleUser(user.id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {user.name}
                    {user.head_type?.trim() ? <span className="text-[#8A99B0]"> — {user.head_type.trim()}</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-[#8A99B0]">
        The uploader and Chairman-level managers can always open the document. Everyone else not selected cannot see or download it.
      </p>
      {error ? <p className="text-xs text-red-600" role="alert">{error}</p> : null}
    </fieldset>
  );
}

export default DocumentAudiencePicker;
