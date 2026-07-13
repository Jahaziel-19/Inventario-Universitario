import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'center' | 'drawer';
}

export default function Modal({ isOpen, onClose, children, variant = 'center' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.classList.add('modal-open');
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className={`modal-overlay ${variant === 'drawer' ? 'modal-overlay--drawer' : ''}`} onMouseDown={onClose}>
      <div className={variant === 'drawer' ? 'drawer-shell' : 'modal-shell'} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}
