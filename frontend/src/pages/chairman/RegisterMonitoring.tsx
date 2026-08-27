import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import RegisterCalendarPopup from '../../components/registers/RegisterCalendarPopup';
import RegisterDetailsModal from '../../components/registers/RegisterDetailsModal';
import { formatDate, todayISO } from '../../utils/dateUtils';
import {
  deleteRegister,
  getRegisterHeads,
  getRegisters,
  updateOccurrenceStatus,
  updateRegister,
} from '../../services/registerService';
import {
  REGISTER_CYCLES,
  REGISTER_PRIORITIES,
  REGISTER_STATUSES,
} from '../../types/register.types';
import type {
  Register,
  RegisterCalendarEvent,
  RegisterCycle,
  RegisterPriority,
  RegisterStatus,
} from '../../types/register.types';

const STATUS_BADGE: Record<RegisterStatus, 'gray' | 'green' | 'red'> = {
  IDLE: 'gray',
  OK: 'green',
  REJECTED: 'red',
};

const PRIORITY_BADGE: Record<RegisterPriority, 'red' | 'amber' | 'blue'> = {
  HIGH: 'red',
  MEDIUM: 'amber',
  LOW: 'blue',
};

const CYCLE_LABEL: Record<RegisterCycle, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  '15_DAYS': '15 Days',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-Yearly',
  YEARLY: 'Yearly',
};

