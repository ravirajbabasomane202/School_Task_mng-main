import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import type { RootState } from '../../store';
import type { LeaveType, LeaveStatus } from '../../types/leave.types';
import {
  getLeaveRequests,
  createLeaveRequest,
  processLeaveRequest,
  getResumptionRequests,
  createResumptionRequest,
  processResumptionRequest,
} from '../../services/leaveService';

const STATUS_COLOR: Record<LeaveStatus, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}>
      {status}
    </span>
  );
}

const LeaveRequestsPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();
  const isReviewer = user?.role === 'HR' || user?.role === 'CHAIRMAN' || user?.role === 'DIRECTOR';

  const [tab, setTab] = useState<'leave' | 'resumption'>('leave');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showResumptionModal, setShowResumptionModal] = useState(false);
  const [reviewModal, setReviewModal] = useState<{ type: 'leave' | 'resumption'; id: number } | null>(null);

  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'SICK' as LeaveType,
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [resumptionForm, setResumptionForm] = useState({ resumption_date: '', notes: '' });
  const [reviewStatus, setReviewStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewComment, setReviewComment] = useState('');

  const leaveQuery = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => getLeaveRequests(),
  });

  const resumptionQuery = useQuery({
    queryKey: ['resumption-requests'],
    queryFn: () => getResumptionRequests(),
  });

  const createLeaveMutation = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      setShowLeaveModal(false);
      setLeaveForm({ leave_type: 'SICK', start_date: '', end_date: '', reason: '' });
      toast.success('Leave request submitted');
    },
    onError: () => toast.error('Failed to submit leave request'),
  });

  const createResumptionMutation = useMutation({
    mutationFn: createResumptionRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumption-requests'] });
      setShowResumptionModal(false);
      setResumptionForm({ resumption_date: '', notes: '' });
      toast.success('Resumption request submitted');
    },
    onError: () => toast.error('Failed to submit resumption request'),
  });

  const processLeaveMutation = useMutation({
    mutationFn: ({ id, status, comment }: { id: number; status: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      processLeaveRequest(id, { status, comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      setReviewModal(null);
      toast.success('Leave request updated');
    },
    onError: () => toast.error('Failed to update leave request'),
  });

  const processResumptionMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) =>
      processResumptionRequest(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumption-requests'] });
      setReviewModal(null);
      toast.success('Resumption request updated');
    },
    onError: () => toast.error('Failed to update resumption request'),
  });

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.start_date || !leaveForm.end_date) {
      toast.error('Start and end dates are required');
      return;
    }
    createLeaveMutation.mutate(leaveForm);
  };

  const handleReview = () => {
    if (!reviewModal) return;
    if (reviewModal.type === 'leave') {
      processLeaveMutation.mutate({ id: reviewModal.id, status: reviewStatus, comment: reviewComment });
    } else {
      processResumptionMutation.mutate({ id: reviewModal.id, status: reviewStatus });
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Leave Management</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Manage leave and resumption requests</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowLeaveModal(true)}>+ Leave Request</Button>
          <Button variant="ghost" onClick={() => setShowResumptionModal(true)}>+ Resumption</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[#EFF2F6] bg-white p-1 w-fit">
        {(['leave', 'resumption'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-[#185FA5] text-white' : 'text-[#5B6E8C] hover:bg-[#F1F4F9]'
            }`}
          >
            {t === 'leave' ? 'Leave Requests' : 'Resumption Requests'}
          </button>
        ))}
      </div>

      {/* Leave Table */}
      {tab === 'leave' && (
        <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
          {leaveQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
                <tr>
                  {isReviewer && <th className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">Employee</th>}
                  {['Type', 'Start', 'End', 'Reason', 'Status', 'Applied', ...(isReviewer ? ['Action'] : [])].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F9]">
                {(leaveQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-[#8A99B0]">
                      No leave requests found.
                    </td>
                  </tr>
                ) : (leaveQuery.data ?? []).map((lr) => (
                  <tr key={lr.id} className="hover:bg-[#F8F9FC] transition">
                    {isReviewer && (
                      <td className="px-4 py-3 font-medium text-[#1E293B]">
                        {lr.applicant?.name ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {lr.leave_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{lr.start_date}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{lr.end_date}</td>
                    <td className="px-4 py-3 text-[#5B6E8C] max-w-[160px] truncate">{lr.reason ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={lr.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#8A99B0]">{lr.created_at.slice(0, 10)}</td>
                    {isReviewer && (
                      <td className="px-4 py-3">
                        {lr.status === 'PENDING' && (
                          <button
                            onClick={() => {
                              setReviewModal({ type: 'leave', id: lr.id });
                              setReviewStatus('APPROVED');
                              setReviewComment('');
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Review
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Resumption Table */}
      {tab === 'resumption' && (
        <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
          {resumptionQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
                <tr>
                  {isReviewer && <th className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">Employee</th>}
                  {['Resumption Date', 'Notes', 'Status', 'Submitted', ...(isReviewer ? ['Action'] : [])].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F9]">
                {(resumptionQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-[#8A99B0]">
                      No resumption requests found.
                    </td>
                  </tr>
                ) : (resumptionQuery.data ?? []).map((rr) => (
                  <tr key={rr.id} className="hover:bg-[#F8F9FC] transition">
                    {isReviewer && (
                      <td className="px-4 py-3 font-medium text-[#1E293B]">
                        {rr.applicant?.name ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-[#5B6E8C]">{rr.resumption_date}</td>
                    <td className="px-4 py-3 text-[#5B6E8C] max-w-[180px] truncate">{rr.notes ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={rr.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#8A99B0]">{rr.created_at.slice(0, 10)}</td>
                    {isReviewer && (
                      <td className="px-4 py-3">
                        {rr.status === 'PENDING' && (
                          <button
                            onClick={() => {
                              setReviewModal({ type: 'resumption', id: rr.id });
                              setReviewStatus('APPROVED');
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Review
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Leave Modal */}
      <Modal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Submit Leave Request">
        <form onSubmit={handleSubmitLeave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Leave Type</label>
            <select
              value={leaveForm.leave_type}
              onChange={(e) => setLeaveForm((f) => ({ ...f, leave_type: e.target.value as LeaveType }))}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            >
              <option value="SICK">Sick Leave</option>
              <option value="CASUAL">Casual Leave</option>
              <option value="ANNUAL">Annual Leave</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={leaveForm.start_date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">End Date *</label>
              <input
                type="date"
                required
                value={leaveForm.end_date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Reason (optional)</label>
            <textarea
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Provide reason…"
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" type="button" onClick={() => setShowLeaveModal(false)}>Cancel</Button>
            <Button type="submit" loading={createLeaveMutation.isPending}>Submit</Button>
          </div>
        </form>
      </Modal>

      {/* Create Resumption Modal */}
      <Modal isOpen={showResumptionModal} onClose={() => setShowResumptionModal(false)} title="Submit Resumption Request">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Resumption Date *</label>
            <input
              type="date"
              value={resumptionForm.resumption_date}
              onChange={(e) => setResumptionForm((f) => ({ ...f, resumption_date: e.target.value }))}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Notes (optional)</label>
            <textarea
              value={resumptionForm.notes}
              onChange={(e) => setResumptionForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setShowResumptionModal(false)}>Cancel</Button>
            <Button
              loading={createResumptionMutation.isPending}
              onClick={() =>
                resumptionForm.resumption_date && createResumptionMutation.mutate(resumptionForm)
              }
            >
              Submit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal isOpen={Boolean(reviewModal)} onClose={() => setReviewModal(null)} title="Review Request">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-2">Decision</label>
            <div className="flex gap-4">
              {(['APPROVED', 'REJECTED'] as const).map((d) => (
                <label key={d} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decision"
                    checked={reviewStatus === d}
                    onChange={() => setReviewStatus(d)}
                  />
                  <span className={`text-sm font-medium ${d === 'APPROVED' ? 'text-green-700' : 'text-red-600'}`}>
                    {d}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {reviewModal?.type === 'leave' && (
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Comment (optional)</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setReviewModal(null)}>Cancel</Button>
            <Button
              loading={processLeaveMutation.isPending || processResumptionMutation.isPending}
              variant={reviewStatus === 'APPROVED' ? 'primary' : 'danger'}
              onClick={handleReview}
            >
              Confirm {reviewStatus}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LeaveRequestsPage;
