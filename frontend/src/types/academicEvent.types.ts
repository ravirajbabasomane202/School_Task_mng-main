export const ACADEMIC_EVENT_CATEGORIES = [
  'ACADEMIC',
  'CELEBRATION',
  'EXAMINATION',
  'HOLIDAY',
  'MEETING',
  'SPORTS',
  'OTHER'
] as const;

export type AcademicEventCategory = (typeof ACADEMIC_EVENT_CATEGORIES)[number];

export type WorkflowStatus =
  | 'PLANNED'
  | 'PENDING_COMPLETION'
  | 'REASON_REQUIRED'
  | 'COMPLETED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'NOT_APPROVED'
  | 'NOT_TRACKED';

export type ApprovalStatus = 'PENDING' | 'YES' | 'NO';

export interface AcademicEvent {
  id: number;
  title: string;
  description: string | null;
  category: AcademicEventCategory;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  target_audience: string[];
  attachment_filename: string | null;
  has_attachment: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  responsible_user_id: number | null;
  responsible_name: string | null;
  responsible_head_type: string | null;
  completion_status: 'PENDING' | 'COMPLETED';
  workflow_status: WorkflowStatus;
  workflow_label: string;
  is_overdue: boolean;
  non_completion_reason: string | null;
  reason_submitted_by_name: string | null;
  reason_submitted_at: string | null;
  completed_by: number | null;
  completed_by_name: string | null;
  actual_completion_date: string | null;
  completion_remarks: string | null;
  approval_status: ApprovalStatus;
  approval_remarks: string | null;
  approval_updated_by_name: string | null;
  approval_updated_at: string | null;
  original_start_date: string;
  original_start_time: string;
}

export interface AcademicEventHistoryEntry {
  id: number | null;
  event_id: number;
  action: string;
  summary: string;
  user_id: number | null;
  user_name: string | null;
  created_at: string | null;
}

export interface CompleteEventPayload {
  remarks?: string;
  actual_completion_date?: string;
  reason?: string;
  approval_status: ApprovalStatus;
  approval_remarks?: string;
}

export interface AcademicEventFilters {
  start?: string;
  end?: string;
  upcoming?: boolean;
}

export interface AcademicEventForm {
  title: string;
  description: string;
  category: AcademicEventCategory;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location: string;
  target_audience: string[];
  responsible_user_id: string;
  attachment?: File;
}