function RegisterMonitoring() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState<RegisterCycle | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<RegisterPriority | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<RegisterStatus | 'ALL'>('ALL');

  const [editingRegister, setEditingRegister] = useState<Register | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    register_no: string;
    head_id: number | '';
    checking_cycle: RegisterCycle;
    priority: RegisterPriority;
    start_date: string;
  } | null>(null);

  // Registers are cyclic — there is no series-wide "status" worth editing
  // separately. The only thing that is ever updated is a single dated
  // occurrence (by default: today's), never "all rows" of the recurring
  // series. `occurrenceTarget` is scoped to exactly one (register, date) pair.
  const [occurrenceTarget, setOccurrenceTarget] = useState<RegisterCalendarEvent | null>(null);
  const [pendingOccurrenceStatus, setPendingOccurrenceStatus] = useState<RegisterStatus>('OK');
  const [deleteTarget, setDeleteTarget] = useState<Register | null>(null);
  const [detailsRegister, setDetailsRegister] = useState<Register | null>(null);
  const [calendarRegister, setCalendarRegister] = useState<Register | null>(null);

  const { data: registers = [], isLoading } = useQuery({
    queryKey: ['registers', search, cycleFilter, priorityFilter, statusFilter],
    queryFn: () =>
      getRegisters({
        search: search || undefined,
        cycle: cycleFilter === 'ALL' ? undefined : cycleFilter,
        priority: priorityFilter === 'ALL' ? undefined : priorityFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
  });

  // Active Head Names for the edit-form dropdown (Section 1 of the spec).
  const { data: heads = [] } = useQuery({
    queryKey: ['register-heads'],
    queryFn: getRegisterHeads,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => updateRegister(id, data),
    onSuccess: (_updated, variables) => {
      qc.invalidateQueries({ queryKey: ['registers'] });
      // Invalidate every cache keyed under 'register-calendar' (overview,
      // single-register popup, AND the Performance Registry panel) — a
      // narrower prefix here silently leaves other consumers stale.
      qc.invalidateQueries({ queryKey: ['register-calendar'] });
      toast.success('Register updated successfully');
      setEditingRegister(null);
      setEditForm(null);
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to update register';
      toast.error(message);
    },
  });

  // Update Status: keyed by (register id, occurrence date) — the
  // request can only ever resolve to one RegisterOccurrence row server-side.
  const occurrenceMutation = useMutation({
    mutationFn: ({ id, occurrenceDate, status }: { id: number; occurrenceDate: string; status: RegisterStatus }) =>
      updateOccurrenceStatus(id, occurrenceDate, status),
    onSuccess: (_updated, variables) => {
      qc.invalidateQueries({ queryKey: ['registers'] });
      qc.invalidateQueries({ queryKey: ['register-calendar'] });
      toast.success('Occurrence updated successfully');
      setOccurrenceTarget(null);
    },
    onError: () => toast.error('Failed to update occurrence'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRegister,
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: ['registers'] });
      qc.invalidateQueries({ queryKey: ['register-calendar'] });
      toast.success('Register deleted successfully');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete register'),
  });

  const openEdit = (register: Register) => {
    setEditingRegister(register);
    setEditForm({
      name: register.name,
      register_no: register.register_no,
      head_id: register.head_id ?? '',
      checking_cycle: register.checking_cycle,
      priority: register.priority,
      start_date: register.start_date,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRegister || !editForm) return;
    if (!editForm.name || !editForm.register_no || !editForm.head_id || !editForm.start_date) {
      toast.error('All fields are required');
      return;
    }
    updateMutation.mutate({ id: editingRegister.id, data: editForm });
  };

  // "Update Status" always resolves to exactly ONE occurrence: today's.
  // Registers are cyclic, so there is nothing meaningful about updating
  // "the whole series" — only the current day's entry ever needs a status.
  const openTodayStatusModal = (register: Register) => {
    const today = todayISO();
    setOccurrenceTarget({
      id: `${register.id}:${today}`,
      register_id: register.id,
      occurrence_id: null,
      occurrence_date: today,
      title: `${register.name} (${register.register_no})`,
      date: today,
      status: register.status,
      computed_status: register.computed_status,
      color: 'gray',
      dot_color: register.dot_color,
      is_future_or_pending: true,
      register,
    });
    setPendingOccurrenceStatus(register.status === 'IDLE' ? 'OK' : register.status);
  };

  const emptyState = useMemo(() => !isLoading && registers.length === 0, [isLoading, registers]);

  // Export the currently filtered (search / cycle / priority / status) list
  // of registers to CSV.
  const handleExport = () => {
    const csvCell = (value: string | number) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = [
      ['Register Name', 'Register No.', 'Head Name', 'Checking Cycle', 'Priority', 'Status', 'Next Due Date', 'Last Completed'],
      ...registers.map((r) => [
        r.name,
        r.register_no,
        r.head_name,
        CYCLE_LABEL[r.checking_cycle],
        r.priority,
        r.status,
        r.next_due_date,
        r.last_completed_date ?? '',
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registers_${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Register Monitoring</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Track register status and upcoming due dates</p>
        </div>
        <Button variant="primary" size="sm" onClick={handleExport} disabled={registers.length === 0}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Register Name or No."
          className="min-w-[220px] flex-1 rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
        />
        <select
          value={cycleFilter}
          onChange={(e) => setCycleFilter(e.target.value as RegisterCycle | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
        >
          <option value="ALL">All Checking Cycles</option>
          {REGISTER_CYCLES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as RegisterPriority | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
        >
          <option value="ALL">All Priorities</option>
          {REGISTER_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RegisterStatus | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
        >
          <option value="ALL">All Status</option>
          {REGISTER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#EFF2F6] bg-white">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : emptyState ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No registers found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {[
                  'Register Name',
                  'Register No.',
                  'Head Name',
                  'Checking Cycle',
                  'Priority',
                  'Start Date',
                  'Status',
                  'Actions',
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {registers.map((r) => (
                <tr key={r.id} className="transition hover:bg-[#F8F9FC]">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDetailsRegister(r)}
                      className="font-medium text-[#185FA5] hover:underline"
                    >
                      {r.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{r.register_no}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{r.head_name}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{CYCLE_LABEL[r.checking_cycle]}</td>
                  <td className="px-4 py-3">
                    <Badge variant={PRIORITY_BADGE[r.priority]}>{r.priority}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{formatDate(r.start_date)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openEdit(r)} className="text-xs text-blue-600 hover:underline" type="button">
                        Edit
                      </button>
                      <button
                        onClick={() => openTodayStatusModal(r)}
                        className="text-xs text-emerald-600 hover:underline"
                        type="button"
                        title="Updates only today's entry for this cyclic register"
                      >
                        Update Status
                      </button>
                      <button
                        onClick={() => setCalendarRegister(r)}
                        className="text-xs text-[#185FA5] hover:underline"
                        type="button"
                      >
                        Calendar
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="text-xs text-red-600 hover:underline"
                        type="button"
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

      {/* The below-the-list calendar has been removed — the per-register
          popup calendar (opened via "Calendar" above) is the single place
          the Chairman views AND updates register status day-by-day. */}

      {/* Edit modal */}
      <Modal
        isOpen={!!editingRegister}
        onClose={() => {
          setEditingRegister(null);
          setEditForm(null);
        }}
        title="Edit Register"
      >
        {editForm ? (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <Input
              label="Register Name *"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <Input
              label="Register No. *"
              value={editForm.register_no}
              onChange={(e) => setEditForm({ ...editForm, register_no: e.target.value })}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Head Name *</span>
              <select
                value={editForm.head_id}
                onChange={(e) => setEditForm({ ...editForm, head_id: e.target.value ? Number(e.target.value) : '' })}
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm"
              >
                <option value="">Select the person responsible</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.department_name ? ` (${h.department_name})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-[#36506C]">Checking Cycle *</span>
                <select
                  value={editForm.checking_cycle}
                  onChange={(e) => setEditForm({ ...editForm, checking_cycle: e.target.value as RegisterCycle })}
                  className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm"
                >
                  {REGISTER_CYCLES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-[#36506C]">Priority *</span>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as RegisterPriority })}
                  className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm"
                >
                  {REGISTER_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Input
              label="Start Date *"
              type="date"
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" type="button" onClick={() => { setEditingRegister(null); setEditForm(null); }}>
                Cancel
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Update Status modal — scoped to exactly one date (today, unless opened
          from the calendar popup). Registers are cyclic, so this is the ONLY
          status-update action in the whole page: it never touches any other
          date's occurrence and there is no separate "whole series" update. */}
      <Modal isOpen={!!occurrenceTarget} onClose={() => setOccurrenceTarget(null)} title="Update Status">
        {occurrenceTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-[#5B6E8C]">
              Updating only the <span className="font-semibold text-[#1E293B]">{formatDate(occurrenceTarget.date)}</span>{' '}
              {occurrenceTarget.date === todayISO() ? '(today’s) ' : ''}entry
              of <span className="font-semibold text-[#1E293B]">{occurrenceTarget.register.name}</span> (
              {occurrenceTarget.register.register_no}). Other dates of this recurring register are not affected.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Status</span>
              <select
                value={pendingOccurrenceStatus}
                onChange={(e) => setPendingOccurrenceStatus(e.target.value as RegisterStatus)}
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm"
              >
                {REGISTER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" type="button" onClick={() => setOccurrenceTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                loading={occurrenceMutation.isPending}
                onClick={() =>
                  occurrenceMutation.mutate({
                    id: occurrenceTarget.register_id,
                    occurrenceDate: occurrenceTarget.occurrence_date,
                    status: pendingOccurrenceStatus,
                  })
                }
              >
                Update This Occurrence
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Register">
        {deleteTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-[#5B6E8C]">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-[#1E293B]">{deleteTarget.name}</span> ({deleteTarget.register_no})? This
              action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" type="button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <RegisterDetailsModal register={detailsRegister} onClose={() => setDetailsRegister(null)} />

      {/* Calendar popup — opens a small modal for just the selected Register (Section 4). */}
      <RegisterCalendarPopup register={calendarRegister} onClose={() => setCalendarRegister(null)} />
    </div>
  );
}

export default RegisterMonitoring;
