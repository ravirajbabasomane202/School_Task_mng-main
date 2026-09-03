import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import * as announcementService from '../../services/announcementService';
import * as userService from '../../services/userService';
import type { AnnouncementTarget } from '../../types/notification.types';
import type { User } from '../../types/user.types';

type DepartmentOption = {
  id: number;
  name: string;
};

type UserWithDepartment = User & {
  department?: {
    id: number;
    name: string;
  };
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getAnnouncementTitle(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Untitled announcement';
  }

  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
}

function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<AnnouncementTarget>('ALL');
  const [departmentId, setDepartmentId] = useState('');
  const [message, setMessage] = useState('');

  const announcementsQuery = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementService.getAnnouncements
  });

  const usersQuery = useQuery({
    queryKey: ['users', 'announcement-departments'],
    queryFn: () => userService.getAllUsers()
  });

  const departmentOptions = useMemo(() => {
    const source = (usersQuery.data ?? []) as UserWithDepartment[];
    const uniqueDepartments = new Map<number, DepartmentOption>();

    source.forEach((user) => {
      const department = user.department;
      if (department?.id && !uniqueDepartments.has(department.id)) {
        uniqueDepartments.set(department.id, {
          id: department.id,
          name: department.name
        });
      }
    });

    return Array.from(uniqueDepartments.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }, [usersQuery.data]);

  const createAnnouncementMutation = useMutation({
    mutationFn: announcementService.createAnnouncement,
    onSuccess: async () => {
      setMessage('');
      setTarget('ALL');
      setDepartmentId('');
      toast.success('Announcement broadcast successfully.');
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: () => toast.error('Failed to broadcast announcement. Please try again.'),
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!message.trim()) {
      toast.error('Enter a message before broadcasting.');
      return;
    }

    if (target === 'DEPARTMENT' && !departmentId) {
      toast.error('Choose a department for a targeted message.');
      return;
    }

    await createAnnouncementMutation.mutateAsync({
      message: message.trim(),
      target,
      department_id: target === 'DEPARTMENT' ? Number(departmentId) : undefined
    });
  };

  return (
    <section className="grid gap-5 p-5 xl:grid-cols-[1.1fr,0.9fr]">
      <article className="rounded-[22px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Comms Module
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1E293B]">Broadcast message</h2>
          </div>
          <Badge variant="blue">Chairman control</Badge>
        </div>

        <form className="mt-6 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Target</span>
            <select
              className="min-h-[40px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              onChange={(event) => setTarget(event.target.value as AnnouncementTarget)}
              value={target}
            >
              <option value="ALL">All staff</option>
              <option value="DEPARTMENT">Specific department</option>
            </select>
          </label>

          {target === 'DEPARTMENT' ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Department</span>
              <select
                className="min-h-[40px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                onChange={(event) => setDepartmentId(event.target.value)}
                value={departmentId}
              >
                <option value="">Select department</option>
                {departmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Message</span>
            <textarea
              className="min-h-[220px] rounded-[16px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-4 py-3 text-sm leading-6 text-[#1E293B] outline-none transition placeholder:text-[#8A99B0] focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Share an update, direction, or escalation note for your teams."
              value={message}
            />
          </label>

          <div className="flex justify-end">
            <Button loading={createAnnouncementMutation.isPending} type="submit">
              Broadcast now
            </Button>
          </div>
        </form>
      </article>

      <article className="rounded-[22px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Comms Log
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1E293B]">Recent announcements</h2>
          </div>
          <Badge variant="gray">{announcementsQuery.data?.length ?? 0} items</Badge>
        </div>

        <div className="mt-6 space-y-3">
          {announcementsQuery.data && announcementsQuery.data.length > 0 ? (
            announcementsQuery.data.map((announcement) => (
              <div
                className="rounded-[18px] border border-[#EFF2F6] bg-[#FAFCFE] px-4 py-4"
                key={announcement.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1E293B]">
                      {getAnnouncementTitle(announcement.message)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#5B6E8C]">{announcement.message}</p>
                  </div>
                  <Badge variant={announcement.target === 'ALL' ? 'blue' : 'amber'}>
                    {announcement.target === 'ALL'
                      ? 'All staff'
                      : announcement.department?.name ?? 'Department'}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-[#8A99B0]">{formatDate(announcement.created_at)}</p>
              </div>
            ))
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#D7E1EC] bg-[#FAFCFE] px-4 py-10 text-center text-sm text-[#8A99B0]">
              No announcements have been broadcast yet.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

export default AnnouncementsPage;
