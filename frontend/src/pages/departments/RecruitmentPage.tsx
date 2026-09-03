import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { getRecruitments, createRecruitment, updateRecruitment, getApplications, updateApplication } from '../../services/recruitmentService';
import type { Recruitment, RecruitmentApplication, CreateRecruitmentPayload } from '../../types/recruitment.types';
import type { RootState } from '../../store';

const RecruitmentPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();
  const isHR = user?.role === 'HR' || user?.role === 'CHAIRMAN';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRecruitment, setEditingRecruitment] = useState<Recruitment | null>(null);
  const [selectedRecruitment, setSelectedRecruitment] = useState<Recruitment | null>(null);
  const [showApplications, setShowApplications] = useState(false);

  const [form, setForm] = useState<CreateRecruitmentPayload>({
    position_title: '',
    vacancies: 1,
    description: '',
    status: 'OPEN',
  });

  const { data: recruitments = [], isLoading } = useQuery({
    queryKey: ['recruitments'],
    queryFn: () => getRecruitments(),
  });

  const { data: applications = [] } = useQuery({
    queryKey: ['applications', selectedRecruitment?.id],
    queryFn: () => selectedRecruitment ? getApplications(selectedRecruitment.id) : Promise.resolve([]),
    enabled: !!selectedRecruitment,
  });

  const createMutation = useMutation({
    mutationFn: createRecruitment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitments'] });
      setShowCreateModal(false);
      resetForm();
      toast.success('Recruitment created');
    },
    onError: () => toast.error('Failed to create recruitment'),
  });

  const updateRecruitmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateRecruitmentPayload> }) =>
      updateRecruitment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitments'] });
      setEditingRecruitment(null);
      resetForm();
      toast.success('Recruitment updated');
    },
    onError: () => toast.error('Failed to update recruitment'),
  });

  const updateApplicationMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { stage?: string; notes?: string } }) =>
      updateApplication(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application updated');
    },
    onError: () => toast.error('Failed to update application'),
  });

  const resetForm = () => {
    setForm({ position_title: '', vacancies: 1, description: '', status: 'OPEN' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.position_title) {
      toast.error('Position title is required');
      return;
    }
    if (editingRecruitment) {
      updateRecruitmentMutation.mutate({ id: editingRecruitment.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (recruitment: Recruitment) => {
    setEditingRecruitment(recruitment);
    setForm({
      position_title: recruitment.position_title,
      vacancies: recruitment.vacancies,
      description: recruitment.description || '',
      status: recruitment.status,
    });
    setShowCreateModal(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Recruitment</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Manage job openings and applications</p>
        </div>
        {isHR && <Button onClick={() => setShowCreateModal(true)}>+ New Vacancy</Button>}
      </div>

      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : recruitments.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No vacancies found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Position', 'Vacancies', 'Status', 'Description', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {recruitments.map((r) => (
                <tr key={r.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">{r.position_title}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{r.vacancies}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'OPEN' ? 'bg-green-100 text-green-700' :
                      r.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#5B6E8C] max-w-[200px] truncate">{r.description || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSelectedRecruitment(r); setShowApplications(true); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View Applications
                      </button>
                      {isHR && (
                        <button
                          onClick={() => handleEdit(r)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
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
        onClose={() => { setShowCreateModal(false); setEditingRecruitment(null); resetForm(); }}
        title={editingRecruitment ? 'Edit Vacancy' : 'New Vacancy'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Position Title *</label>
            <input
              type="text"
              value={form.position_title}
              onChange={(e) => setForm({ ...form, position_title: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Vacancies</label>
              <input
                type="number"
                value={form.vacancies}
                onChange={(e) => setForm({ ...form, vacancies: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
                min="1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              >
                <option value="OPEN">Open</option>
                <option value="SCREENING">Screening</option>
                <option value="INTERVIEW">Interview</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateRecruitmentMutation.isPending}>
              {editingRecruitment ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showApplications}
        onClose={() => { setShowApplications(false); setSelectedRecruitment(null); }}
        title={`Applications: ${selectedRecruitment?.position_title ?? ''}`}
      >
        {applications.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#8A99B0]">No applications yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Applicant', 'Email', 'Stage', 'Applied', 'Action'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">{app.applicant_name}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{app.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      app.stage === 'APPLIED' ? 'bg-gray-100 text-gray-700' :
                      app.stage === 'SHORTLISTED' ? 'bg-blue-100 text-blue-700' :
                      app.stage === 'INTERVIEWED' ? 'bg-amber-100 text-amber-700' :
                      app.stage === 'HIRED' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {app.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8A99B0]">{app.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    {isHR && app.stage !== 'HIRED' && app.stage !== 'REJECTED' && (
                      <select
                        value={app.stage}
                        onChange={(e) => updateApplicationMutation.mutate({
                          id: app.id,
                          data: { stage: e.target.value as any }
                        })}
                        className="text-xs rounded border border-[#E4EAF2] px-2 py-1"
                      >
                        <option value="APPLIED">Applied</option>
                        <option value="SHORTLISTED">Shortlisted</option>
                        <option value="INTERVIEWED">Interviewed</option>
                        <option value="HIRED">Hired</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
};

export default RecruitmentPage;