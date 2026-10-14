import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Button from '../../components/common/Button';
import ConfirmDeleteDialog from '../../components/common/ConfirmDeleteDialog';
import DeleteButton from '../../components/common/DeleteButton';
import {
  getAllApprovals,
  approveApproval,
  rejectApproval,
  deleteApproval
} from '../../services/approvalService';
import { getApiErrorMessage, isNotFoundError } from '../../utils/apiError';
import { APPROVAL_TYPE_META } from '../../types/approval.types';
import type { Approval, ApprovalStatus } from '../../types/approval.types';

import PageContainer from '../../components/common/PageContainer';
const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function ApprovalManagement() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [deleteTarget, setDeleteTarget] = useState<Approval | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const removeFromList = (id: number) =>
    queryClient.setQueryData<Approval[]>(['approvals'], (old) =>
      old ? old.filter((item) => item.id !== id) : old
    );

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteApproval(id),
    onSuccess: (_data, id) => {
      // Drop the row immediately (counts and tabs derive from the list), then re-sync.
      removeFromList(id);
      setDeleteTarget(null);
      setDeleteError(null);
      toast.success('Approval request deleted.');
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['director-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['chairman-dashboard'] });
    },
    onError: (err, id) => {
      if (isNotFoundError(err)) {
        // Already deleted elsewhere: it should not stay in the list.
        removeFromList(id);
        setDeleteTarget(null);
        setDeleteError(null);
        toast.success('Approval request was already deleted.');
        return;
      }
      const errorMessage = getApiErrorMessage(err, 'Failed to delete approval request. Please try again.');
      setDeleteError(errorMessage);
      toast.error(errorMessage);
    }
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

  // Per-type counts. The big number is EVERY request of that type (so one
  // approved Purchase Order shows 1, not 0); the line under it says how many
  // of them are still pending.
  const perTypeCounts: Record<string, { total: number; pending: number }> = {};
  for (const key of Object.keys(APPROVAL_TYPE_META) as Approval['type'][]) {
    const ofType = allApprovals.filter((a) => a.type === key);
    perTypeCounts[key] = {
      total: ofType.length,
      pending: ofType.filter((a) => a.status === 'PENDING').length,
    };
  }

  const formatAmount = (amount?: string | number) => {
    if (amount == null) return '—';
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-IN');

  return (
    <PageContainer className="space-y-6">
      {/* ── Approval type summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {Object.entries(APPROVAL_TYPE_META).map(([key, meta]) => {
          const k = key as Approval['type'];
          const { total, pending } = perTypeCounts[k] ?? { total: 0, pending: 0 };
          const textColor = meta.bg.split(' ').find((c: string) => c.startsWith('text-'));
          return (
            <div key={k} className="rounded-[20px] border border-[#EFF2F6] bg-white p-4 text-center">
              <div className={`text-2xl font-bold ${textColor}`}>{total}</div>
              <div className="text-xs text-[#5B6E8C] mt-1">{meta.label}</div>
              <div className="text-[10px] text-[#A2AEC1] mt-0.5 uppercase tracking-wide">{pending} pending</div>
            </div>
          );
        })}
      </div>

      {/* ── Approval requests list ── */}
      <div className="min-w-0 rounded-[20px] border border-[#EFF2F6] bg-white p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">Approval Requests</h2>
        <div className="-mx-1 mb-6 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {[
            { key: 'ALL',      label: 'All',      count: counts.total },
            { key: 'PENDING',  label: 'Pending',  count: counts.pending },
            { key: 'APPROVED', label: 'Approved', count: counts.approved },
            { key: 'REJECTED', label: 'Rejected', count: counts.rejected }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
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
                <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
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
                    <div className="break-words font-medium text-[#1E293B]">{approval.title}</div>
                    <div className="break-words text-sm text-[#5B6E8C]">
                      {approval.requestedBy?.name} · {formatAmount(approval.amount)} ·{' '}
                      {APPROVAL_TYPE_META[approval.type]?.label ?? approval.type}
                    </div>
                    {approval.details ? (
                      <div className="mt-1 break-words text-sm text-[#5B6E8C]">{approval.details}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-[#8A99B0]">
                      Submitted: {formatDate(approval.created_at)}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto lg:shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
                  {approval.status === 'PENDING' ? (
                    <>
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
                    </>
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[approval.status]}`}
                    >
                      {approval.status}
                    </span>
                  )}
                  <DeleteButton
                    label="Delete approval request"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(approval);
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        errorMessage={deleteError}
        isDeleting={deleteMutation.isPending}
        isOpen={deleteTarget !== null}
        itemLabel={deleteTarget ? `“${deleteTarget.title}” (${deleteTarget.status.toLowerCase()})` : null}
        itemName="approval request"
        note={
          deleteTarget?.status === 'PENDING'
            ? 'This request is still pending; deleting it removes it from the approval queue and the dashboard.'
            : undefined
        }
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Approval Request"
      />
    </PageContainer>
  );
}

export default ApprovalManagement;
