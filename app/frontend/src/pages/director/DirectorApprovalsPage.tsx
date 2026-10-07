import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getAllApprovals, approveApproval, rejectApproval } from '../../services/approvalService';
import { APPROVAL_TYPE_META } from '../../types/approval.types';
import type { ApprovalStatus } from '../../types/approval.types';

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const DirectorApprovalsPage: React.FC = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ApprovalStatus | 'ALL'>('ALL');

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['director-approvals', filter],
    queryFn: () => getAllApprovals(filter === 'ALL' ? undefined : filter),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveApproval(id),
    onSuccess: () => {
      toast.success('Approved');
      void qc.invalidateQueries({ queryKey: ['director-approvals'] });
    },
    onError: () => toast.error('Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectApproval(id),
    onSuccess: () => {
      toast.success('Rejected');
      void qc.invalidateQueries({ queryKey: ['director-approvals'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1E293B]">Approvals</h1>
        <p className="text-sm text-[#5B6E8C] mt-1">Review and action all approval requests</p>
      </div>

      {/* Stats row */}
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

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border border-[#EFF2F6] bg-white p-1 w-fit">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              filter === t ? 'bg-[#185FA5] text-white' : 'text-[#5B6E8C] hover:bg-[#F1F4F9]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Requested By', 'Title', 'Type', 'Amount', 'Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {approvals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[#8A99B0]">
                    No approvals found.
                  </td>
                </tr>
              ) : approvals.map((a) => {
                const meta = APPROVAL_TYPE_META[a.type];
                return (
                  <tr key={a.id} className="hover:bg-[#F8F9FC] transition">
                    <td className="px-4 py-3 font-medium text-[#1E293B]">
                      {a.requestedBy?.name ?? '—'}
                      {a.requestedBy?.role && (
                        <div className="text-xs text-[#8A99B0]">{a.requestedBy.role}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#1E293B]">{a.title}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta?.bg ?? 'bg-gray-100 text-gray-600'}`}>
                        {meta?.label ?? a.type}
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
                    <td className="px-4 py-3">
                      {a.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMutation.mutate(a.id)}
                            disabled={approveMutation.isPending}
                            className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(a.id)}
                            disabled={rejectMutation.isPending}
                            className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DirectorApprovalsPage;
