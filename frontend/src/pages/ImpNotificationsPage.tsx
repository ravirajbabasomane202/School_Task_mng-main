import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import ConfirmDeleteDialog from '../components/common/ConfirmDeleteDialog';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import PageContainer from '../components/common/PageContainer';
import ResponsiveTable from '../components/common/ResponsiveTable';
import { ROLE_LABELS, isChairmanLevel, type Role } from '../constants/roles';
import {
  createImpNotification,
  deleteImpNotification,
  getImpAssignmentOptions,
  getImpNotification,
  getImpNotifications,
  setImpNotificationActive,
  updateImpNotification,
  updateImpNotificationStatus,
} from '../services/impNotificationService';
import { useAppSelector } from '../store/hooks';
import {
  IMP_PRIORITIES,
  IMP_RECURRENCES,
  IMP_STATUSES,
  type ImpCycle,
  type ImpNotification,
  type ImpNotificationPayload,
  type ImpPriority,
  type ImpRecurrence,
  type ImpStatus,
} from '../types/impNotification.types';
import { getApiErrorMessage } from '../utils/apiError';

const QUERY_KEY = 'imp-notifications';

/** "2027-06-25" -> "25 Jun 2027" without any time-zone shifting. */
function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const labelOf = <T extends string>(list: { value: T; label: string }[], value: T) =>
  list.find((item) => item.value === value)?.label ?? value;

const STATUS_BADGE: Record<ImpStatus, 'amber' | 'blue' | 'green'> = {
  PENDING: 'amber',
  IN_PROGRESS: 'blue',
  DONE: 'green',
};
const PRIORITY_BADGE: Record<ImpPriority, 'gray' | 'blue' | 'amber' | 'red'> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'amber',
  CRITICAL: 'red',
};

