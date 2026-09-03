export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'ESCALATED';
export type TaskCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface TaskUserSummary {
  id: number;
  name: string;
  email?: string;
  role?: string;
  department_id?: number | null;
}

export interface TaskDepartmentSummary {
  id: number;
  name: string;
  description?: string | null;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  assigned_by: number;
  assigned_to: number;
  department_id: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  cadence?: TaskCadence | null;
  start_date: string;
  due_date: string;
  attachment_path: string | null;
  proof_path: string | null;
  completed_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  assignedBy?: TaskUserSummary;
  assignedTo?: TaskUserSummary;
  department?: TaskDepartmentSummary;
  history?: TaskHistory[];
  assignedByName?: string;
  assignedToName?: string;
  departmentName?: string;
}

export interface TaskHistory {
  id: number;
  task_id: number;
  updated_by: number;
  old_status: TaskStatus | null;
  new_status: TaskStatus;
  comment: string | null;
  updated_at: string;
  updatedBy?: TaskUserSummary;
  updatedByName?: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigned_to: number;
  department_id?: number | null;
  priority: TaskPriority;
  cadence?: TaskCadence;
  start_date: string;
  due_date: string;
  attachment?: File;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  assigned_to?: number;
  department_id?: number | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  cadence?: TaskCadence;
  start_date?: string;
  due_date?: string;
  completed_at?: string | null;
  comment?: string;
}

export interface TaskFilters {
  status?: TaskStatus | 'ALL' | `${TaskStatus},${TaskStatus}` | string;
  priority?: TaskPriority | 'ALL';
  department_id?: number | null;
  assigned_to?: number | null;
  search?: string;
  from?: string;
  to?: string;
}
