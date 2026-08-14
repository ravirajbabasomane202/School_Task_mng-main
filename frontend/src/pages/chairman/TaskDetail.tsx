import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import Modal from '../../components/common/Modal';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useSocket } from '../../hooks/useSocket';
import * as taskService from '../../services/taskService';
import { useAppSelector } from '../../store/hooks';
import type { Task, TaskHistory, TaskStatus } from '../../types/task.types';
import { ROLES } from '../../constants/roles';
import { getBackendBaseUrl } from '../../utils/apiBase';

/* ─── Lookup maps ─────────────────────────────────────────── */

const statusVariant: Record<TaskStatus, 'blue' | 'amber' | 'green' | 'red' | 'gray'> = {
  PENDING: 'blue',
  IN_PROGRESS: 'amber',
  COMPLETED: 'green',
  DELAYED: 'red',
  ESCALATED: 'gray',
};

const priorityVariant: Record<string, 'red' | 'amber' | 'green'> = {
  HIGH: 'red',
  MEDIUM: 'amber',
  LOW: 'green',
};

/* ─── Helpers ─────────────────────────────────────────────── */

const fmt = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

const fmtDate = (value?: string | null) => {
  if (!value) return '--';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const nodeColor: Record<TaskStatus, string> = {
  COMPLETED: 'bg-[#2E9B67]',
  DELAYED: 'bg-[#D64545]',
  IN_PROGRESS: 'bg-[#D89B17]',
  PENDING: 'bg-[#185FA5]',
  ESCALATED: 'bg-[#7B879C]',
};

/* ─── Timeline item ───────────────────────────────────────── */

function TimelineItem({ entry, isLast }: { entry: TaskHistory; isLast: boolean }) {
  return (
    <div className="relative flex gap-4">
      <div className="relative flex w-6 flex-shrink-0 justify-center">
        {!isLast && <div className="absolute top-3 h-full w-px bg-[#EFF2F6]" />}
        <span
          className={[
            'relative z-10 mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm',
            nodeColor[entry.new_status] ?? 'bg-[#7B879C]',
          ].join(' ')}
        />
      </div>
      <div className="mb-4 flex-1 rounded-[14px] border border-[#EFF2F6] bg-[#FAFBFD] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={entry.old_status ? statusVariant[entry.old_status] : 'gray'}>
            {entry.old_status ? fmt(entry.old_status) : 'Created'}
          </Badge>
          <span className="text-xs text-[#8A99B0]">→</span>
          <Badge variant={statusVariant[entry.new_status]}>{fmt(entry.new_status)}</Badge>
        </div>
        <p className="mt-2 text-sm font-medium text-[#1E293B]">
          {entry.updatedBy?.name ?? entry.updatedByName ?? 'System'}
        </p>
        {entry.comment && (
          <p className="mt-1.5 text-sm leading-6 text-[#36506C]">"{entry.comment}"</p>
        )}
        <p className="mt-2 text-xs text-[#8A99B0]">{fmtDate(entry.updated_at)}</p>
      </div>
    </div>
  );
}

/* ─── Escalation modal (Chairman only) ───────────────────── */

function EscalateModal({
  task,
  onClose,
  onConfirm,
}: {
  task: Task;
  onClose: () => void;
  onConfirm: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!comment.trim()) {
      setErr('Please provide a reason for escalation.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(comment.trim());
      onClose();
    } catch {
      setErr('Failed to escalate task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Escalate Task">
      {/* Warning banner */}
      <div className="mb-4 flex items-start gap-3 rounded-[12px] border border-[#F5D5D4] bg-[#FFF6F6] p-3.5">
        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#D64545] text-[10px] font-bold text-white">!</span>
        <div>
          <p className="text-sm font-semibold text-[#C13F3A]">This action will escalate the task</p>
          <p className="mt-0.5 text-xs text-[#A85050]">
            All assignees and relevant parties will be notified.
          </p>
        </div>
      </div>

      {/* Task name */}
      <div className="mb-4 rounded-[10px] bg-[#F8F9FC] px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A99B0]">Task</p>
        <p className="mt-1 text-sm font-medium text-[#1E293B]">{task.title}</p>
      </div>

      {/* Reason */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#36506C]">
          Escalation reason <span className="text-[#D64545]">*</span>
        </span>
        <textarea
          className="min-h-[96px] resize-none rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 py-2.5 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
          onChange={(e) => { setComment(e.target.value); setErr(null); }}
          placeholder="Describe why this task needs to be escalated…"
          value={comment}
        />
      </label>

      {err && <p className="mt-2 text-xs text-[#D64545]">{err}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} variant="ghost">Cancel</Button>
        <Button
          className="!border-[#F3C7C5] !bg-[#FFF4F4] !text-[#C13F3A] hover:!bg-[#FFE9E9]"
          loading={saving}
          onClick={() => void handleConfirm()}
        >
          Escalate Task
        </Button>
      </div>
    </Modal>
  );
}

/* ─── Status-change modal (non-Chairman) ─────────────────── */

const ALL_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];

function StatusChangeModal({
  task,
  onClose,
  onConfirm,
}: {
  task: Task;
  onClose: () => void;
  onConfirm: (newStatus: TaskStatus, proof?: File) => Promise<void>;
}) {
  const [newStatus, setNewStatus] = useState<TaskStatus>(task.status);
  const [proof, setProof] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsProof = newStatus === 'COMPLETED';

  const handleConfirm = async () => {
    if (needsProof && !proof) {
      setErr('Please upload task proof before marking as Completed.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(newStatus, proof);
      onClose();
    } catch {
      setErr('Failed to update status. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Change Task Status">
      <p className="mb-4 truncate text-xs text-[#8A99B0]">{task.title}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#36506C]">New Status</span>
        <select
          className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5]"
          onChange={(e) => { setNewStatus(e.target.value as TaskStatus); setErr(null); }}
          value={newStatus}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{fmt(s)}</option>
          ))}
        </select>
      </label>
      {needsProof && (
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#36506C]">
            Proof of Completion <span className="text-[#D64545]">*</span>
          </span>
          <input
            accept="image/*,application/pdf"
            className="text-sm text-[#36506C]"
            onChange={(e) => setProof(e.target.files?.[0])}
            type="file"
          />
        </label>
      )}
      {err && <p className="mt-3 text-xs text-[#D64545]">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} variant="ghost">Cancel</Button>
        <Button loading={saving} onClick={() => void handleConfirm()}>Save</Button>
      </div>
    </Modal>
  );
}

/* ─── Meta field ──────────────────────────────────────────── */

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A99B0]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ─── Main content ────────────────────────────────────────── */

function TaskDetailContent() {
  const { id } = useParams();
  const { user } = useAppSelector((state) => state.auth);
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  const isChairman = user?.role === ROLES.CHAIRMAN;

  const taskQuery = useQuery({
    queryKey: ['task-detail', id],
    queryFn: () => taskService.getTaskById(Number(id)),
    enabled: Boolean(id),
  });

  const task = taskQuery.data;

  const handleStatusChange = async (newStatus: TaskStatus, proof?: File) => {
    if (!task) return;
    await taskService.updateTaskStatus(task.id, newStatus, proof);
    await queryClient.invalidateQueries({ queryKey: ['task-detail', id] });
    toast.success('Task status updated.');
  };

  const handleEscalate = async (comment: string) => {
    if (!task) return;
    await taskService.updateTaskStatus(task.id, 'ESCALATED', undefined, comment);
    await queryClient.invalidateQueries({ queryKey: ['task-detail', id] });
    toast.success('Task escalated successfully.');
  };

  const attachmentUrl = useMemo(() => {
    if (!task?.attachment_path) return null;
    return `${getBackendBaseUrl()}/${task.attachment_path.replace(/^\/+/, '')}`;
  }, [task?.attachment_path]);

  const proofUrl = useMemo(() => {
    if (!task?.proof_path) return null;
    return `${getBackendBaseUrl()}/${task.proof_path.replace(/^\/+/, '')}`;
  }, [task?.proof_path]);

  const fallbackPath =
    user?.role === ROLES.CHAIRMAN
      ? '/chairman/task-monitor'
      : user?.role === 'DIRECTOR'
        ? '/director'
        : '/department/my-tasks';

  if (taskQuery.isLoading) return <Loader />;

  if (taskQuery.isError || !task) {
    return (
      <section className="p-5">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-8 text-center">
          <p className="text-lg font-semibold text-[#1E293B]">Task not found</p>
          <p className="mt-2 text-sm text-[#5B6E8C]">The requested task could not be loaded.</p>
          <Link className="mt-4 inline-flex text-sm font-semibold text-[#185FA5]" to={fallbackPath}>
            ← Back to tasks
          </Link>
        </div>
      </section>
    );
  }

  const alreadyEscalated = task.status === 'ESCALATED';

  return (
    <section className="space-y-5 p-5">

      {/* ── Header card ── */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">

        {/* Top row: back + actions */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5B6E8C] transition hover:text-[#185FA5]"
            to={fallbackPath}
          >
            <span className="text-base leading-none">←</span>
            Back to tasks
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chairman: Escalate button */}
            {isChairman && (
              <button
                disabled={alreadyEscalated}
                onClick={() => setShowEscalateModal(true)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-sm font-semibold transition',
                  alreadyEscalated
                    ? 'cursor-not-allowed border-[#E2E8F0] bg-[#F8F9FC] text-[#8A99B0]'
                    : 'border-[#F3C7C5] bg-[#FFF4F4] text-[#C13F3A] hover:bg-[#FFE9E9]',
                ].join(' ')}
              >
                <span className="text-base leading-none">⚠</span>
                {alreadyEscalated ? 'Already Escalated' : 'Escalate Task'}
              </button>
            )}

            {/* Non-chairman: Change status */}
            {!isChairman && (
              <Button onClick={() => setShowStatusModal(true)} variant="primary">
                Change Status
              </Button>
            )}
          </div>
        </div>

        {/* Title + badges */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-[#1E293B] leading-snug">{task.title}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge variant={priorityVariant[task.priority] ?? 'gray'}>
                {fmt(task.priority)} Priority
              </Badge>
              <Badge variant={statusVariant[task.status]}>{fmt(task.status)}</Badge>
              {task.cadence && (
                <Badge variant="gray">{fmt(task.cadence)}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div className="mt-6 grid gap-x-6 gap-y-5 rounded-[14px] bg-[#F8F9FC] p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetaField label="Assigned to">
            <p className="text-sm font-medium text-[#1E293B]">
              {task.assignedTo?.name ?? task.assignedToName ?? '--'}
            </p>
          </MetaField>
          <MetaField label="Department">
            <p className="text-sm font-medium text-[#1E293B]">
              {task.department?.name ?? task.departmentName ?? '--'}
            </p>
          </MetaField>
          <MetaField label="Start date">
            <p className="text-sm font-medium text-[#1E293B]">{fmtDate(task.start_date)}</p>
          </MetaField>
          <MetaField label="Due date">
            <p className="text-sm font-medium text-[#1E293B]">{fmtDate(task.due_date)}</p>
          </MetaField>
          <MetaField label="Brief attachment">
            {attachmentUrl ? (
              <a
                className="text-sm font-semibold text-[#185FA5] hover:underline"
                href={attachmentUrl}
                rel="noreferrer"
                target="_blank"
              >
                Download ↗
              </a>
            ) : (
              <p className="text-sm text-[#8A99B0]">None</p>
            )}
          </MetaField>
          <MetaField label="Completion proof">
            {proofUrl ? (
              <a
                className="text-sm font-semibold text-[#185FA5] hover:underline"
                href={proofUrl}
                rel="noreferrer"
                target="_blank"
              >
                Download ↗
              </a>
            ) : task.status === 'COMPLETED' ? (
              <p className="text-sm font-semibold text-[#D64545]">Missing</p>
            ) : (
              <p className="text-sm text-[#8A99B0]">--</p>
            )}
          </MetaField>
        </div>

        {/* Description */}
        <div className="mt-5 rounded-[14px] border border-[#EFF2F6] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A99B0]">Description</p>
          <p className="mt-3 text-sm leading-7 text-[#475569]">
            {task.description?.trim() || 'No description was provided for this task.'}
          </p>
        </div>
      </div>

      {/* ── Timeline card ── */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
              Task History
            </p>
            <h2 className="mt-1.5 text-xl font-semibold text-[#1E293B]">Timeline</h2>
          </div>
          <span className="rounded-full border border-[#EFF2F6] bg-[#F8F9FC] px-3 py-1 text-xs font-semibold text-[#5B6E8C]">
            {task.history?.length ?? 0} update{(task.history?.length ?? 0) === 1 ? '' : 's'}
          </span>
        </div>

        {task.history?.length ? (
          <div>
            {task.history.map((entry, i) => (
              <TimelineItem
                entry={entry}
                isLast={i === task.history!.length - 1}
                key={entry.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#DCE2EA] p-6 text-center text-sm text-[#8A99B0]">
            No history entries yet.
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showStatusModal && task && (
        <StatusChangeModal
          onClose={() => setShowStatusModal(false)}
          onConfirm={handleStatusChange}
          task={task}
        />
      )}

      {showEscalateModal && task && (
        <EscalateModal
          onClose={() => setShowEscalateModal(false)}
          onConfirm={handleEscalate}
          task={task}
        />
      )}
    </section>
  );
}

/* ─── Page wrapper ────────────────────────────────────────── */

function TaskDetail() {
  useSocket();
  return (
    <div className="flex min-h-screen bg-[#F1F4F9] text-[#1E293B]">
      <Sidebar />
      <main className="custom-scrollbar ml-[196px] h-screen min-w-0 flex-1 overflow-y-auto">
        <Navbar />
        <TaskDetailContent />
      </main>
    </div>
  );
}

export default TaskDetail;
