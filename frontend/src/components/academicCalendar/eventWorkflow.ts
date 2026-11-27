import type { AcademicEvent, ApprovalStatus, WorkflowStatus } from '../../types/academicEvent.types';

export const WORKFLOW_BADGE: Record<WorkflowStatus, string> = {
  PLANNED: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_COMPLETION: 'bg-orange-50 text-orange-700 border-orange-200',
  REASON_REQUIRED: 'bg-red-50 text-red-700 border-red-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  AWAITING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NOT_APPROVED: 'bg-rose-50 text-rose-700 border-rose-200',
  NOT_TRACKED: 'bg-gray-50 text-gray-600 border-gray-200'
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  PENDING: 'Pending',
  YES: 'Yes',
  NO: 'No'
};

/** "Name (Head Type)" for a responsible person, or an em dash. */
export function responsibleLabel(event: Pick<AcademicEvent, 'responsible_name' | 'responsible_head_type'>): string {
  if (!event.responsible_name) return '—';
  return event.responsible_head_type ? `${event.responsible_name} (${event.responsible_head_type})` : event.responsible_name;
}

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Whether the event shows any completion / approval information worth listing. */
export function hasWorkflowInfo(event: AcademicEvent): boolean {
  return Boolean(
    event.responsible_user_id || event.non_completion_reason || event.completion_status === 'COMPLETED'
  );
}
