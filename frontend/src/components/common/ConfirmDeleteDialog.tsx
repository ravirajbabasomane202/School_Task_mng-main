import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  /** Modal title, e.g. "Delete Announcement". */
  title: string;
  /** What is about to be deleted (shown in bold), e.g. the announcement text. */
  itemLabel?: ReactNode;
  /** Noun used in the sentence, e.g. "announcement". */
  itemName: string;
  /** Extra warning line, e.g. what else happens. */
  note?: ReactNode;
  /** Error from the last attempt; the dialog stays open so the user can retry. */
  errorMessage?: string | null;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The one confirmation dialog used before deleting an announcement,
 * notification or approval request. Same layout as the Register delete
 * confirmation (Modal + ghost Cancel + danger Delete).
 */
function ConfirmDeleteDialog({
  isOpen,
  title,
  itemLabel,
  itemName,
  note,
  errorMessage,
  isDeleting = false,
  onCancel,
  onConfirm
}: ConfirmDeleteDialogProps) {
  // Don't let Escape / backdrop close the dialog mid-request.
  const handleClose = () => {
    if (!isDeleting) onCancel();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-[#5B6E8C]">
          Are you sure you want to delete this {itemName}?
          {itemLabel ? (
            <>
              {' '}
              <span className="break-words font-semibold text-[#1E293B]">{itemLabel}</span>
            </>
          ) : null}{' '}
          This action cannot be undone.
        </p>
        {note ? <p className="text-xs text-[#8A99B0]">{note}</p> : null}
        {errorMessage ? (
          <p className="rounded-[10px] border border-[#F3C7C5] bg-[#FFF4F4] px-3 py-2 text-sm text-[#C13F3A]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-2">
          <Button disabled={isDeleting} onClick={handleClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button loading={isDeleting} onClick={onConfirm} type="button" variant="danger">
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDeleteDialog;
