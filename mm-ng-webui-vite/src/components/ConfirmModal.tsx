import type { ReactNode } from 'react';

type ConfirmModalProps = {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  title,
  children,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <header>
          <h2 id="confirm-modal-title">{title}</h2>
        </header>
        <div className="confirm-modal-body">{children}</div>
        <footer>
          <button className="button danger" type="button" onClick={onConfirm} disabled={pending || confirmDisabled}>
            {pending ? 'Deleting...' : confirmLabel}
          </button>
          <button className="button secondary" type="button" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