function assigneeSummary(item: ImpNotification): string {
  if (item.assignees.length === 0) return '—';
  const names = item.assignees.map((a) => a.name);
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

interface FormState {
  title: string;
  description: string;
  due_date: string;
  start_date: string;
  recurrence: ImpRecurrence;
  priority: ImpPriority;
  status: ImpStatus;
  is_active: boolean;
  assigned_roles: string[];
  assigned_user_ids: number[];
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  due_date: '',
  start_date: '',
  recurrence: 'ONE_TIME',
  priority: 'MEDIUM',
  status: 'PENDING',
  is_active: true,
  assigned_roles: [],
  assigned_user_ids: [],
};

const selectClass =
  'min-h-[44px] w-full rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-base text-[#1E293B] outline-none focus:border-[#185FA5] sm:min-h-[38px] sm:text-sm';

function ImpNotificationsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector((state) => state.auth.user);
  const canManage = isChairmanLevel(user?.role);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ImpStatus>('ALL');
  const [recurrenceFilter, setRecurrenceFilter] = useState<'ALL' | ImpRecurrence>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'true' | 'false'>('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ImpNotification | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [doneTarget, setDoneTarget] = useState<ImpNotification | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImpNotification | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [QUERY_KEY, { search, statusFilter, recurrenceFilter, activeFilter }],
    queryFn: () =>
      getImpNotifications({
        search: search.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        recurrence: recurrenceFilter === 'ALL' ? undefined : recurrenceFilter,
        active: activeFilter === 'ALL' ? undefined : activeFilter,
      }),
  });
  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const optionsQuery = useQuery({
    queryKey: [QUERY_KEY, 'options'],
    queryFn: getImpAssignmentOptions,
    enabled: canManage,
    staleTime: 5 * 60_000,
  });

  const detailQuery = useQuery({
    queryKey: [QUERY_KEY, 'detail', viewId],
    queryFn: () => getImpNotification(viewId as number),
    enabled: viewId !== null,
  });

  // Deep link from a reminder: /imp-notifications?open=<id>
  useEffect(() => {
    const open = Number(searchParams.get('open'));
    if (Number.isInteger(open) && open > 0) setViewId(open);
  }, [searchParams]);

  const closeView = () => {
    setViewId(null);
    if (searchParams.has('open')) {
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: ImpNotificationPayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        due_date: form.due_date,
        start_date: form.start_date || form.due_date,
        recurrence: form.recurrence,
        priority: form.priority,
        is_active: form.is_active,
        assigned_roles: form.assigned_roles,
        assigned_user_ids: form.assigned_user_ids,
      };
      if (editing) {
        const changes: Partial<ImpNotificationPayload> = { ...payload };
        if (form.status !== editing.status) changes.status = form.status;
        return updateImpNotification(editing.id, changes);
      }
      return createImpNotification({ ...payload, status: form.status });
    },
    onSuccess: () => {
      toast.success(editing ? 'Notification updated' : 'Notification created');
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
    onError: (err: unknown) => setFormError(getApiErrorMessage(err, 'Failed to save notification')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ImpStatus }) => updateImpNotificationStatus(id, status),
    onSuccess: (updated, vars) => {
      if (vars.status === 'DONE') {
        toast.success(
          updated.recurrence === 'ONE_TIME'
            ? 'Marked as Done. Reminders have stopped.'
            : `Marked as Done. Next cycle is due ${fmt(updated.current_due_date)}.`
        );
      } else {
        toast.success('Status updated');
      }
      setDoneTarget(null);
      refresh();
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, 'Failed to update status'));
      setDoneTarget(null);
      refresh();
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setImpNotificationActive(id, active),
    onSuccess: (updated) => {
      toast.success(updated.is_active ? 'Notification activated' : 'Notification deactivated');
      refresh();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Failed to change active state')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteImpNotification(id),
    onSuccess: () => {
      toast.success('Notification deleted');
      setDeleteTarget(null);
      setDeleteError(null);
      refresh();
    },
    onError: (err: unknown) => setDeleteError(getApiErrorMessage(err, 'Failed to delete notification')),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (item: ImpNotification) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description ?? '',
      due_date: item.due_date,
      start_date: item.start_date,
      recurrence: item.recurrence,
      priority: item.priority,
      status: item.status,
      is_active: item.is_active,
      assigned_roles: item.assigned_roles,
      assigned_user_ids: item.assigned_user_ids,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return setFormError('Notification title is required');
    if (!form.due_date) return setFormError('Due date is required');
    if (form.start_date && form.start_date > form.due_date) {
      return setFormError('Notification start date cannot be after the due date');
    }
    if (form.assigned_roles.length === 0 && form.assigned_user_ids.length === 0) {
      return setFormError('Assign the notification to at least one user or role');
    }
    setFormError(null);
    saveMutation.mutate();
  };

  const toggle = <K extends 'assigned_roles' | 'assigned_user_ids'>(key: K, value: FormState[K][number]) =>
    setForm((prev) => {
      const list = prev[key] as (string | number)[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: next };
    });

  const viewing = detailQuery.data ?? items.find((i) => i.id === viewId) ?? null;
  const roleLabel = (role: string) => ROLE_LABELS[role as Role] ?? role;

  const renderHistory = (history: ImpCycle[]) => (
    <div className="overflow-x-auto rounded-[12px] border border-[#EFF2F6]">
      <table className="w-full min-w-[460px] text-left text-xs">
        <thead className="bg-[#F8F9FC] text-[#8A99B0]">
          <tr>
            {['Cycle', 'Due Date', 'Completion Date', 'Status'].map((h) => (
              <th className="px-3 py-2 font-semibold" key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F4F9]">
          {history.map((cycle) => (
            <tr key={`${cycle.cycle_number}-${cycle.status}`}>
              <td className="px-3 py-2 text-[#1E293B]">#{cycle.cycle_number}</td>
              <td className="px-3 py-2 text-[#5B6E8C]">{fmt(cycle.due_date)}</td>
              <td className="px-3 py-2 text-[#5B6E8C]">
                {cycle.status === 'DONE'
                  ? `${fmtDateTime(cycle.completed_at)}${cycle.completed_by_name ? ` · ${cycle.completed_by_name}` : ''}`
                  : cycle.status === 'UPCOMING'
                    ? 'Not generated yet'
                    : 'Not completed'}
              </td>
              <td className="px-3 py-2">
                {cycle.status === 'UPCOMING' ? (
                  <Badge variant="gray">Upcoming</Badge>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant={STATUS_BADGE[cycle.status]}>{labelOf(IMP_STATUSES, cycle.status)}</Badge>
                    {cycle.is_overdue ? <Badge variant="red">Overdue</Badge> : null}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Imp Notification</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">
            Important recurring activities and deadlines. Reminders repeat daily once overdue, until marked Done.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            New Notification
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search notifications"
          className="w-full min-w-0 flex-1 rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm sm:min-w-[220px]"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title"
          value={search}
        />
        <select aria-label="Filter by status" className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ImpStatus)} value={statusFilter}>
          <option value="ALL">All Statuses</option>
          {IMP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Filter by recurrence" className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
          onChange={(e) => setRecurrenceFilter(e.target.value as 'ALL' | ImpRecurrence)} value={recurrenceFilter}>
          <option value="ALL">All Recurrences</option>
          {IMP_RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select aria-label="Filter by active state" className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
          onChange={(e) => setActiveFilter(e.target.value as 'ALL' | 'true' | 'false')} value={activeFilter}>
          <option value="ALL">Active &amp; Inactive</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-[#EFF2F6] bg-white">
        {listQuery.isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-[#8A99B0]">Loading notifications…</p>
        ) : listQuery.isError ? (
          <p className="px-4 py-10 text-center text-sm text-[#C13F3A]">Failed to load notifications.</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#8A99B0]">
            {canManage ? 'No notifications yet. Create one to get started.' : 'No notifications are assigned to you.'}
          </p>
        ) : (
          <ResponsiveTable minWidth={980}>
            <table className="w-full text-sm">
              <thead className="bg-[#F8F9FC]">
                <tr>
                  {['Notification Title', 'Due Date', 'Assigned To', 'Recurrence', 'Priority', 'Status', 'Next Reminder', 'Actions'].map((h) => (
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]" key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F9]">
                {items.map((item) => {
                  const overdue = !!item.cycle?.is_overdue;
                  const finished = item.status === 'DONE';
                  return (
                    <tr className={['transition hover:bg-[#F8F9FC]', item.is_active ? '' : 'opacity-60'].join(' ')} key={item.id}>
                      <td className="px-4 py-3">
                        <button className="text-left font-medium text-[#185FA5] hover:underline" onClick={() => setViewId(item.id)} type="button">
                          {item.title}
                        </button>
                        {!item.is_active ? <Badge className="ml-2" variant="gray">Inactive</Badge> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5B6E8C]">
                        {fmt(item.current_due_date)}
                        {overdue ? <Badge className="ml-2" variant="red">Overdue</Badge> : null}
                      </td>
                      <td className="px-4 py-3 text-[#5B6E8C]" title={item.assignees.map((a) => a.name).join(', ')}>
                        {assigneeSummary(item)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5B6E8C]">{labelOf(IMP_RECURRENCES, item.recurrence)}</td>
                      <td className="px-4 py-3"><Badge variant={PRIORITY_BADGE[item.priority]}>{labelOf(IMP_PRIORITIES, item.priority)}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={STATUS_BADGE[item.status]}>{labelOf(IMP_STATUSES, item.status)}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5B6E8C]">{fmt(item.next_reminder)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <button className="text-xs text-[#185FA5] hover:underline" onClick={() => setViewId(item.id)} type="button">View</button>
                          {canManage ? (
                            <button className="text-xs text-blue-600 hover:underline" onClick={() => openEdit(item)} type="button">Edit</button>
                          ) : null}
                          {!finished && item.status === 'PENDING' ? (
                            <button
                              className="text-xs text-amber-700 hover:underline"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id: item.id, status: 'IN_PROGRESS' })}
                              type="button"
                            >
                              In Progress
                            </button>
                          ) : null}
                          {!finished ? (
                            <button className="text-xs text-emerald-600 hover:underline" onClick={() => setDoneTarget(item)} type="button">
                              Mark Done
                            </button>
                          ) : null}
                          {canManage ? (
                            <button
                              className="text-xs text-[#5B6E8C] hover:underline"
                              disabled={activeMutation.isPending}
                              onClick={() => activeMutation.mutate({ id: item.id, active: !item.is_active })}
                              type="button"
                            >
                              {item.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          ) : null}
                          {canManage ? (
                            <button className="text-xs text-red-600 hover:underline" onClick={() => { setDeleteError(null); setDeleteTarget(item); }} type="button">
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </div>

      {/* Create / edit */}
      <Modal isOpen={formOpen} onClose={() => { if (!saveMutation.isPending) setFormOpen(false); }} title={editing ? 'Edit Notification' : 'New Notification'}>
        <form className="space-y-4" onSubmit={submitForm}>
          <Input label="Notification Title *" onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Academic Calendar Creation" value={form.title} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Description</span>
            <textarea
              className="min-h-[80px] w-full rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 py-2 text-base outline-none focus:border-[#185FA5] sm:text-sm"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What needs to be done?"
              value={form.description}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Due Date *" onChange={(e) => setForm({ ...form, due_date: e.target.value })} type="date" value={form.due_date} />
            <Input label="Notification Start Date" onChange={(e) => setForm({ ...form, start_date: e.target.value })} type="date" value={form.start_date} />
          </div>
          <p className="-mt-2 text-[11px] text-[#8A99B0]">Reminders begin on the start date (defaults to the due date) and repeat daily after the due date until Done.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Recurrence</span>
              <select className={selectClass} onChange={(e) => setForm({ ...form, recurrence: e.target.value as ImpRecurrence })} value={form.recurrence}>
                {IMP_RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Priority</span>
              <select className={selectClass} onChange={(e) => setForm({ ...form, priority: e.target.value as ImpPriority })} value={form.priority}>
                {IMP_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Status</span>
              <select className={selectClass} disabled={editing?.status === 'DONE'} onChange={(e) => setForm({ ...form, status: e.target.value as ImpStatus })} value={form.status}>
                {IMP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-[#36506C]">
              <input checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} type="checkbox" />
              Active (send reminders)
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-[#36506C]">Assigned To *</legend>
            <p className="text-[11px] text-[#8A99B0]">Pick whole roles and/or individual users.</p>
            <p className="text-[11px] font-semibold text-[#5B6E8C]">Roles</p>
            <div className="flex flex-wrap gap-2">
              {(optionsQuery.data?.roles ?? []).map((role) => (
                <label className={['flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs', form.assigned_roles.includes(role) ? 'border-[#185FA5] bg-[#EAF3FC] text-[#185FA5]' : 'border-[#E4EAF2] text-[#5B6E8C]'].join(' ')} key={role}>
                  <input checked={form.assigned_roles.includes(role)} className="sr-only" onChange={() => toggle('assigned_roles', role)} type="checkbox" />
                  {roleLabel(role)}
                </label>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-[#5B6E8C]">Users</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-[10px] border border-[#EFF2F6] p-2">
              {(optionsQuery.data?.users ?? []).map((u) => (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#36506C]" key={u.id}>
                  <input checked={form.assigned_user_ids.includes(u.id)} onChange={() => toggle('assigned_user_ids', u.id)} type="checkbox" />
                  <span>{u.name}</span>
                  <span className="text-[11px] text-[#8A99B0]">{u.head_type ?? roleLabel(u.role)}</span>
                </label>
              ))}
              {optionsQuery.isLoading ? <p className="text-xs text-[#8A99B0]">Loading users…</p> : null}
            </div>
          </fieldset>

          {formError ? <p className="text-sm text-[#C13F3A]" role="alert">{formError}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setFormOpen(false)} type="button" variant="ghost">Cancel</Button>
            <Button loading={saveMutation.isPending} type="submit">{editing ? 'Save Changes' : 'Create Notification'}</Button>
          </div>
        </form>
      </Modal>

      {/* View + history */}
      <Modal isOpen={viewId !== null} onClose={closeView} title="Imp Notification">
        {viewing ? (
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="text-base font-semibold text-[#1E293B]">{viewing.title}</h3>
              {viewing.description ? <p className="mt-1 whitespace-pre-wrap text-[#5B6E8C]">{viewing.description}</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div><dt className="text-[#8A99B0]">Current Due Date</dt><dd className="mt-0.5 text-[#1E293B]">{fmt(viewing.current_due_date)}</dd></div>
              <div><dt className="text-[#8A99B0]">Next Reminder</dt><dd className="mt-0.5 text-[#1E293B]">{fmt(viewing.next_reminder)}</dd></div>
              <div><dt className="text-[#8A99B0]">Recurrence</dt><dd className="mt-0.5 text-[#1E293B]">{labelOf(IMP_RECURRENCES, viewing.recurrence)}</dd></div>
              <div><dt className="text-[#8A99B0]">Reminders Start</dt><dd className="mt-0.5 text-[#1E293B]">{fmt(viewing.cycle?.notify_from ?? viewing.start_date)}</dd></div>
              <div><dt className="text-[#8A99B0]">Priority</dt><dd className="mt-0.5"><Badge variant={PRIORITY_BADGE[viewing.priority]}>{labelOf(IMP_PRIORITIES, viewing.priority)}</Badge></dd></div>
              <div><dt className="text-[#8A99B0]">Status</dt><dd className="mt-0.5"><Badge variant={STATUS_BADGE[viewing.status]}>{labelOf(IMP_STATUSES, viewing.status)}</Badge>{viewing.is_active ? null : <Badge className="ml-1" variant="gray">Inactive</Badge>}</dd></div>
              <div className="col-span-2"><dt className="text-[#8A99B0]">Assigned To</dt><dd className="mt-0.5 text-[#1E293B]">{viewing.assignees.length ? viewing.assignees.map((a) => a.name).join(', ') : '—'}</dd></div>
              <div className="col-span-2"><dt className="text-[#8A99B0]">Created By</dt><dd className="mt-0.5 text-[#1E293B]">{viewing.created_by_name ?? '—'}</dd></div>
            </dl>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8A99B0]">Cycle History</h4>
              {viewing.history ? renderHistory(viewing.history) : <p className="text-xs text-[#8A99B0]">Loading history…</p>}
            </div>
            {viewing.status !== 'DONE' ? (
              <div className="flex flex-wrap justify-end gap-2">
                {viewing.status === 'PENDING' ? (
                  <Button onClick={() => statusMutation.mutate({ id: viewing.id, status: 'IN_PROGRESS' })} size="sm" variant="ghost">Mark In Progress</Button>
                ) : null}
                <Button onClick={() => setDoneTarget(viewing)} size="sm">Mark Done</Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-[#8A99B0]">{detailQuery.isError ? 'This notification is unavailable.' : 'Loading…'}</p>
        )}
      </Modal>

      {/* Mark done confirmation */}
      <Modal isOpen={doneTarget !== null} onClose={() => { if (!statusMutation.isPending) setDoneTarget(null); }} title="Mark as Done">
        {doneTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-[#5B6E8C]">
              Mark <span className="font-semibold text-[#1E293B]">“{doneTarget.title}”</span> as Done? Reminders for the current cycle will stop
              {doneTarget.recurrence === 'ONE_TIME' ? ' permanently.' : ' and the next cycle will be scheduled automatically.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setDoneTarget(null)} type="button" variant="ghost">Cancel</Button>
              <Button loading={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: doneTarget.id, status: 'DONE' })}>Mark Done</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDeleteDialog
        errorMessage={deleteError}
        isDeleting={deleteMutation.isPending}
        isOpen={deleteTarget !== null}
        itemLabel={deleteTarget ? `“${deleteTarget.title}”` : null}
        itemName="notification"
        note="Its cycle history and pending reminders will also be removed."
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Notification"
      />
    </PageContainer>
  );
}

export default ImpNotificationsPage;
