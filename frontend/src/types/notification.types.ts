export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'TASK_DELAYED'
  | 'TASK_ESCALATED'
  | 'ANNOUNCEMENT'
  | 'MEETING_SCHEDULED'
  | 'LEAVE_SUBMITTED'
  | 'LEAVE_PROCESSED'
  | 'RESUMPTION_SUBMITTED'
  | 'RESUMPTION_PROCESSED'
  | 'SALARY_UPDATE'
  | 'SALARY_SUBMITTED'
  | 'SALARY_PROCESSED';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  message: string;
  task_id: number | null;
  is_read: boolean;
  created_at: string;
}

export type AnnouncementTarget = 'ALL' | 'DEPARTMENT';

export interface Announcement {
  id: number;
  created_by: number;
  target: AnnouncementTarget;
  message: string;
  department_id: number | null;
  created_at: string;
  creator?: { id: number; name: string };
  department?: { id: number; name: string; description?: string | null };
}

export interface CreateAnnouncementPayload {
  message: string;
  target: AnnouncementTarget;
  department_id?: number;
}
