/**
 * HRTaskTable — HR-specific task table with leave/recruitment quick links
 * and inline status-change capability (proof required for Completed).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Task, TaskStatus, TaskPriority } from '../../types/task.types';
import Badge from '../common/Badge';
import api from '../../services/api';

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

const ALL_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];

function StatusModal({
  task, onClose, onConfirm,
}: { task: Task; onClose: () => void; onConfirm: (s: TaskStatus, f?: File) => Promise<void>; }) {
  const [newStatus, setNewStatus] = useState<TaskStatus>(task.status);
  const [proof, setProof] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (newStatus === 'COMPLETED' && !proof) { setErr('Upload task proof for Completed status.'); return; }
    setSaving(true);
    try { await onConfirm(newStatus, proof); onClose(); }
    catch { setErr('Failed to update. Try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-xl">
        <h3 className="font-semibold text-[#1E293B]">Change Task Status</h3>
        <p className="mt-1 text-xs text-[#8A99B0] truncate">{task.title}</p>
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#36506C]">New Status</span>
          <select className="min-h-[38px] rounded-[10px] border border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none"
            value={newStatus} onChange={(e) => { setNewStatus(e.target.value as TaskStatus); setErr(null); }}>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
        {newStatus === 'COMPLETED' && (
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Task Proof <span className="text-red-500">*</span></span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx"
              className="min-h-[38px] rounded-[10px] border border-dashed border-[#C9D6E5] bg-[#F8F9FC] px-3 py-2 text-sm text-[#36506C] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
              onChange={(e) => { setProof(e.target.files?.[0]); setErr(null); }} />
          </label>
        )}
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="mt-5 flex gap-2">
          <button disabled={saving} onClick={handleConfirm}
            className="flex-1 rounded-[10px] bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F4880] disabled:opacity-60">
            {saving ? 'Saving…' : 'Confirm'}
          </button>
          <button onClick={onClose}
            className="rounded-[10px] border border-[#DCE2EA] px-4 py-2 text-sm font-semibold text-[#5B6E8C] hover:bg-[#F3F6FA]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface HRTaskTableProps {
  tasks: Task[];
  emptyMessage?: string;
  onStatusChange?: (taskId: number, newStatus: TaskStatus, proofFile?: File) => Promise<void>;
}

const HRTaskTable: React.FC<HRTaskTableProps> = ({ tasks, emptyMessage = 'No HR tasks found.', onStatusChange }) => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [modalTask, setModalTask] = useState<Task | null>(null);

  const { data: leaveData } = useQuery({
    queryKey: ['leave-requests', 'pending-count'],
    queryFn: async () => {
      const res = await api.get('/leave/requests', { params: { status: 'PENDING' } });
      return (res.data.data ?? res.data) as Array<{ id: number }>;
    },
  });
  const pendingLeave = leaveData?.length ?? 0;

  const filtered = tasks.filter((t) => {
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4">
      {modalTask && onStatusChange && (
        <StatusModal task={modalTask} onClose={() => setModalTask(null)}
          onConfirm={(s, f) => onStatusChange(modalTask.id, s, f)} />
      )}

      {/* Quick-action banners */}
      <div className="flex flex-wrap gap-3">
        <div onClick={() => navigate('/department/leave')}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition">
          🗓️ Pending Leave Requests
          {pendingLeave > 0 && (
            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs text-white">{pendingLeave}</span>
          )}
        </div>
        <div onClick={() => navigate('/department/recruitment')}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition">
          💼 Recruitment Pipeline →
        </div>
        <div onClick={() => navigate('/department/salary')}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition">
          💰 Salary Increments →
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[#E4EAF2] px-3 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none">
          <option value="ALL">All Statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[#EFF2F6] bg-white text-sm text-[#8A99B0]">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#EFF2F6] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Task', 'Priority', 'Status', 'Due Date', 'Assigned By', 'Cadence', ...(onStatusChange ? ['Actions'] : [])].map((h) => (
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
                  <td className="px-4 py-3 text-xs text-[#5B6E8C]">{(task as any).assignedBy?.name ?? '--'}</td>
                  <td className="px-4 py-3 text-xs text-[#5B6E8C]">{task.cadence ?? 'One-off'}</td>
                  {onStatusChange && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModalTask(task)}
                        className="rounded-[8px] border border-[#DCE2EA] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#185FA5] hover:bg-[#EAF3FC]">
                        Status
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HRTaskTable;
