import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Button from '../../components/common/Button';
import { getAllApprovals, approveApproval, rejectApproval } from '../../services/approvalService';
import { APPROVAL_TYPE_META } from '../../types/approval.types';
import type { Approval, ApprovalStatus } from '../../types/approval.types';

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function ApprovalManagement() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const queryClient = useQueryClient();

  const approvalsQuery = useQuery({
    queryKey: ['approvals'],
    queryFn: () => getAllApprovals()
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveApproval(id),
    onSuccess: async () => {
      toast.success('Approval granted successfully.');
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to approve request.')
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectApproval(id),
    onSuccess: async () => {
      toast.success('Approval rejected.');
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to reject request.')
  });

  const allApprovals = approvalsQuery.data ?? [];

  const filteredApprovals =
    activeTab === 'ALL'
      ? allApprovals
      : allApprovals.filter((approval) => approval.status === activeTab);

  // Accurate counts derived directly from data
  const counts = {
    total:    allApprovals.length,
    pending:  allApprovals.filter((a) => a.status === 'PENDING').length,
    approved: allApprovals.filter((a) => a.status === 'APPROVED').length,
    rejected: allApprovals.filter((a) => a.status === 'REJECTED').length,
  };

  // Per-type pending counts
  const perTypeCounts: Record<string, number> = {};
  for (const key of Object.keys(APPROVAL_TYPE_META) as Approval['type'][]) {
    perTypeCounts[key] = allApprovals.filter(
      (a) => a.type === key && a.status === 'PENDING'
    ).length;
  }

  const formatAmount = (amount?: string | number) => {
    if (amount == null) return '—';
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-IN');

  return (
    <div className="space-y-6 p-6">
      {/* ── Approval type summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Object.entries(APPROVAL_TYPE_META).map(([key, meta]) => {
          const k = key as Approval['type'];
          const pendingCount = perTypeCounts[k] ?? 0;
          const textColor = meta.bg.split(' ').find((c: string) => c.startsWith('text-'));
          return (
            <div key={k} className="rounded-[20px] border border-[#EFF2F6] bg-white p-4 text-center">
              <div className={`text-2xl font-bold ${textColor}`}>{pendingCount}</div>
              <div className="text-xs text-[#5B6E8C] mt-1">{meta.label}</div>
              <div className="text-[10px] text-[#A2AEC1] mt-0.5 uppercase tracking-wide">pending</div>
            </div>
          );
        })}
      </div>

      {/* ── Approval requests list ── */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">Approval Requests</h2>
        <div className="mb-6 flex flex-wrap gap-3">
          {[
            { key: 'ALL',      label: 'All',      count: counts.total },
            { key: 'PENDING',  label: 'Pending',  count: counts.pending },
            { key: 'APPROVED', label: 'Approved', count: counts.approved },
            { key: 'REJECTED', label: 'Rejected', count: counts.rejected }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-[#185FA5] text-white'
                  : 'bg-[#F3F6FA] text-[#5B6E8C] hover:bg-[#E7EDF4]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {approvalsQuery.isLoading ? (
            <div className="py-8 text-center text-[#8A99B0]">Loading approvals…</div>
          ) : filteredApprovals.length === 0 ? (
            <div className="py-8 text-center text-[#5B6E8C]">
              No {activeTab === 'ALL' ? '' : activeTab.toLowerCase()} approvals found.
            </div>
          ) : (
            filteredApprovals.map((approval: Approval) => (
              <div
                key={approval.id}
                className="flex flex-col gap-4 rounded-lg border border-[#EFF2F6] p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${APPROVAL_TYPE_META[approval.type]?.bg ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {(approval.requestedBy?.name
                      ?.split(' ')
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#1E293B]">{approval.title}</div>
                    <div className="text-sm text-[#5B6E8C]">
                      {approval.requestedBy?.name} · {formatAmount(approval.amount)} ·{' '}
                      {APPROVAL_TYPE_META[approval.type]?.label ?? approval.type}
                    </div>
                    {approval.details ? (
                      <div className="mt-1 text-sm text-[#5B6E8C]">{approval.details}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-[#8A99B0]">
                      Submitted: {formatDate(approval.created_at)}
                    </div>
                  </div>
                </div>

                {approval.status === 'PENDING' ? (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => approveMutation.mutate(approval.id)}
                      disabled={approveMutation.isPending}
                      className="!bg-green-500 !text-white hover:!bg-green-600"
                    >
                      {approveMutation.isPending ? 'Approving…' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => rejectMutation.mutate(approval.id)}
                      disabled={rejectMutation.isPending}
                    >
                      {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                    </Button>
                  </div>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[approval.status]}`}
                  >
                    {approval.status}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ApprovalManagement;
