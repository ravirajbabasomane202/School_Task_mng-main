import { useState } from 'react';
import { Download, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { ROLE_LABELS, type Role } from '../../constants/roles';
import { downloadAcademicEventAttachment } from '../../services/academicEventService';
import type { AcademicEvent } from '../../types/academicEvent.types';
import Button from '../common/Button';
import Modal from '../common/Modal';

interface AcademicEventDetailsModalProps {
  event: AcademicEvent | null;
  onClose: () => void;
  onDelete?: (event: AcademicEvent) => void;
  onEdit?: (event: AcademicEvent) => void;
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

function formatEventDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function AcademicEventDetailsModal({
  event,
  onClose,
  onDelete,
  onEdit
}: AcademicEventDetailsModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);

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

  return (
    <Modal isOpen={Boolean(event)} onClose={onClose} title={event?.title ?? 'Event details'}>
      {event && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CATEGORY_STYLE[event.category]}`}>
              {event.category}
            </span>
            <span className="text-sm text-[#5B6E8C]">
              {formatEventDate(event.start_date)}
              {event.end_date !== event.start_date ? ` – ${formatEventDate(event.end_date)}` : ''}
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
          {event.has_attachment && event.attachment_filename && (
            <Button
              loading={isDownloading}
              onClick={() => void handleDownload()}
              size="sm"
              variant="ghost"
            >
              <Download aria-hidden="true" size={15} />
              Download {event.attachment_filename}
            </Button>
          )}
          {(onEdit || onDelete) && (
            <div className="flex flex-col-reverse gap-2 border-t border-[#EFF2F6] pt-4 sm:flex-row sm:justify-end">
              <Button onClick={onClose} variant="ghost">Close</Button>
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
