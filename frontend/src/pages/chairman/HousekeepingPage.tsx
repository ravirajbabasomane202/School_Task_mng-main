import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import {
  createHousekeepingTask,
  deleteHousekeepingTask,
  getHousekeepingStats,
  getHousekeepingTasks,
  updateHousekeepingTask,
  type HousekeepingTask,
} from '../../services/housekeepingService';
import api from '../../services/api';

const STATUS_COLORS: Record<string, 'amber' | 'blue' | 'green'> = {
  PENDING: 'amber',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
};

const PRIORITY_COLORS: Record<string, 'red' | 'amber' | 'gray'> = {
  HIGH: 'red',
  MEDIUM: 'amber',
  LOW: 'gray',
};

const TYPE_ICONS: Record<string, string> = {
  CLEANING: '🧹',
  MAINTENANCE: '🔧',
  INSPECTION: '🔍',
  REPAIR: '🛠️',
};

interface FormState {
  area: string;
  task_type: string;
  description: string;
  priority: string;
  scheduled_date: string;
  assigned_to: string;
  notes: string;
}

const emptyForm: FormState = {
  area: '',
  task_type: 'CLEANING',
  description: '',
  priority: 'MEDIUM',
  scheduled_date: '',
  assigned_to: '',
  notes: '',
};

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function HousekeepingPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<HousekeepingTask | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const tasksQuery = useQuery({
    queryKey: ['housekeeping-tasks', statusFilter, typeFilter],
    queryFn: () =>
      getHousekeepingTasks({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        task_type: typeFilter !== 'ALL' ? typeFilter : undefined,
      }),
  });

  const statsQuery = useQuery({
    queryKey: ['housekeeping-stats'],
    queryFn: getHousekeepingStats,
  });

  const usersQuery = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await api.get<{ data: { id: number; name: string; role: string }[] }>('/users');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createHousekeepingTask,
    onSuccess: () => {
      toast.success('Task created!');
      void queryClient.invalidateQueries({ queryKey: ['housekeeping'] });
      setShowModal(false);
      setForm(emptyForm);
    },
    onError: () => toast.error('Failed to create task.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateHousekeepingTask>[1] }) =>
      updateHousekeepingTask(id, payload),
    onSuccess: () => {
      toast.success('Task updated!');
      void queryClient.invalidateQueries({ queryKey: ['housekeeping'] });
      setShowModal(false);
      setEditingTask(null);
      setForm(emptyForm);
    },
    onError: () => toast.error('Failed to update task.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHousekeepingTask,
    onSuccess: () => {
      toast.success('Task deleted.');
      void queryClient.invalidateQueries({ queryKey: ['housekeeping'] });
    },
    onError: () => toast.error('Failed to delete task.'),
  });

  const statusChangeMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateHousekeepingTask(id, { status }),
    onSuccess: () => {
      toast.success('Status updated.');
      void queryClient.invalidateQueries({ queryKey: ['housekeeping'] });
    },
    onError: () => toast.error('Failed to update status.'),
  });

  function openCreate() {
    setEditingTask(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(t: HousekeepingTask) {
    setEditingTask(t);
    setForm({
      area: t.area,
      task_type: t.task_type,
      description: t.description ?? '',
      priority: t.priority,
      scheduled_date: t.scheduled_date ? t.scheduled_date.slice(0, 10) : '',
      assigned_to: t.assigned_to ? String(t.assigned_to) : '',
      notes: t.notes ?? '',
    });
    setShowModal(true);
  }

  function handleSubmit() {
    if (!form.area.trim() || !form.task_type) {
      toast.error('Area and task type are required.');
      return;
    }
    const payload = {
      area: form.area,
      task_type: form.task_type,
      description: form.description || undefined,
      priority: form.priority,
      scheduled_date: form.scheduled_date || undefined,
      assigned_to: form.assigned_to ? parseInt(form.assigned_to, 10) : undefined,
      notes: form.notes || undefined,
    };
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const tasks = tasksQuery.data ?? [];
  const stats = statsQuery.data;
  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Property &amp; Maintenance
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#1E293B]">Housekeeping</h1>
            <p className="mt-2 text-sm text-[#5B6E8C]">
              Manage cleaning, maintenance, inspection, and repair tasks across school premises.
            </p>
          </div>
          <Button onClick={openCreate}>+ Add task</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, tone: 'text-[#1E293B]' },
            { label: 'Pending', value: stats.pending, tone: 'text-amber-600' },
            { label: 'In Progress', value: stats.in_progress, tone: 'text-blue-600' },
            { label: 'Completed', value: stats.completed, tone: 'text-green-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-[#EFF2F6] bg-white p-4">
              <p className="text-sm text-[#5B6E8C]">{s.label}</p>
              <p className={`text-2xl font-bold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mr-2 text-xs font-semibold text-[#5B6E8C]">Status</label>
          <select
            className="rounded-lg border border-[#EFF2F6] bg-white px-3 py-1.5 text-sm"
            onChange={(e) => setStatusFilter(e.target.value)}
            value={statusFilter}
          >
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div>
          <label className="mr-2 text-xs font-semibold text-[#5B6E8C]">Type</label>
          <select
            className="rounded-lg border border-[#EFF2F6] bg-white px-3 py-1.5 text-sm"
            onChange={(e) => setTypeFilter(e.target.value)}
            value={typeFilter}
          >
            <option value="ALL">All</option>
            <option value="CLEANING">Cleaning</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INSPECTION">Inspection</option>
            <option value="REPAIR">Repair</option>
          </select>
        </div>
      </div>

      {/* Tasks list */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">All housekeeping tasks</h2>
        {tasksQuery.isLoading ? (
          <p className="text-sm text-[#8A99B0]">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-[#8A99B0]">No tasks found. Add one to get started.</p>
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#EFF2F6] bg-[#FAFCFE] px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg">{TYPE_ICONS[t.task_type] ?? '📋'}</span>
                    <p className="font-semibold text-[#1E293B]">{t.area}</p>
                    <Badge variant={STATUS_COLORS[t.status] ?? 'gray'}>{t.status.replace('_', ' ')}</Badge>
                    <Badge variant={PRIORITY_COLORS[t.priority] ?? 'gray'}>{t.priority}</Badge>
                    <span className="rounded-full bg-[#EFF2F6] px-2 py-0.5 text-[11px] text-[#5B6E8C]">
                      {t.task_type}
                    </span>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-sm text-[#5B6E8C]">{t.description}</p>
                  )}
                  <p className="mt-1 text-xs text-[#8A99B0]">
                    {t.scheduled_date ? `📅 Scheduled: ${formatDate(t.scheduled_date)}` : 'No schedule set'}
                    {t.assigneeName ? ` · 👤 ${t.assigneeName}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.status === 'PENDING' && (
                    <Button
                      onClick={() => statusChangeMutation.mutate({ id: t.id, status: 'IN_PROGRESS' })}
                      size="sm"
                      variant="ghost"
                    >
                      Start
                    </Button>
                  )}
                  {t.status === 'IN_PROGRESS' && (
                    <Button
                      onClick={() => statusChangeMutation.mutate({ id: t.id, status: 'COMPLETED' })}
                      size="sm"
                      variant="ghost"
                    >
                      Complete
                    </Button>
                  )}
                  <Button onClick={() => openEdit(t)} size="sm" variant="ghost">
                    Edit
                  </Button>
                  <Button
                    onClick={() => {
                      if (window.confirm('Delete this task?')) deleteMutation.mutate(t.id);
                    }}
                    size="sm"
                    variant="danger"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingTask(null);
          setForm(emptyForm);
        }}
        title={editingTask ? 'Edit Housekeeping Task' : 'Add Housekeeping Task'}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">
              Area / Location <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="e.g. Corridor B, Staff Toilets"
              value={form.area}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Task Type</label>
              <select
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, task_type: e.target.value })}
                value={form.task_type}
              >
                <option value="CLEANING">🧹 Cleaning</option>
                <option value="MAINTENANCE">🔧 Maintenance</option>
                <option value="INSPECTION">🔍 Inspection</option>
                <option value="REPAIR">🛠️ Repair</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Priority</label>
              <select
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                value={form.priority}
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Scheduled Date</label>
              <input
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                type="date"
                value={form.scheduled_date}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Assign To</label>
              <select
                className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                value={form.assigned_to}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Description</label>
            <textarea
              className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What needs to be done..."
              rows={2}
              value={form.description}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5B6E8C]">Notes</label>
            <textarea
              className="w-full rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm outline-none focus:border-[#185FA5]"
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              value={form.notes}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={() => {
                setShowModal(false);
                setEditingTask(null);
                setForm(emptyForm);
              }}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              {editingTask ? 'Update task' : 'Add task'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
