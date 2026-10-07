import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import type { RootState } from '../../store';
import type { ApprovalType, ApprovalStatus } from '../../types/approval.types';
import { APPROVAL_TYPE_META } from '../../types/approval.types';
import { getAllApprovals, createApprovalRequest } from '../../services/approvalService';

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const TYPE_OPTIONS = Object.entries(APPROVAL_TYPE_META).map(([value, meta]) => ({
  value: value as ApprovalType,
  label: meta.label,
}));

const DeptApprovalsPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: 'BUDGET' as ApprovalType,
    title: '',
    details: '',
    amount: '',
  });

  const { data: allApprovals = [], isLoading } = useQuery({
    queryKey: ['my-approvals'],
    queryFn: () => getAllApprovals(),
  });

  // Non-privileged users only see their own requests
  const approvals =
    user?.role === 'CHAIRMAN' || user?.role === 'DIRECTOR'
      ? allApprovals
      : allApprovals.filter((a) => a.requestedBy?.id === user?.id);

  const createMutation = useMutation({
    mutationFn: () =>
      createApprovalRequest({
        type: form.type,
        title: form.title,
        details: form.details || undefined,
        amount: form.amount ? parseFloat(form.amount) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-approvals'] });
      setShowModal(false);
      setForm({ type: 'BUDGET', title: '', details: '', amount: '' });
      toast.success('Approval request submitted');
    },
    onError: () => toast.error('Failed to submit request'),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Approval Requests</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Submit and track your approval requests</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ New Request</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <div key={s} className="rounded-xl border border-[#EFF2F6] bg-white p-4">
            <p className="text-xs text-[#8A99B0]">{s}</p>
            <p className={`text-2xl font-bold mt-1 ${STATUS_COLOR[s].split(' ')[1]}`}>
              {approvals.filter((a) => a.status === s).length}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Title', 'Type', 'Amount', 'Status', 'Submitted', 'Approved By'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {approvals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-[#8A99B0]">
                    No approval requests yet.
                  </td>
                </tr>
              ) : approvals.map((a) => {
                const typeMeta = APPROVAL_TYPE_META[a.type];
                return (
                  <tr key={a.id} className="hover:bg-[#F8F9FC] transition">
                    <td className="px-4 py-3 font-medium text-[#1E293B]">{a.title}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeMeta?.bg ?? 'bg-gray-100 text-gray-600'}`}>
                        {typeMeta?.label ?? a.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5B6E8C]">
                      {a.amount != null ? `₦${Number(a.amount).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[a.status]}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#8A99B0]">{a.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{a.approvedBy?.name ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* New Request Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Approval Request">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Request Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ApprovalType }))}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              placeholder="Brief description of the request"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Details</label>
            <textarea
              value={form.details}
              onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              placeholder="Additional details…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Amount — if applicable</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              placeholder="0.00"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              onClick={() => form.title && createMutation.mutate()}
            >
              Submit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DeptApprovalsPage;
