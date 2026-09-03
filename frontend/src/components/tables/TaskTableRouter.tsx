/**
 * TaskTableRouter — renders the role-specific task table for the
 * "My Tasks" page. Falls back to the generic TaskTable for roles
 * without a dedicated variant.
 * All variants receive the onStatusChange prop so every user can
 * update task status (with proof upload required for Completed).
 */
import React, { lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { Task, TaskStatus } from '../../types/task.types';
import type { RootState } from '../../store';
import TaskTable from './TaskTable';

const HRTaskTable        = lazy(() => import('./HRTaskTable'));
const AdmissionTaskTable = lazy(() => import('./AdmissionTaskTable'));

const Spinner = () => (
  <div className="flex h-40 items-center justify-center">
    <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-blue-600" />
  </div>
);

interface TaskTableRouterProps {
  tasks: Task[];
  emptyMessage?: string;
  onStatusChange?: (taskId: number, newStatus: TaskStatus, proofFile?: File) => Promise<void>;
}

const TaskTableRouter: React.FC<TaskTableRouterProps> = ({ tasks, emptyMessage, onStatusChange }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  const navigate = useNavigate();

  switch (user?.role) {
    case 'HR':
      return (
        <Suspense fallback={<Spinner />}>
          <HRTaskTable
            tasks={tasks}
            emptyMessage={emptyMessage}
            onStatusChange={onStatusChange}
          />
        </Suspense>
      );
    case 'ADMISSION':
      return (
        <Suspense fallback={<Spinner />}>
          <AdmissionTaskTable
            tasks={tasks}
            emptyMessage={emptyMessage}
            onStatusChange={onStatusChange}
          />
        </Suspense>
      );
    default:
      return (
        <TaskTable
          tasks={tasks}
          emptyMessage={emptyMessage}
          onRowClick={(t) => navigate(`/task/${t.id}`)}
          onStatusChange={onStatusChange}
        />
      );
  }
};

export default TaskTableRouter;
