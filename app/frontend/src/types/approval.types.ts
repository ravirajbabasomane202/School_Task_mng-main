export type ApprovalType =
  | 'BUDGET'
  | 'PURCHASE'
  | 'POLICY'
  | 'EVENT'
  | 'SALARY'
  | 'LEAVE'
  | 'PROPERTY'
  | 'IT'
  | 'TRANSPORT';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface UserSummary {
  id: number;
  name: string;
  email?: string;
  role: string;
}

export interface Approval {
  id: number;
  type: ApprovalType;
  title: string;
  details?: string;
  amount?: string | number;
  status: ApprovalStatus;
  requested_by: number;
  approved_by?: number;
  created_at: string;
  requestedBy?: UserSummary;
  approvedBy?: UserSummary;
}

export interface CreateApprovalPayload {
  type: ApprovalType;
  title: string;
  details?: string;
  amount?: number;
}

export const APPROVAL_TYPE_META: Record<ApprovalType, { label: string; bg: string }> = {
  BUDGET:    { label: 'Budget Request',        bg: 'bg-blue-50 text-blue-700' },
  PURCHASE:  { label: 'Purchase Order',         bg: 'bg-green-50 text-green-700' },
  POLICY:    { label: 'Policy Change',          bg: 'bg-purple-50 text-purple-700' },
  EVENT:     { label: 'Event Approval',         bg: 'bg-amber-50 text-amber-700' },
  SALARY:    { label: 'Salary Adjustment',      bg: 'bg-cyan-50 text-cyan-700' },
  LEAVE:     { label: 'Leave Override',         bg: 'bg-emerald-50 text-emerald-700' },
  PROPERTY:  { label: 'Property / Maintenance', bg: 'bg-orange-50 text-orange-700' },
  IT:        { label: 'IT Equipment',           bg: 'bg-indigo-50 text-indigo-700' },
  TRANSPORT: { label: 'Transport Request',      bg: 'bg-teal-50 text-teal-700' },
};
