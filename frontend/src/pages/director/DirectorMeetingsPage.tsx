import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { getMeetings, createMeeting, updateMeeting, deleteMeeting, getUpcomingMeetings } from '../../services/meetingService';
import type { Meeting, CreateMeetingPayload, MeetingStatus } from '../../types/meeting.types';
import type { RootState } from '../../store';

const STATUS_COLOR: Record<MeetingStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  ONGOING:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const DirectorMeetingsPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [filterStatus, setFilterStatus] = useState<MeetingStatus | 'ALL'>('ALL');

  const [form, setForm] = useState<CreateMeetingPayload>({
    title: '',
    description: '',
    meeting_date: '',
    duration_minutes: 60,
    location: '',
    meeting_type: 'GENERAL',
    attendee_ids: [],
  });

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['director-meetings', filterStatus],
    queryFn: () => getMeetings(filterStatus === 'ALL' ? undefined : filterStatus),
  });

  const createMutation = useMutation({
    mutationFn: createMeeting,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-meetings'] });
      setShowCreateModal(false);
      resetForm();
      toast.success('Meeting scheduled');
    },
    onError: () => toast.error('Failed to create meeting'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateMeetingPayload> }) =>
      updateMeeting(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-meetings'] });
      setEditingMeeting(null);
      resetForm();
      toast.success('Meeting updated');
    },
    onError: () => toast.error('Failed to update meeting'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMeeting,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-meetings'] });
      toast.success('Meeting cancelled');
    },
    onError: () => toast.error('Failed to cancel meeting'),
  });

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      meeting_date: '',
      duration_minutes: 60,
      location: '',
      meeting_type: 'GENERAL',
      attendee_ids: [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.meeting_date) {
      toast.error('Title and date are required');
      return;
    }
    if (editingMeeting) {
      updateMutation.mutate({ id: editingMeeting.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setForm({
      title: meeting.title,
      description: meeting.description || '',
      meeting_date: meeting.meeting_date.slice(0, 16).replace('T', ' '),
      duration_minutes: meeting.duration_minutes,
      location: meeting.location || '',
      meeting_type: meeting.meeting_type,
      attendee_ids: meeting.attendees?.map((a) => a.id) || [],
    });
    setShowCreateModal(true);
  };

  const handleCancel = (id: number) => {
    if (confirm('Are you sure you want to cancel this meeting?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Meetings</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Schedule and manage school meetings</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ Schedule Meeting</Button>
      </div>

      <div className="flex gap-1 rounded-xl border border-[#EFF2F6] bg-white p-1 w-fit">
        {(['ALL', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              filterStatus === s ? 'bg-[#185FA5] text-white' : 'text-[#5B6E8C] hover:bg-[#F1F4F9]'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : meetings.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No meetings found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Title', 'Date', 'Duration', 'Type', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {meetings.map((m) => (
                <tr key={m.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">{m.title}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">
                    {new Date(m.meeting_date).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{m.duration_minutes} min</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{m.meeting_type}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(m)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {m.status === 'SCHEDULED' && (
                        <button
                          onClick={() => handleCancel(m.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingMeeting(null);
          resetForm();
        }}
        title={editingMeeting ? 'Edit Meeting' : 'Schedule New Meeting'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Date & Time *</label>
              <input
                type="datetime-local"
                value={form.meeting_date}
                onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Duration (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                min="15"
                step="15"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Type</label>
            <select
              value={form.meeting_type}
              onChange={(e) => setForm({ ...form, meeting_type: e.target.value as 'GENERAL' | 'DEPARTMENTAL' | 'EMERGENCY' })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            >
              <option value="GENERAL">General</option>
              <option value="DEPARTMENTAL">Departmental</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editingMeeting ? 'Update' : 'Schedule'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DirectorMeetingsPage;