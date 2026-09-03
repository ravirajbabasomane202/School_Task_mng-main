import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import TaskStatusPieChart from '../../components/charts/TaskStatusPieChart';
import TaskTable from '../../components/tables/TaskTable';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import api from '../../services/api';
import { updateTask } from '../../services/taskService';
import type { Task, TaskStatus } from '../../types/task.types';
import type { RootState } from '../../store';

interface DeptDashboardData {
  myTasks: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    delayed: number;
  };
  taskStatusData: { name: string; value: number; color: string }[];
  recentAnnouncements: {
    id: number;
    title: string;
    sentTo: string;
    date: string;
  }[];
  myTasksList: Task[];
}

interface UpdateStatusModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  task: Task | null;
  onUpdate: (taskId: number, status: TaskStatus, comment: string, proofFile?: File) => void;
}

const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({
  isOpen,
  isSubmitting,
  onClose,
  task,
  onUpdate
}) => {
  const [status, setStatus] = useState<TaskStatus>('PENDING');
  const [comment, setComment] = useState('');
  const [proofFile, setProofFile] = useState<File | undefined>();
  const [proofErr, setProofErr] = useState('');

  useEffect(() => {
    if (!task) { setStatus('PENDING'); setComment(''); setProofFile(undefined); setProofErr(''); return; }
    setStatus(task.status);
    setComment('');
    setProofFile(undefined);
    setProofErr('');
  }, [task]);

  const handleSubmit = () => {
    if (status === 'COMPLETED' && !proofFile) {
      setProofErr('Please upload task proof to mark as Completed.');
      return;
    }
    if (task) { onUpdate(task.id, status, comment, proofFile); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update Task Status"
      footer={
        <div className="flex justify-end space-x-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={isSubmitting} onClick={handleSubmit}>Update</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value as TaskStatus); setProofErr(''); }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="DELAYED">Delayed</option>
            <option value="ESCALATED">Escalated</option>
          </select>
        </div>
        {status === 'COMPLETED' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Task Proof <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-gray-400">(required for Completed)</span>
            </label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx"
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700"
              onChange={(e) => { setProofFile(e.target.files?.[0]); setProofErr(''); }} />
            {proofErr && <p className="mt-1 text-xs text-red-600">{proofErr}</p>}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Comment</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Add a comment..." />
        </div>
      </div>
    </Modal>
  );
};

const DeptOverview: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['dept-dashboard', user?.department_id],
    queryFn: async () => {
      const response = await api.get(`/dashboard/dept/${user?.department_id}`);
      return response.data.data as DeptDashboardData;
    },
    enabled: Boolean(user?.department_id)
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      taskId,
      status,
      comment,
      proofFile
    }: {
      taskId: number;
      status: TaskStatus;
      comment: string;
      proofFile?: File;
    }) => updateTask(taskId, { status, comment }, proofFile),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dept-dashboard', user?.department_id] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      setIsModalOpen(false);
      setSelectedTask(null);
      toast.success('Task status updated successfully.');
    },
    onError: () => {
      toast.error('Unable to update task status right now.');
    }
  });

  const handleUpdateStatus = (taskId: number, status: TaskStatus, comment: string, proofFile?: File) => {
    updateStatusMutation.mutate({ taskId, status, comment, proofFile });
  };

  const getAnnouncementBorderColor = (sentTo: string) => {
    return sentTo === 'ALL' ? 'border-blue-500' : 'border-amber-500';
  };

  if (isLoading || !data) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Department Dashboard</h1>
        <p className="text-gray-600">
          Welcome, {user?.name} - {user?.departmentName}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-500">My Tasks</h3>
          <p className="text-2xl font-bold text-gray-900">{data.myTasks.total}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-500">Pending</h3>
          <p className="text-2xl font-bold text-blue-600">{data.myTasks.pending}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-500">In Progress</h3>
          <p className="text-2xl font-bold text-amber-600">{data.myTasks.inProgress}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-500">Completed</h3>
          <p className="text-2xl font-bold text-green-600">{data.myTasks.completed}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-500">Delayed</h3>
          <p className="text-2xl font-bold text-red-600">{data.myTasks.delayed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Task Status Distribution</h3>
          <TaskStatusPieChart data={data.taskStatusData} />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Recent Announcements</h3>
          <div className="space-y-3">
            {data.recentAnnouncements.map((announcement) => (
              <div
                key={announcement.id}
                className={`border-l-4 py-2 pl-4 ${getAnnouncementBorderColor(
                  announcement.sentTo
                )}`}
              >
                <p className="text-sm font-medium">{announcement.title}</p>
                <p className="text-xs text-gray-500">
                  Sent to: {announcement.sentTo} | {announcement.date}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">My Tasks</h3>
          <p className="text-sm text-gray-500">Click a task row to update its status.</p>
        </div>
        <TaskTable
          tasks={data.myTasksList}
          onRowClick={(task) => {
            setSelectedTask(task);
            setIsModalOpen(true);
          }}
        />
      </div>

      <UpdateStatusModal
        isOpen={isModalOpen}
        isSubmitting={updateStatusMutation.isPending}
        onClose={() => setIsModalOpen(false)}
        task={selectedTask}
        onUpdate={handleUpdateStatus}
      />
    </div>
  );
};

export default DeptOverview;
