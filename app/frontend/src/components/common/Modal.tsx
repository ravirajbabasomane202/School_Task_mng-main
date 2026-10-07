import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  bodyClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

function Modal({
  bodyClassName = '',
  children,
  footer,
  headerAction,
  isOpen,
  onClose,
  title
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const portalTarget = useMemo(() => {
    if (typeof document === 'undefined') {
      return null;
    }

    return document.body;
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !portalTarget || !isOpen) {
    return null;
  }

  return createPortal(
    // items-center + a vertically-scrollable backdrop: on short/mobile
    // viewports a tall modal (e.g. a long form) no longer gets clipped off
    // the top/bottom of the screen with no way to reach its own scrollbar.
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#1E293B]/30 p-4 animate-[fadeIn_180ms_ease-out] sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        // flex-col + max-h-[90vh]: the header/footer stay pinned and only the
        // body (below) scrolls, so the dialog never exceeds the viewport on
        // small screens no matter how much content it holds.
        className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_60px_rgba(30,41,59,0.14)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#EFF2F6] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-base font-semibold text-[#1E293B]">{title}</h2>
            {headerAction}
          </div>
          <button
            aria-label="Close modal"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-[#5B6E8C] transition hover:bg-[#F8F9FC]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className={['overflow-y-auto px-4 py-4 sm:px-5', bodyClassName].join(' ')}>{children}</div>
        {footer ? <div className="shrink-0 border-t border-[#EFF2F6] px-4 py-4 sm:px-5">{footer}</div> : null}
      </div>
    </div>,
    portalTarget
  );
}

export default Modal;
