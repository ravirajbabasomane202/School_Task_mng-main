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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1E293B]/30 p-4 animate-[fadeIn_180ms_ease-out]"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-[560px] rounded-[18px] bg-white shadow-[0_24px_60px_rgba(30,41,59,0.14)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-[#EFF2F6] px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-[#1E293B]">{title}</h2>
            {headerAction}
          </div>
          <button
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-[#5B6E8C] transition hover:bg-[#F8F9FC]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className={['px-5 py-4', bodyClassName].join(' ')}>{children}</div>
        {footer ? <div className="border-t border-[#EFF2F6] px-5 py-4">{footer}</div> : null}
      </div>
    </div>,
    portalTarget
  );
}

export default Modal;
