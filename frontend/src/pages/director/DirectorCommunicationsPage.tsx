import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../services/announcementService';
import type { Announcement, CreateAnnouncementPayload } from '../../types/notification.types';

const DirectorCommunicationsPage: React.FC = () => {
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [filterTarget, setFilterTarget] = useState<'ALL' | 'DEPARTMENT' | 'SCHOOL'>('ALL');

  const [form, setForm] = useState<CreateAnnouncementPayload>({
    message: '',
    target: 'SCHOOL',
    department_id: null,
  });

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['director-announcements', filterTarget],
    queryFn: () => getAnnouncements(filterTarget === 'ALL' ? undefined : filterTarget.toLowerCase()),
  });

  const createMutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-announcements'] });
      setShowCreateModal(false);
      resetForm();
      toast.success('Announcement created');
    },
    onError: () => toast.error('Failed to create announcement'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAnnouncementPayload> }) =>
      updateAnnouncement(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-announcements'] });
      setEditingAnnouncement(null);
      resetForm();
      toast.success('Announcement updated');
    },
    onError: () => toast.error('Failed to update announcement'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-announcements'] });
      toast.success('Announcement deleted');
    },
    onError: () => toast.error('Failed to delete announcement'),
  });

  const resetForm = () => {
    setForm({ message: '', target: 'SCHOOL', department_id: null });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message) {
      toast.error('Message is required');
      return;
    }
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setForm({
      message: announcement.message,
      target: announcement.target,
      department_id: announcement.department_id,
    });
    setShowCreateModal(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Communications</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Manage school announcements and communications</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ New Announcement</Button>
      </div>

      <div className="flex gap-1 rounded-xl border border-[#EFF2F6] bg-white p-1 w-fit">
        {(['ALL', 'SCHOOL', 'DEPARTMENT'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterTarget(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              filterTarget === t ? 'bg-[#185FA5] text-white' : 'text-[#5B6E8C] hover:bg-[#F1F4F9]'
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : announcements.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No announcements found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Message', 'Target', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {announcements.map((a) => (
                <tr key={a.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 text-[#1E293B] max-w-[400px] truncate">{a.message}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">
                    {a.target === 'ALL' ? 'All Staff' : a.target === 'DEPARTMENT' ? 'Dept Only' : 'School'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8A99B0]">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(a)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(a.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
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
          setEditingAnnouncement(null);
          resetForm();
        }}
        title={editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              placeholder="Enter announcement message..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Target Audience</label>
            <select
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value as 'ALL' | 'DEPARTMENT' | 'SCHOOL' })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            >
              <option value="SCHOOL">All Staff</option>
              <option value="DEPARTMENT">Specific Department</option>
              <option value="ALL">Everyone</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Department (optional)</label>
            <input
              type="number"
              value={form.department_id ?? ''}
              onChange={(e) => setForm({ ...form, department_id: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              placeholder="Department ID (for DEPARTMENT target)"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editingAnnouncement ? 'Update' : 'Publish'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DirectorCommunicationsPage;