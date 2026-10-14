import { Trash2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import Button from './Button';

interface DeleteButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible label, e.g. "Delete announcement". Also used as the tooltip. */
  label?: string;
  loading?: boolean;
}

/**
 * The one Delete button used by Announcements, Notifications and Approval
 * Requests: the shared danger Button with a trash icon. It only requests a
 * delete — the confirmation lives in <ConfirmDeleteDialog />.
 */
function DeleteButton({ label = 'Delete', loading = false, title, ...props }: DeleteButtonProps) {
  return (
    <Button aria-label={label} loading={loading} size="sm" title={title ?? label} variant="danger" {...props}>
      <span className="inline-flex items-center gap-1.5">
        <Trash2 aria-hidden="true" size={14} />
        Delete
      </span>
    </Button>
  );
}

export default DeleteButton;
