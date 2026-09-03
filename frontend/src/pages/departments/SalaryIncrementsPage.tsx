import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import type { RootState } from '../../store';
import type { SalaryIncrement, SalaryStatus } from '../../types/salary.types';
import {
  getSalaryIncrements,
  createSalaryIncrement,
  hrApproveSalaryIncrement,
  financeProcessSalaryIncrement,
} from '../../services/salaryService';

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SalaryStatus, string> = {
  PENDING_HR: 'Pending HR',
  PENDING_FINANCE: 'Pending Finance',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const STATUS_COLOR: Record<SalaryStatus, string> = {
  PENDING_HR: 'bg-amber-100 text-amber-700',
  PENDING_FINANCE: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: SalaryStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
}

// ── Component ──────────────────────────────────────────────────────────────

const SalaryIncrementsPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();

  const isHR = user?.role === 'HR' || user?.role === 'CHAIRMAN';
  const isFinance = user?.role === 'FINANCE' || user?.role === 'CHAIRMAN';

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [reviewItem, setReviewItem] = useState<SalaryIncrement | null>(null);
  const [filterStatus, setFilterStatus] = useState<SalaryStatus | ''>('');

  // Create form
  const [form, setForm] = useState({
    employee_id: '',
    current_salary: '',
    proposed_salary: '',
    reason: '',
  });

  // Finance review form
  const [financeDecision, setFinanceDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [financeComment, setFinanceComment] = useState('');

  const { data: increments = [], isLoading } = useQuery({
    queryKey: ['salary-increments', filterStatus],
    queryFn: () => getSalaryIncrements(filterStatus as SalaryStatus || undefined),
  });

  const createMutation = useMutation({
    mutationFn: createSalaryIncrement,
    onSuccess: () => {
      toast.success('Salary increment request created');
      qc.invalidateQueries({ queryKey: ['salary-increments'] });
      setShowCreate(false);
      setForm({ employee_id: '', current_salary: '', proposed_salary: '', reason: '' });
    },
    onError: () => toast.error('Failed to create request'),
  });

  const hrApproveMutation = useMutation({
    mutationFn: (id: number) => hrApproveSalaryIncrement(id),
    onSuccess: () => {
      toast.success('Forwarded to Finance for approval');
      qc.invalidateQueries({ queryKey: ['salary-increments'] });
      setReviewItem(null);
    },
    onError: () => toast.error('HR approval failed'),
  });

  const financeMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) =>
      financeProcessSalaryIncrement(id, { status, comment: financeComment }),
    onSuccess: (_, vars) => {
      toast.success(`Salary increment ${vars.status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ['salary-increments'] });
      setReviewItem(null);
      setFinanceComment('');
    },
    onError: () => toast.error('Finance decision failed'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const employee_id = parseInt(form.employee_id);
    const current_salary = parseFloat(form.current_salary);
    const proposed_salary = parseFloat(form.proposed_salary);
    if (!employee_id || !current_salary || !proposed_salary) {
      toast.error('Please fill all required fields');
      return;
    }
    if (proposed_salary <= current_salary) {
      toast.error('Proposed salary must be higher than current salary');
      return;
    }
    createMutation.mutate({ employee_id, current_salary, proposed_salary, reason: form.reason });
  };

  const incrementPct = (curr: number, prop: number) =>
    curr > 0 ? (((prop - curr) / curr) * 100).toFixed(1) : '—';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Salary Increments</h1>
          <p className="text-sm text-[#8A99B0]">Manage and track employee salary increment requests</p>
        </div>
        {isHR && (
          <Button onClick={() => setShowCreate(true)}>+ New Increment</Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex gap-2">
        {(['', 'PENDING_HR', 'PENDING_FINANCE', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filterStatus === s
                ? 'bg-[#185FA5] text-white'
                : 'bg-white text-[#5B6E8C] border border-[#E4EAF2] hover:border-[#185FA5]'
            }`}
          >
            {s === '' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : increments.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8A99B0]">No salary increment records found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Employee', 'Current Salary', 'Proposed Salary', 'Increment', 'Reason', 'Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {increments.map((inc) => (
                <tr key={inc.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">
                    {inc.employee?.name ?? `#${inc.employee_id}`}
                    {inc.employee?.role && (
                      <div className="text-xs text-[#8A99B0]">{inc.employee.role}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{fmt(inc.current_salary)}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{fmt(inc.proposed_salary)}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">
                    +{incrementPct(inc.current_salary, inc.proposed_salary)}%
                  </td>
                  <td className="px-4 py-3 text-[#5B6E8C] max-w-[180px] truncate">
                    {inc.reason ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="px-4 py-3 text-[#8A99B0] text-xs">
                    {new Date(inc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {isHR && inc.status === 'PENDING_HR' && (
                        <button
                          onClick={() => hrApproveMutation.mutate(inc.id)}
                          disabled={hrApproveMutation.isPending}
                          className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          HR Approve
                        </button>
                      )}
                      {isFinance && inc.status === 'PENDING_FINANCE' && (
                        <button
                          onClick={() => setReviewItem(inc)}
                          className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                        >
                          Finance Review
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

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Salary Increment Request">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Employee ID *</label>
            <input
              type="number"
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              placeholder="Enter employee ID"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Current Salary *</label>
              <input
                type="number"
                value={form.current_salary}
                onChange={(e) => setForm({ ...form, current_salary: e.target.value })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                placeholder="0.00"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Proposed Salary *</label>
              <input
                type="number"
                value={form.proposed_salary}
                onChange={(e) => setForm({ ...form, proposed_salary: e.target.value })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                placeholder="0.00"
                min="0"
                required
              />
            </div>
          </div>
          {form.current_salary && form.proposed_salary && (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Increment: +{incrementPct(parseFloat(form.current_salary), parseFloat(form.proposed_salary))}%
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Reason / Justification</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              rows={3}
              placeholder="Briefly explain the basis for this increment…"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)} type="button">Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Finance Review Modal */}
      <Modal
        isOpen={!!reviewItem}
        onClose={() => { setReviewItem(null); setFinanceComment(''); }}
        title="Finance Review – Salary Increment"
      >
        {reviewItem && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#EFF2F6] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#8A99B0]">Employee</span>
                <span className="font-medium">{reviewItem.employee?.name ?? `#${reviewItem.employee_id}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8A99B0]">Current Salary</span>
                <span>{fmt(reviewItem.current_salary)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8A99B0]">Proposed Salary</span>
                <span className="font-medium text-green-700">{fmt(reviewItem.proposed_salary)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8A99B0]">Increment</span>
                <span className="text-green-600 font-medium">
                  +{incrementPct(reviewItem.current_salary, reviewItem.proposed_salary)}%
                </span>
              </div>
              {reviewItem.reason && (
                <div className="pt-1 border-t border-[#EFF2F6]">
                  <p className="text-[#8A99B0]">Reason</p>
                  <p className="mt-0.5">{reviewItem.reason}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Decision</label>
              <div className="flex gap-3">
                {(['APPROVED', 'REJECTED'] as const).map((d) => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      checked={financeDecision === d}
                      onChange={() => setFinanceDecision(d)}
                    />
                    <span className={`text-sm font-medium ${d === 'APPROVED' ? 'text-green-700' : 'text-red-600'}`}>
                      {d}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Comment (optional)</label>
              <textarea
                value={financeComment}
                onChange={(e) => setFinanceComment(e.target.value)}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                rows={2}
                placeholder="Add a note for the record…"
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" onClick={() => { setReviewItem(null); setFinanceComment(''); }} type="button">
                Cancel
              </Button>
              <Button
                onClick={() => financeMutation.mutate({ id: reviewItem.id, status: financeDecision })}
                disabled={financeMutation.isPending}
                variant={financeDecision === 'APPROVED' ? 'primary' : 'danger'}
              >
                {financeMutation.isPending ? 'Saving…' : `Confirm ${financeDecision}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SalaryIncrementsPage;
