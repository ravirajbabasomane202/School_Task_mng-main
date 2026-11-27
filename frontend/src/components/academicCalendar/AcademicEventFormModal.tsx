import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import type { AcademicEvent, AcademicEventForm } from '../../types/academicEvent.types';
import { ACADEMIC_EVENT_CATEGORIES } from '../../types/academicEvent.types';
import { getAllUsers } from '../../services/userService';
import Button from '../common/Button';
import Modal from '../common/Modal';

interface AcademicEventFormModalProps {
  event: AcademicEvent | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (form: AcademicEventForm) => void;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialForm(event: AcademicEvent | null): AcademicEventForm {
  const today = localDateKey(new Date());
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    category: event?.category ?? 'ACADEMIC',
    start_date: event?.start_date ?? today,
    end_date: event?.end_date ?? today,
    start_time: event?.start_time ?? '09:00',
    end_time: event?.end_time ?? '10:00',
    location: event?.location ?? '',
    target_audience: event?.target_audience ?? ['ALL'],
    responsible_user_id: event?.responsible_user_id ? String(event.responsible_user_id) : ''
  };
}

const ACCEPTED_ATTACHMENT_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function AcademicEventFormModal({
  event,
  isOpen,
  isSaving,
  onClose,
  onSubmit
}: AcademicEventFormModalProps) {
  const [form, setForm] = useState<AcademicEventForm>(() => initialForm(event));
  const [attachmentError, setAttachmentError] = useState('');
  const [formError, setFormError] = useState('');
  const usersQuery = useQuery({ queryKey: ['users', 'for-event-form'], queryFn: () => getAllUsers(), enabled: isOpen });
  const responsibleOptions = useMemo(() => {
    const active = (usersQuery.data ?? []).filter((candidate) => candidate.is_active);
    // keep a since-deactivated assignee visible when editing an existing event
    const current = event?.responsible_user_id;
    const extra = current && !active.some((candidate) => candidate.id === current)
      ? [{ id: current, label: `${event?.responsible_name ?? 'Unknown'} (inactive)` }]
      : [];
    return [
      ...active.map((candidate) => ({
        id: candidate.id,
        label: candidate.head_type?.trim() ? `${candidate.name} — ${candidate.head_type.trim()}` : candidate.name
      })),
      ...extra
    ];
  }, [usersQuery.data, event]);

  useEffect(() => {
    setForm(initialForm(event));
    setAttachmentError('');
    setFormError('');
  }, [event, isOpen]);

  const updateForm = <K extends keyof AcademicEventForm>(key: K, value: AcademicEventForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleAudienceToggle = (role: string, checked: boolean) => {
    const audience = form.target_audience.filter((entry) => entry !== 'ALL');
    if (role === 'ALL') {
      updateForm('target_audience', checked ? ['ALL'] : []);
    } else {
      const selected = checked ? [...audience, role] : audience.filter((entry) => entry !== role);
      updateForm('target_audience', selected);
    }
  };

  const handleAttachment = (file?: File) => {
    setAttachmentError('');
    if (!file) {
      updateForm('attachment', undefined);
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ACCEPTED_ATTACHMENT_TYPES.split(',').includes(`.${extension}`)) {
      updateForm('attachment', undefined);
      setAttachmentError('Choose a supported document or image file.');
      return;
    }
    if (file.size === 0 || file.size > MAX_ATTACHMENT_SIZE) {
      updateForm('attachment', undefined);
      setAttachmentError('Attachment must be non-empty and 10 MB or smaller.');
      return;
    }
    updateForm('attachment', file);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.target_audience.length) {
      setAttachmentError('Select at least one target audience.');
      return;
    }
    if (!event && !form.responsible_user_id) {
      setFormError('Select the person responsible for this event.');
      return;
    }
    setFormError('');
    onSubmit(form);
  };

  const audienceOptions = [
    ['ALL', 'All users'],
    ...Object.values(ROLES).map((role) => [role, ROLE_LABELS[role]] as [string, string])
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? 'Edit Academic Event' : 'Add Academic Event'}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-title">Event Title *</label>
          <input
            autoComplete="off"
            className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            id="event-title"
            maxLength={255}
            onChange={(e) => updateForm('title', e.target.value)}
            required
            value={form.title}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-description">Event Description</label>
          <textarea
            className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            id="event-description"
            maxLength={5000}
            onChange={(e) => updateForm('description', e.target.value)}
            rows={3}
            value={form.description}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-category">Event Category *</label>
          <select
            className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
            id="event-category"
            onChange={(e) => updateForm('category', e.target.value as AcademicEventForm['category'])}
            value={form.category}
          >
            {ACADEMIC_EVENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category[0] + category.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-start-date">Start Date *</label>
            <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="event-start-date" onChange={(e) => updateForm('start_date', e.target.value)} required type="date" value={form.start_date} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-end-date">End Date *</label>
            <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="event-end-date" onChange={(e) => updateForm('end_date', e.target.value)} required type="date" value={form.end_date} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-start-time">Start Time *</label>
            <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="event-start-time" onChange={(e) => updateForm('start_time', e.target.value)} required type="time" value={form.start_time} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-end-time">End Time *</label>
            <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="event-end-time" onChange={(e) => updateForm('end_time', e.target.value)} required type="time" value={form.end_time} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-location">Event Location</label>
          <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none" id="event-location" maxLength={255} onChange={(e) => updateForm('location', e.target.value)} value={form.location} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-responsible">
            Responsible Person{event ? '' : ' *'}
          </label>
          <select
            className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
            id="event-responsible"
            onChange={(e) => updateForm('responsible_user_id', e.target.value)}
            value={form.responsible_user_id}
          >
            <option value="">{usersQuery.isLoading ? 'Loading users…' : 'Select responsible person'}</option>
            {responsibleOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[#8A99B0]">
            This person is accountable for reporting the reason if the event is not completed on time, and for its completion update.
          </p>
          {usersQuery.isError && <p className="mt-1 text-xs text-red-600" role="alert">Unable to load users.</p>}
          {formError && <p className="mt-1 text-xs text-red-600" role="alert">{formError}</p>}
        </div>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-[#5B6E8C]">Target Audience *</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {audienceOptions.map(([role, label]) => (
              <label className="flex items-center gap-2 text-sm text-[#1E293B]" key={role}>
                <input
                  checked={form.target_audience.includes(role)}
                  onChange={(e) => handleAudienceToggle(role, e.target.checked)}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="event-attachment">
            Optional Attachment{event?.has_attachment ? ` (current: ${event.attachment_filename})` : ''}
          </label>
          <input
            accept={ACCEPTED_ATTACHMENT_TYPES}
            className="block w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm text-[#5B6E8C] file:mr-3 file:rounded-md file:border-0 file:bg-[#F1F6FB] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
            id="event-attachment"
            onChange={(e) => handleAttachment(e.target.files?.[0])}
            type="file"
          />
          <p className="mt-1 text-xs text-[#8A99B0]">PDF, Office documents, JPG or PNG. Maximum size: 10 MB.</p>
          {form.attachment && <p className="mt-1 text-xs text-[#5B6E8C]">{form.attachment.name}</p>}
          {attachmentError && <p className="mt-1 text-xs text-red-600" role="alert">{attachmentError}</p>}
        </div>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button loading={isSaving} type="submit">{event ? 'Save Changes' : 'Add Event'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default AcademicEventFormModal;
