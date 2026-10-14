/**
 * AdmissionTaskTable — Admission department task table with approval
 * quick-links and inline status-change capability.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Task, TaskStatus, TaskPriority } from '../../types/task.types';
import Badge from '../common/Badge';
import {
  ALL_TASK_STATUSES,
  ASSIGNEE_STATUS_HINT,
  getAllowedStatuses,
  getStatusErrorMessage,
  isTaskAssignee
} from '../../utils/taskStatus';
import api from '../../services/api';

import Modal from '../common/Modal';
import ResponsiveTable from '../common/ResponsiveTable';
import { useIsMobile } from '../../hooks/useMediaQuery';
const statusVariant: Record<TaskStatus, 'blue' | 'amber' | 'green' | 'red' | 'gray'> = {
  PENDING: 'blue', IN_PROGRESS: 'amber', COMPLETED: 'green', DELAYED: 'red', ESCALATED: 'gray',
};

const priorityColor: Record<TaskPriority, string> = {
  HIGH: 'text-red-600 bg-red-50',
  MEDIUM: 'text-amber-600 bg-amber-50',
  LOW: 'text-green-600 bg-green-50',
};

const fmt = (v?: string | null) => {
  if (!v) return '--';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Filter dropdown only (viewing) - the modal uses getAllowedStatuses.
const FILTER_STATUSES = ALL_TASK_STATUSES;

function StatusModal({
  task, onClose, onConfirm, availableStatuses, showAssigneeHint,
}: {
  task: Task; onClose: () => void; onConfirm: (s: TaskStatus, f?: File) => Promise<void>;
  availableStatuses: TaskStatus[]; showAssigneeHint: boolean;
}) {
  const [newStatus, setNewStatus] = useState<TaskStatus>(
    availableStatuses.includes(task.status) ? task.status : availableStatuses[0]
  );
  const [proof, setProof] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (newStatus === 'COMPLETED' && !proof) { setErr('Upload task proof for Completed status.'); return; }
    setSaving(true);
    try { await onConfirm(newStatus, proof); onClose(); }
    catch (e) { setErr(getStatusErrorMessage(e, 'Failed to update. Try again.')); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#DCE2EA] px-4 py-2 text-sm font-semibold text-[#5B6E8C] hover:bg-[#F3F6FA] sm:min-h-0">
            Cancel
          </button>
          <button disabled={saving} onClick={handleConfirm}
            className="min-h-[44px] flex-1 rounded-[10px] bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F4880] disabled:opacity-60 sm:min-h-0">
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      }
      isOpen
      onClose={onClose}
      title="Change Task Status"
    >
      <p className="truncate text-xs text-[#8A99B0]">{task.title}</p>
      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#36506C]">New Status</span>
        <select className="min-h-[44px] rounded-[10px] border border-[#DCE2EA] bg-[#F8F9FC] px-3 text-base text-[#1E293B] outline-none sm:min-h-[38px] sm:text-sm"
          value={newStatus} onChange={(e) => { setNewStatus(e.target.value as TaskStatus); setErr(null); }}>
          {availableStatuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </label>
      {showAssigneeHint && <p className="mt-2 text-[11px] text-[#8A99B0]">{ASSIGNEE_STATUS_HINT}</p>}
      {newStatus === 'COMPLETED' && (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#36506C]">Task Proof <span className="text-red-500">*</span></span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx"
            className="min-h-[38px] w-full min-w-0 rounded-[10px] border border-dashed border-[#C9D6E5] bg-[#F8F9FC] px-3 py-2 text-sm text-[#36506C] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
            onChange={(e) => { setProof(e.target.files?.[0]); setErr(null); }} />
        </label>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </Modal>
  );
}

interface AdmissionTaskTableProps {
  tasks: Task[];
  emptyMessage?: string;
  onStatusChange?: (taskId: number, newStatus: TaskStatus, proofFile?: File) => Promise<void>;
  currentUserId?: number | null;
}

const AdmissionTaskTable: React.FC<AdmissionTaskTableProps> = ({
  tasks,
  emptyMessage = 'No admission tasks found.',
  onStatusChange,
  currentUserId,
}) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [modalTask, setModalTask] = useState<Task | null>(null);

  const { data: approvalData } = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: async () => {
      const res = await api.get('/approvals', { params: { status: 'PENDING' } });
      return (res.data.data ?? res.data) as Array<{ id: number }>;
    },
  });
  const pendingApprovals = approvalData?.length ?? 0;

  const filtered = tasks.filter((t) => {
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchPriority && matchSearch;
  });

  return (
    <div className="space-y-4">
      {modalTask && onStatusChange && (
        <StatusModal task={modalTask} onClose={() => setModalTask(null)}
          availableStatuses={getAllowedStatuses(modalTask, currentUserId)}
          showAssigneeHint={isTaskAssignee(modalTask, currentUserId)}
          onConfirm={(s, f) => onStatusChange(modalTask.id, s, f)} />
      )}

      {/* Quick actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        <div onClick={() => navigate('/department/approvals')}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition">
          📝 Pending Approvals
          {pendingApprovals > 0 && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{pendingApprovals}</span>
          )}
        </div>
        <div onClick={() => navigate('/department/recruitment')}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition">
          🎓 Admission Pipeline →
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 [&>input]:w-full [&>select]:w-full sm:[&>input]:w-auto sm:[&>select]:w-auto">
        <input type="text" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[#E4EAF2] px-3 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none">
          <option value="ALL">All Statuses</option>
          {FILTER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none">
          <option value="ALL">All Priorities</option>
          {(['HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[#EFF2F6] bg-white text-sm text-[#8A99B0]">
          {emptyMessage}
        </div>
      ) : isMobile ? (
        <ul className="space-y-3" data-testid="task-card-list">
          {filtered.map((task) => (
            <li key={task.id} onClick={() => navigate(`/task/${task.id}`)}
              className="cursor-pointer rounded-[14px] border border-[#EFF2F6] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold text-[#1E293B]">{task.title}</p>
                <Badge variant={statusVariant[task.status as TaskStatus]}>{task.status.replace('_', ' ')}</Badge>
              </div>
              {task.description && <p className="mt-1 line-clamp-2 text-xs text-[#8A99B0]">{task.description}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-[#8A99B0]">Priority</dt>
                  <dd><span className={`rounded-md px-2 py-0.5 font-medium ${priorityColor[task.priority as TaskPriority]}`}>{task.priority}</span></dd></div>
                <div><dt className="text-[#8A99B0]">Due Date</dt><dd className="text-[#36506C]">{fmt(task.due_date)}</dd></div>
                <div className="min-w-0"><dt className="text-[#8A99B0]">Assign Date</dt><dd className="truncate text-[#36506C]">{fmt(task.start_date)}</dd></div>
                <div><dt className="text-[#8A99B0]">Cadence</dt><dd className="text-[#36506C]">{task.cadence ?? 'One-off'}</dd></div>
              </dl>
              {onStatusChange && getAllowedStatuses(task, currentUserId).length > 0 && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setModalTask(task)}
                    className="min-h-[40px] w-full rounded-[8px] border border-[#DCE2EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#185FA5] hover:bg-[#EAF3FC]">
                    Status
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#EFF2F6] bg-white">
          <ResponsiveTable minWidth={640}>
            <table className="w-full text-sm">
              <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
                <tr>
                  {['Task', 'Priority', 'Status', 'Due Date', 'Assign Date', 'Cadence', ...(onStatusChange ? ['Actions'] : [])].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F9]">
                {filtered.map((task) => (
                  <tr key={task.id} onClick={() => navigate(`/task/${task.id}`)}
                    className="cursor-pointer hover:bg-[#F8F9FC] transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1E293B] truncate max-w-[220px]">{task.title}</p>
                      {task.description && <p className="text-xs text-[#8A99B0] truncate max-w-[220px]">{task.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${priorityColor[task.priority as TaskPriority]}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[task.status as TaskStatus]}>{task.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#5B6E8C]">{fmt(task.due_date)}</td>
                    <td className="px-4 py-3 text-xs text-[#5B6E8C]">{fmt(task.start_date)}</td>
                    <td className="px-4 py-3 text-xs text-[#5B6E8C]">{task.cadence ?? 'One-off'}</td>
                    {onStatusChange && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {getAllowedStatuses(task, currentUserId).length > 0 && (
                        <button onClick={() => setModalTask(task)}
                          className="rounded-[8px] border border-[#DCE2EA] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#185FA5] hover:bg-[#EAF3FC]">
                          Status
                        </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
};

export default AdmissionTaskTable;
