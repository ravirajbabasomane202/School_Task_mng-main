import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import type { Task, TaskStatus, UpdateTaskPayload } from '../../types/task.types';
import type { RootState } from '../../store';
import { getAllTasks, updateTask } from '../../services/taskService';
import { formatDate, isOverdue, daysUntil } from '../../utils/dateUtils';
import { formatStatus, getStatusBadgeClass, formatPriority, getPriorityBadgeClass } from '../../utils/formatUtils';

const STATUS_OPTIONS: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

function TaskUpdates() {
  const user = useSelector((state: RootState) => state.auth.user);
  const queryClient = useQueryClient();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newStatus, setNewStatus] = useState<TaskStatus>('IN_PROGRESS');
  const [comment, setComment] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  // Directors are ELEVATED_ROLES — the backend /my-tasks route only returns tasks directly
  // assigned to them, which is rarely used. Instead fetch all tasks: the backend
  // _task_scope_query already returns everything for CHAIRMAN/DIRECTOR.
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['director-tasks'],
    queryFn: () => getAllTasks()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload, file }: { id: number; payload: UpdateTaskPayload; file?: File }) =>
      updateTask(id, payload, file ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['director-tasks'] });
      setSelectedTask(null);
      setComment('');
      setAttachmentFile(null);
    },
    onError: () => toast.error('Failed to update task. Please try again.'),
  });

  const handleSubmitUpdate = () => {
    if (!selectedTask) return;
    updateMutation.mutate({
      id: selectedTask.id,
      payload: { status: newStatus, comment },
      file: attachmentFile ?? undefined
    });
  };

  const openModal = (task: Task) => {
    setSelectedTask(task);
    setNewStatus(task.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS');
    setComment('');
    setAttachmentFile(null);
  };

  const filtered = tasks.filter((t) => {
    const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus;
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex min-h-screen bg-[#F1F4F9] text-[#1E293B]">
      <Sidebar />
      <main className="custom-scrollbar ml-[196px] h-screen min-w-0 flex-1 overflow-y-auto">
        <Navbar />
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold">Task Updates</h1>
            <p className="text-gray-500 text-sm mt-1">
              View and update the status of all tasks across the organisation.
            </p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as TaskStatus | 'ALL')}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{formatStatus(s)}</option>
              ))}
              <option value="DELAYED">Delayed</option>
              <option value="ESCALATED">Escalated</option>
            </select>
            <span className="text-sm text-gray-500 ml-auto">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Task Cards */}
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading tasks…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No tasks found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((task) => {
                const days = daysUntil(task.due_date);
                const overdue = isOverdue(task.due_date) && task.status !== 'COMPLETED';
                return (
                  <div
                    key={task.id}
                    className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    {/* Title + priority */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-snug flex-1">{task.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityBadgeClass(task.priority)}`}>
                        {formatPriority(task.priority)}
                      </span>
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>
                    )}

                    {/* Status */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadgeClass(task.status)}`}>
                        {formatStatus(task.status)}
                      </span>
                      {overdue && (
                        <span className="text-xs text-red-600 font-medium">⚠ Overdue</span>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="text-xs text-gray-400 space-y-0.5">
                      <div>Assigned: <span className="text-gray-600">{formatDate(task.start_date)}</span></div>
                      <div className={overdue ? 'text-red-500 font-medium' : ''}>
                        Due: <span>{formatDate(task.due_date)}</span>
                        {days !== null && task.status !== 'COMPLETED' && (
                          <span className="ml-1">
                            ({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Update button */}
                    {task.status !== 'COMPLETED' && (
                      <button
                        onClick={() => openModal(task)}
                        className="mt-auto text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                      >
                        Update Status
                      </button>
                    )}
                    {task.status === 'COMPLETED' && (
                      <div className="mt-auto text-xs text-green-600 font-medium text-center py-1 bg-green-50 rounded-md">
                        ✓ Task Completed
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Update Modal */}
      {selectedTask && (
        <Modal
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          title={`Update: ${selectedTask.title}`}
        >
          <div className="space-y-4">
            {/* Current status */}
            <div className="text-sm text-gray-500">
              Current status:{' '}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(selectedTask.status)}`}>
                {formatStatus(selectedTask.status)}
              </span>
            </div>

            {/* New status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Status *</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add a progress note or remark…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Attachment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attachment (optional)</label>
              <input
                type="file"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {/* Error */}
            {updateMutation.isError && (
              <p className="text-sm text-red-600">Failed to update task. Please try again.</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitUpdate}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-60 transition-colors"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Update'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default TaskUpdates;
