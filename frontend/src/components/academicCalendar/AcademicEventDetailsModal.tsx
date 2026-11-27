import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { ROLE_LABELS, type Role } from '../../constants/roles';
import {
  completeAcademicEvent,
  downloadAcademicEventAttachment,
  getAcademicEventHistory,
  submitEventReason,
  updateEventApproval
} from '../../services/academicEventService';
import type { AcademicEvent, ApprovalStatus } from '../../types/academicEvent.types';
import { getApiErrorMessage } from '../../utils/apiError';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { APPROVAL_LABEL, WORKFLOW_BADGE, formatDisplayDate, formatDisplayDateTime, responsibleLabel } from './eventWorkflow';

interface AcademicEventDetailsModalProps {
  event: AcademicEvent | null;
  onClose: () => void;
  onDelete?: (event: AcademicEvent) => void;
  onEdit?: (event: AcademicEvent) => void;
  /** Signed-in user's id and whether they are a manager (Chairman-level). */
  currentUserId?: number | null;
  isManager?: boolean;
  /** Called with the refreshed event after any workflow update. */
  onEventChange?: (event: AcademicEvent) => void;
}

const CATEGORY_STYLE: Record<AcademicEvent['category'], string> = {
  ACADEMIC: 'bg-blue-100 text-blue-700',
  CELEBRATION: 'bg-purple-100 text-purple-700',
  EXAMINATION: 'bg-red-100 text-red-700',
  HOLIDAY: 'bg-green-100 text-green-700',
  MEETING: 'bg-amber-100 text-amber-700',
  SPORTS: 'bg-cyan-100 text-cyan-700',
  OTHER: 'bg-gray-100 text-gray-700'
};

const textareaClass =
  'w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none';

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[#8A99B0]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-[#1E293B]">{children}</dd>
    </div>
  );
}

