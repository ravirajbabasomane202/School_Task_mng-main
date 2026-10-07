export type LeaveType = 'SICK' | 'CASUAL' | 'ANNUAL' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface UserSummary {
  id: number;
  name: string;
  role: string;
}

export interface LeaveRequest {
  id: number;
  user_id: number;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason?: string;
  status: LeaveStatus;
  reviewed_by?: number;
  reviewed_at?: string;
  review_comment?: string;
  created_at: string;
  applicant?: UserSummary;
  reviewer?: UserSummary;
}

export interface ResumptionRequest {
  id: number;
  user_id: number;
  resumption_date: string;
  notes?: string;
  status: LeaveStatus;
  reviewed_by?: number;
  reviewed_at?: string;
  created_at: string;
  applicant?: UserSummary;
  reviewer?: UserSummary;
}

export interface CreateLeavePayload {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason?: string;
}

export interface CreateResumptionPayload {
  resumption_date: string;
  notes?: string;
}

export interface ProcessLeavePayload {
  status: 'APPROVED' | 'REJECTED';
  comment?: string;
}
