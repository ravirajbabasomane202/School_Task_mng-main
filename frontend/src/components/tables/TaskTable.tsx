import { useState } from 'react';
import type { Task, TaskCadence, TaskPriority, TaskStatus } from '../../types/task.types';
import Badge from '../common/Badge';

interface TaskTableProps {
  emptyMessage?: string;
  onRowClick?: (task: Task) => void;
  tasks: Task[];
  showActions?: boolean | ((task: Task) => boolean);
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: number) => void;
  /** Allow status change inline (for department/all-user view) */
  onStatusChange?: (taskId: number, newStatus: TaskStatus, proofFile?: File) => Promise<void>;
  /** Role of the logged-in user — used to restrict status options for Chairman */
  userRole?: string;
}

const priorityStripe: Record<TaskPriority, string> = {
  HIGH: 'before:bg-[#D64545]',
  MEDIUM: 'before:bg-[#D89B17]',
  LOW: 'before:bg-[#2E9B67]'
};

const statusVariant: Record<TaskStatus, 'blue' | 'amber' | 'green' | 'red' | 'gray'> = {
  PENDING: 'blue',
  IN_PROGRESS: 'amber',
  COMPLETED: 'green',
  DELAYED: 'red',
  ESCALATED: 'gray'
};

const ALL_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];
const CHAIRMAN_STATUSES: TaskStatus[] = ['ESCALATED'];

const formatLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getCadence = (task: Task): TaskCadence => {
  if (task.cadence) return task.cadence;
  const start = new Date(task.start_date);
  const due = new Date(task.due_date);
  const diffDays = Math.max(1, Math.ceil((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays <= 1) return 'DAILY';
  if (diffDays <= 7) return 'WEEKLY';
  return 'MONTHLY';
};

/** Inline status-change modal */
function StatusChangeModal({
  task,
  onClose,
  onConfirm,
  userRole
}: {
  task: Task;
  onClose: () => void;
  onConfirm: (newStatus: TaskStatus, proof?: File) => Promise<void>;
  userRole?: string;
}) {
  const isChairman = userRole === 'CHAIRMAN';
  const availableStatuses = isChairman ? CHAIRMAN_STATUSES : ALL_STATUSES;

  const [newStatus, setNewStatus] = useState<TaskStatus>(
    isChairman ? 'ESCALATED' : task.status
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-[#1E293B]">Change Task Status</h3>
        <p className="mt-1 text-xs text-[#8A99B0] truncate">{task.title}</p>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#36506C]">New Status</span>
          <select
            className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
            value={newStatus}
            onChange={(e) => { setNewStatus(e.target.value as TaskStatus); setErr(null); }}
          >
            {availableStatuses.map((s) => (
              <option key={s} value={s}>{formatLabel(s)}</option>
            ))}
          </select>
        </label>

        {needsProof && (
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">
              Task Proof <span className="text-[#C13F3A]">*</span>
              <span className="ml-1 font-normal text-[#8A99B0]">(required for Completed)</span>
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-dashed border-[#C9D6E5] bg-[#F8F9FC] px-3 py-2 text-sm text-[#36506C] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
              onChange={(e) => { setProof(e.target.files?.[0]); setErr(null); }}
            />
          </label>
        )}

        {err && <p className="mt-2 text-xs text-[#C13F3A]">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button
            disabled={saving}
            onClick={handleConfirm}
            className="flex-1 rounded-[10px] bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0F4880] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
          <button
            onClick={onClose}
            className="rounded-[10px] border border-[#DCE2EA] px-4 py-2 text-sm font-semibold text-[#5B6E8C] transition hover:bg-[#F3F6FA]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskTable({
  emptyMessage = 'No tasks available right now.',
  onRowClick,
  tasks,
  showActions,
  onEdit,
  onDelete,
  onStatusChange,
  userRole
}: TaskTableProps) {
  const [statusModalTask, setStatusModalTask] = useState<Task | null>(null);

  if (tasks.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-[18px] border border-[#EFF2F6] bg-white p-8 text-center">
        <div>
          <p className="text-sm font-semibold text-[#1E293B]">No tasks found</p>
          <p className="mt-2 text-sm text-[#8A99B0]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const actionsEnabled = typeof showActions === 'function' ? tasks.some(showActions) : Boolean(showActions);

  const headers = [
    'Task title',
    'Assigned to',
    'Priority',
    'Type',
    'Assign date',
    'Deadline',
    'Status',
    ...(actionsEnabled ? ['Actions'] : [])
  ];

  return (
    <>
      {statusModalTask && onStatusChange && (
        <StatusChangeModal
          task={statusModalTask}
          userRole={userRole}
          onClose={() => setStatusModalTask(null)}
          onConfirm={async (newStatus, proof) => {
            await onStatusChange(statusModalTask.id, newStatus, proof);
            setStatusModalTask(null);
          }}
        />
      )}

      <div className="overflow-hidden rounded-[18px] border border-[#EFF2F6] bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[#F8F9FC] text-left">
                {headers.map((heading) => (
                  <th
                    className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A99B0]"
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  className={[
                    'border-t border-[#EFF2F6] transition hover:bg-[#FBFCFE]',
                    onRowClick ? 'cursor-pointer' : ''
                  ].join(' ')}
                  key={task.id}
                  onClick={() => onRowClick?.(task)}
                >
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-[#1E293B]">{task.title}</p>
                      <p className="mt-1 text-xs text-[#8A99B0]">
                        {task.department?.name ?? task.departmentName ?? 'General'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#36506C]">
                    {task.assignedTo?.name ?? task.assignedToName ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div
                      className={[
                        'relative inline-flex min-w-[92px] items-center rounded-[10px] bg-[#F8F9FC] px-3 py-2 pl-4 text-xs font-semibold text-[#36506C] before:absolute before:bottom-1.5 before:left-1.5 before:top-1.5 before:w-[3px] before:rounded-full',
                        priorityStripe[task.priority]
                      ].join(' ')}
                    >
                      {formatLabel(task.priority)}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#36506C]">{formatLabel(getCadence(task))}</td>
                  <td className="px-4 py-3.5 text-sm text-[#36506C]">{formatDate(task.start_date)}</td>
                  <td className="px-4 py-3.5 text-sm text-[#36506C]">{formatDate(task.due_date)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[task.status]}>{formatLabel(task.status)}</Badge>
                      {task.status === 'COMPLETED' && !task.proof_path && (
                        <span
                          className="inline-flex items-center rounded-full bg-[#FFF1F1] px-2 py-0.5 text-[10px] font-semibold text-[#C13F3A]"
                          title="No proof uploaded for this completed task"
                        >
                          No proof
                        </span>
                      )}
                    </div>
                  </td>

                  {((typeof showActions === 'function' ? showActions(task) : Boolean(showActions))) && (
                    <td
                      className="px-4 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5">
                        {onStatusChange && (
                          <button
                            title="Change status"
                            onClick={() => setStatusModalTask(task)}
                            className="rounded-[8px] border border-[#DCE2EA] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#185FA5] transition hover:bg-[#EAF3FC]"
                          >
                            Status
                          </button>
                        )}
                        {onEdit && (
                          <button
                            title="Edit task"
                            onClick={() => onEdit(task)}
                            className="rounded-[8px] border border-[#DCE2EA] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#36506C] transition hover:bg-[#F3F6FA]"
                          >
                            Edit
                          </button>
                        )}
                        {onDelete && (
                          <button
                            title="Delete task"
                            onClick={() => onDelete(task.id)}
                            className="rounded-[8px] border border-[#FECDCA] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#C13F3A] transition hover:bg-[#FEF3F2]"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default TaskTable;