function AcademicEventDetailsModal({
  event,
  onClose,
  onDelete,
  onEdit,
  currentUserId,
  isManager = false,
  onEventChange
}: AcademicEventDetailsModalProps) {
  const queryClient = useQueryClient();
  const [isDownloading, setIsDownloading] = useState(false);
  const [panel, setPanel] = useState<'none' | 'reason' | 'complete' | 'approval'>('none');
  const [showHistory, setShowHistory] = useState(false);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [completionDate, setCompletionDate] = useState(todayKey());
  const [approval, setApproval] = useState<ApprovalStatus>('PENDING');
  const [approvalRemarks, setApprovalRemarks] = useState('');

  const canUpdate = Boolean(
    event && (isManager || (event.responsible_user_id !== null && event.responsible_user_id === currentUserId))
  );

  const historyQuery = useQuery({
    queryKey: ['academic-events', 'history', event?.id],
    queryFn: () => getAcademicEventHistory(event!.id),
    enabled: Boolean(event) && showHistory
  });

  const reset = () => {
    setPanel('none');
    setReason('');
    setRemarks('');
    setCompletionDate(todayKey());
    setApproval('PENDING');
    setApprovalRemarks('');
  };

  const afterUpdate = async (updated: AcademicEvent, message: string) => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: ['academic-events'] });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    onEventChange?.(updated);
    reset();
  };

  const reasonMutation = useMutation({
    mutationFn: () => submitEventReason(event!.id, reason),
    onSuccess: (updated) => afterUpdate(updated, 'Reason submitted'),
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to submit the reason'))
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      completeAcademicEvent(event!.id, {
        remarks,
        actual_completion_date: completionDate,
        // a reason typed earlier in this form is only needed when completing late without one on record
        reason: event!.non_completion_reason ? undefined : reason || undefined,
        approval_status: approval,
        approval_remarks: approvalRemarks || undefined
      }),
    onSuccess: (updated) => afterUpdate(updated, 'Event marked as completed'),
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to save the completion update'))
  });

  const approvalMutation = useMutation({
    mutationFn: () => updateEventApproval(event!.id, approval, approvalRemarks || undefined),
    onSuccess: (updated) => afterUpdate(updated, 'Management approval updated'),
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to update the approval'))
  });

  const handleDownload = async () => {
    if (!event?.attachment_filename) return;
    setIsDownloading(true);
    try {
      await downloadAcademicEventAttachment(event.id, event.attachment_filename);
    } catch {
      toast.error('Unable to download this event attachment');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    reset();
    setShowHistory(false);
    onClose();
  };

  const completed = event?.completion_status === 'COMPLETED';
  const needsReason = Boolean(event?.is_overdue && !event?.non_completion_reason && !completed);
  const reasonRequiredForCompletion = Boolean(event?.is_overdue && !event?.non_completion_reason);

  return (
    <Modal isOpen={Boolean(event)} onClose={handleClose} title={event?.title ?? 'Event details'}>
      {event && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CATEGORY_STYLE[event.category]}`}>
              {event.category}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${WORKFLOW_BADGE[event.workflow_status]}`}
              data-testid="event-workflow-status"
            >
              {event.workflow_label}
            </span>
            <span className="text-sm text-[#5B6E8C]">
              {formatDisplayDate(event.start_date)}
              {event.end_date !== event.start_date ? ` – ${formatDisplayDate(event.end_date)}` : ''}
              {' · '}{event.start_time}–{event.end_time}
            </span>
          </div>
          {event.location && (
            <p className="flex items-center gap-2 text-sm text-[#5B6E8C]">
              <MapPin aria-hidden="true" size={16} /> {event.location}
            </p>
          )}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8A99B0]">Description</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#1E293B]">
              {event.description || 'No description provided.'}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8A99B0]">Target Audience</h3>
            <p className="mt-1 text-sm text-[#1E293B]">
              {event.target_audience.includes('ALL')
                ? 'All users'
                : event.target_audience.map((role) => ROLE_LABELS[role as Role] ?? role).join(', ')}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-3 rounded-xl border border-[#EFF2F6] bg-[#FAFBFD] p-3 sm:grid-cols-2" data-testid="event-workflow-details">
            <Field label="Responsible Person">{responsibleLabel(event)}</Field>
            <Field label="Completion Status">{completed ? 'Completed' : event.is_overdue ? 'Not completed (overdue)' : 'Not completed'}</Field>
            {(event.original_start_date !== event.start_date || event.original_start_time !== event.start_time) && (
              <Field label="Originally Scheduled">
                {formatDisplayDate(event.original_start_date)} {event.original_start_time}
              </Field>
            )}
            {event.non_completion_reason && (
              <div className="sm:col-span-2">
                <Field label="Reason for Not Completing on Schedule">{event.non_completion_reason}</Field>
                <p className="mt-0.5 text-xs text-[#8A99B0]">
                  {event.reason_submitted_by_name ? `By ${event.reason_submitted_by_name}` : ''}
                  {event.reason_submitted_at ? ` · ${formatDisplayDateTime(event.reason_submitted_at)}` : ''}
                </p>
              </div>
            )}
            {completed && (
              <>
                <Field label="Completed By">{event.completed_by_name ?? '—'}</Field>
                <Field label="Actual Completion Date">{formatDisplayDate(event.actual_completion_date)}</Field>
                <div className="sm:col-span-2">
                  <Field label="Completion Remarks">{event.completion_remarks || '—'}</Field>
                </div>
                <Field label="Management Approval">{APPROVAL_LABEL[event.approval_status]}</Field>
                {event.approval_remarks && <Field label="Approval Remarks">{event.approval_remarks}</Field>}
                {event.approval_updated_by_name && (
                  <p className="text-xs text-[#8A99B0] sm:col-span-2">
                    Approval recorded by {event.approval_updated_by_name} · {formatDisplayDateTime(event.approval_updated_at)}
                  </p>
                )}
              </>
            )}
          </dl>

          {needsReason && canUpdate && panel === 'none' && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              This event was scheduled for {formatDisplayDate(event.end_date)} and has not been completed. Please explain why.
            </div>
          )}

          {canUpdate && !completed && panel === 'none' && (
            <div className="flex flex-wrap gap-2">
              {event.is_overdue && (
                <Button onClick={() => setPanel('reason')} size="sm" variant={needsReason ? 'primary' : 'ghost'}>
                  {event.non_completion_reason ? 'Update Reason' : 'Submit Reason'}
                </Button>
              )}
              <Button onClick={() => setPanel('complete')} size="sm">Mark as Completed</Button>
            </div>
          )}
          {canUpdate && completed && panel === 'none' && (
            <Button
              onClick={() => {
                setApproval(event.approval_status);
                setApprovalRemarks(event.approval_remarks ?? '');
                setPanel('approval');
              }}
              size="sm"
              variant="ghost"
            >
              Update Management Approval
            </Button>
          )}

          {panel === 'reason' && (
            <form
              className="space-y-3 rounded-xl border border-[#E4EAF2] p-3"
              onSubmit={(e) => { e.preventDefault(); reasonMutation.mutate(); }}
            >
              <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="event-reason">
                Why was the event not completed as scheduled? *
              </label>
              <textarea className={textareaClass} id="event-reason" maxLength={5000} onChange={(e) => setReason(e.target.value)} required rows={3} value={reason} />
              <div className="flex gap-2">
                <Button onClick={reset} size="sm" type="button" variant="ghost">Cancel</Button>
                <Button disabled={!reason.trim()} loading={reasonMutation.isPending} size="sm" type="submit">Submit Reason</Button>
              </div>
            </form>
          )}

          {panel === 'complete' && (
            <form
              className="space-y-3 rounded-xl border border-[#E4EAF2] p-3"
              onSubmit={(e) => { e.preventDefault(); completeMutation.mutate(); }}
            >
              <h3 className="text-sm font-semibold text-[#1E293B]">Event Completion Update</h3>
              {reasonRequiredForCompletion && (
                <div>
                  <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="complete-reason">
                    Reason it was not completed on schedule *
                  </label>
                  <textarea className={textareaClass} id="complete-reason" maxLength={5000} onChange={(e) => setReason(e.target.value)} required rows={2} value={reason} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="complete-date">Actual Completion Date *</label>
                <input className={textareaClass} id="complete-date" max={todayKey()} onChange={(e) => setCompletionDate(e.target.value)} required type="date" value={completionDate} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="complete-remarks">Event Completion Remarks</label>
                <textarea className={textareaClass} id="complete-remarks" maxLength={5000} onChange={(e) => setRemarks(e.target.value)} rows={3} value={remarks} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="complete-approval">Management Approval</label>
                <select className={textareaClass} id="complete-approval" onChange={(e) => setApproval(e.target.value as ApprovalStatus)} value={approval}>
                  <option value="PENDING">Pending</option>
                  <option value="YES">Yes — approval received</option>
                  <option value="NO">No — not approved</option>
                </select>
                <p className="mt-1 text-xs text-[#8A99B0]">Approval is recorded separately from completion and stays Pending unless you change it.</p>
              </div>
              {approval !== 'PENDING' && (
                <div>
                  <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="complete-approval-remarks">Approval Remarks</label>
                  <textarea className={textareaClass} id="complete-approval-remarks" maxLength={5000} onChange={(e) => setApprovalRemarks(e.target.value)} rows={2} value={approvalRemarks} />
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={reset} size="sm" type="button" variant="ghost">Cancel</Button>
                <Button loading={completeMutation.isPending} size="sm" type="submit">Save Completion</Button>
              </div>
            </form>
          )}

          {panel === 'approval' && (
            <form
              className="space-y-3 rounded-xl border border-[#E4EAF2] p-3"
              onSubmit={(e) => { e.preventDefault(); approvalMutation.mutate(); }}
            >
              <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="approval-status">Management Approval</label>
              <select className={textareaClass} id="approval-status" onChange={(e) => setApproval(e.target.value as ApprovalStatus)} value={approval}>
                <option value="PENDING">Pending</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
              </select>
              <label className="block text-xs font-medium text-[#5B6E8C]" htmlFor="approval-remarks">Approval Remarks</label>
              <textarea className={textareaClass} id="approval-remarks" maxLength={5000} onChange={(e) => setApprovalRemarks(e.target.value)} rows={2} value={approvalRemarks} />
              <div className="flex gap-2">
                <Button onClick={reset} size="sm" type="button" variant="ghost">Cancel</Button>
                <Button loading={approvalMutation.isPending} size="sm" type="submit">Save Approval</Button>
              </div>
            </form>
          )}

          {event.has_attachment && event.attachment_filename && (
            <Button loading={isDownloading} onClick={() => void handleDownload()} size="sm" variant="ghost">
              <Download aria-hidden="true" size={15} />
              Download {event.attachment_filename}
            </Button>
          )}

          <div>
            <button
              aria-expanded={showHistory}
              className="text-sm font-medium text-[#185FA5] hover:underline"
              onClick={() => setShowHistory((current) => !current)}
              type="button"
            >
              {showHistory ? 'Hide event history' : 'Show event history'}
            </button>
            {showHistory && (
              <div className="mt-2" data-testid="event-history">
                {historyQuery.isLoading ? (
                  <p className="text-sm text-[#8A99B0]">Loading history…</p>
                ) : historyQuery.isError ? (
                  <p className="text-sm text-red-600">Unable to load the event history.</p>
                ) : (
                  <ol className="space-y-2 border-l-2 border-[#E4EAF2] pl-3">
                    {(historyQuery.data ?? []).map((entry, index) => (
                      <li key={entry.id ?? `legacy-${index}`}>
                        <p className="text-sm text-[#1E293B]">{entry.summary}</p>
                        <p className="text-xs text-[#8A99B0]">
                          {entry.user_name ?? 'System'} · {formatDisplayDateTime(entry.created_at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>

          {(onEdit || onDelete) && (
            <div className="flex flex-col-reverse gap-2 border-t border-[#EFF2F6] pt-4 sm:flex-row sm:justify-end">
              <Button onClick={handleClose} variant="ghost">Close</Button>
              {onDelete && (
                <Button onClick={() => onDelete(event)} variant="danger">Delete Event</Button>
              )}
              {onEdit && (
                <Button onClick={() => onEdit(event)}>Edit Event</Button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default AcademicEventDetailsModal;
