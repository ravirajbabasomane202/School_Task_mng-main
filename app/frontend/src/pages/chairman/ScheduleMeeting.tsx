import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { createMeeting, deleteMeeting, getMeetings, updateMeeting, type Meeting } from '../../services/meetingService';
import api from '../../services/api';

const STATUS_COLORS: Record<string, 'blue' | 'amber' | 'green' | 'red' | 'gray'> = {
  SCHEDULED: 'blue',
  ONGOING: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

const TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General',
  DEPARTMENTAL: 'Departmental',
  EMERGENCY: 'Emergency',
};

interface User {
  id: number;
  name: string;
  role: string;
}

interface FormState {
  title: string;
  description: string;
  agenda: string;
  location: string;
  meeting_date: string;
  duration_minutes: string;
  meeting_type: string;
  attendee_ids: number[];
}

const emptyForm: FormState = {
  title: '',
  description: '',
  agenda: '',
  location: '',
  meeting_date: '',
  duration_minutes: '60',
  meeting_type: 'GENERAL',
  attendee_ids: [],
};

function formatDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ScheduleMeeting() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);

  const meetingsQuery = useQuery({
    queryKey: ['meetings', statusFilter, typeFilter],
    queryFn: () =>
      getMeetings({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
      }),
  });

  const usersQuery = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await api.get<{ data: User[] }>('/users');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createMeeting,
    onSuccess: () => {
      toast.success('Meeting scheduled!');
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
      setShowModal(false);
      setForm(emptyForm);
    },
    onError: () => toast.error('Failed to schedule meeting.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateMeeting>[1] }) =>
      updateMeeting(id, payload),
    onSuccess: () => {
      toast.success('Meeting updated!');
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
      setShowModal(false);
      setEditingMeeting(null);
      setForm(emptyForm);
    },
    onError: () => toast.error('Failed to update meeting.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMeeting,
    onSuccess: () => {
      toast.success('Meeting cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
      setDetailMeeting(null);
    },
    onError: () => toast.error('Failed to cancel meeting.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateMeeting(id, { status }),
    onSuccess: () => {
      toast.success('Status updated.');
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => toast.error('Failed to update status.'),
  });

  function openCreate() {
    setEditingMeeting(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(m: Meeting) {
    setEditingMeeting(m);
    setForm({
      title: m.title,
      description: m.description ?? '',
      agenda: m.agenda ?? '',
      location: m.location ?? '',
      meeting_date: m.meeting_date ? m.meeting_date.slice(0, 16) : '',
      duration_minutes: String(m.duration_minutes ?? 60),
      meeting_type: m.meeting_type,
      attendee_ids: m.attendees.map((a) => a.user_id),
    });
    setShowModal(true);
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.meeting_date) {
      toast.error('Title and date are required.');
      return;
    }
    const payload = {
      title: form.title,
      description: form.description || undefined,
      agenda: form.agenda || undefined,
      location: form.location || undefined,
      meeting_date: new Date(form.meeting_date).toISOString(),
      duration_minutes: parseInt(form.duration_minutes, 10) || 60,
      meeting_type: form.meeting_type,
      attendee_ids: form.attendee_ids,
    };
    if (editingMeeting) {
      updateMutation.mutate({ id: editingMeeting.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleAttendee(uid: number) {
    setForm((prev) => ({
      ...prev,
      attendee_ids: prev.attendee_ids.includes(uid)
        ? prev.attendee_ids.filter((id) => id !== uid)
        : [...prev.attendee_ids, uid],
    }));
  }

  const meetings = meetingsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const upcomingCount = meetings.filter((m) => m.status === 'SCHEDULED').length;
  const completedCount = meetings.filter((m) => m.status === 'COMPLETED').length;
  const todayCount = meetings.filter((m) => {
    const d = new Date(m.meeting_date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Meeting Management
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#1E293B]">
              Schedule &amp; manage meetings
            </h1>
            <p className="mt-2 text-sm text-[#5B6E8C]">
              Create meetings, invite attendees, and track status from one place.
            </p>
          </div>
          <Button onClick={openCreate}>+ Schedule meeting</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Upcoming', value: upcomingCount, tone: 'text-blue-600' },
          { label: 'Today', value: todayCount, tone: 'text-amber-600' },
          { label: 'Completed', value: completedCount, tone: 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-[#EFF2F6] bg-white p-4">
            <p className="text-sm text-[#5B6E8C]">{s.label}</p>
            <p className={`text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mr-2 text-xs font-semibold text-[#5B6E8C]">Status</label>
          <select
            className="rounded-lg border border-[#EFF2F6] bg-white px-3 py-1.5 text-sm"
            onChange={(e) => setStatusFilter(e.target.value)}
            value={statusFilter}
          >
            <option value="ALL">All</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ONGOING">Ongoing</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="mr-2 text-xs font-semibold text-[#5B6E8C]">Type</label>
          <select
            className="rounded-lg border border-[#EFF2F6] bg-white px-3 py-1.5 text-sm"
            onChange={(e) => setTypeFilter(e.target.value)}
            value={typeFilter}
          >
            <option value="ALL">All</option>
            <option value="GENERAL">General</option>
            <option value="DEPARTMENTAL">Departmental</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </div>
      </div>

      {/* Meeting list */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">All meetings</h2>
        {meetingsQuery.isLoading ? (
          <p className="text-sm text-[#8A99B0]">Loading...</p>
        ) : meetings.length === 0 ? (
          <p className="text-sm text-[#8A99B0]">No meetings found. Schedule one to get started.</p>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#EFF2F6] bg-[#FAFCFE] px-5 py-4 hover:border-[#C4D8F0] transition"
                onClick={() => setDetailMeeting(m)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#1E293B]">{m.title}</p>
                    <Badge variant={STATUS_COLORS[m.status] ?? 'gray'}>{m.status}</Badge>
                    <span className="rounded-full bg-[#EFF2F6] px-2 py-0.5 text-[11px] text-[#5B6E8C]">
                      {TYPE_LABELS[m.meeting_type] ?? m.meeting_type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#5B6E8C]">
                    📅 {formatDateTime(m.meeting_date)}
                    {m.location ? ` · 📍 ${m.location}` : ''}
                    {` · ⏱ ${m.duration_minutes} min`}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8A99B0]">
                    👥 {m.attendees.length} attendee{m.attendees.length !== 1 ? 's' : ''}
                    {' · '}Scheduled by {m.createdByName}
                  </p>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {m.status === 'SCHEDULED' && (
                    <Button
                      onClick={() => statusMutation.mutate({ id: m.id, status: 'COMPLETED' })}
                      size="sm"
                      variant="ghost"
                    >
                      Mark done
                    </Button>
                  )}
                  <Button onClick={() => openEdit(m)} size="sm" variant="ghost">
                    Edit
                  </Button>
                  <Button
                    onClick={() => {
                      if (window.confirm('Cancel this meeting?')) deleteMutation.mutate(m.id);
                    }}
                    size="sm"
                    variant="danger"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingMeeting(null);
          setForm(emptyForm);
        }}
        title={editingMeeting ? 'Edit Meeting' : 'Schedule New Meeting'}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Meeting title"
              value={form.title}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">
                Date &amp; Time <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                type="datetime-local"
                value={form.meeting_date}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">
                Duration (minutes)
              </label>
              <input
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                min="15"
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                type="number"
                value={form.duration_minutes}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Type</label>
              <select
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, meeting_type: e.target.value })}
                value={form.meeting_type}
              >
                <option value="GENERAL">General</option>
                <option value="DEPARTMENTAL">Departmental</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Location</label>
              <input
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Room / link"
                value={form.location}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Description</label>
            <textarea
              className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description..."
              rows={2}
              value={form.description}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Agenda</label>
            <textarea
              className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
              onChange={(e) => setForm({ ...form, agenda: e.target.value })}
              placeholder="Points to discuss..."
              rows={3}
              value={form.agenda}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">
              Invite Attendees ({form.attendee_ids.length} selected)
            </label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[#EFF2F6] p-2">
              {users.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[#F1F4F9]"
                >
                  <input
                    checked={form.attendee_ids.includes(u.id)}
                    className="rounded"
                    onChange={() => toggleAttendee(u.id)}
                    type="checkbox"
                  />
                  <span className="text-sm text-[#1E293B]">{u.name}</span>
                  <span className="text-xs text-[#8A99B0]">{u.role}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={() => {
                setShowModal(false);
                setEditingMeeting(null);
                setForm(emptyForm);
              }}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              {editingMeeting ? 'Update meeting' : 'Schedule meeting'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      {detailMeeting && (
        <Modal
          isOpen={Boolean(detailMeeting)}
          onClose={() => setDetailMeeting(null)}
          title={detailMeeting.title}
        >
          <div className="space-y-3 text-sm text-[#1E293B]">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_COLORS[detailMeeting.status] ?? 'gray'}>
                {detailMeeting.status}
              </Badge>
              <span className="rounded-full bg-[#EFF2F6] px-2 py-0.5 text-xs text-[#5B6E8C]">
                {TYPE_LABELS[detailMeeting.meeting_type]}
              </span>
            </div>
            <p>
              <span className="font-semibold">Date &amp; Time: </span>
              {formatDateTime(detailMeeting.meeting_date)}
            </p>
            <p>
              <span className="font-semibold">Duration: </span>
              {detailMeeting.duration_minutes} minutes
            </p>
            {detailMeeting.location && (
              <p>
                <span className="font-semibold">Location: </span>
                {detailMeeting.location}
              </p>
            )}
            {detailMeeting.description && (
              <p>
                <span className="font-semibold">Description: </span>
                {detailMeeting.description}
              </p>
            )}
            {detailMeeting.agenda && (
              <div>
                <p className="font-semibold">Agenda:</p>
                <p className="mt-1 whitespace-pre-wrap rounded bg-[#F8F9FC] p-2 text-xs">
                  {detailMeeting.agenda}
                </p>
              </div>
            )}
            {detailMeeting.attendees.length > 0 && (
              <div>
                <p className="font-semibold">Attendees ({detailMeeting.attendees.length}):</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {detailMeeting.attendees.map((a) => (
                    <span
                      key={a.id}
                      className="rounded-full bg-[#E6F1FB] px-2 py-0.5 text-xs text-[#0C447C]"
                    >
                      {a.userName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => { setDetailMeeting(null); openEdit(detailMeeting); }} size="sm" variant="ghost">
                Edit
              </Button>
              <Button onClick={() => setDetailMeeting(null)} size="sm">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
