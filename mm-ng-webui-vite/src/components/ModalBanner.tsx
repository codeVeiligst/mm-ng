import { useEffect } from 'react';

type ModalBannerProps = {
  title: string;
  message?: string;
  tone?: 'success' | 'warning';
  timeoutMs?: number;
  onClose: () => void;
};

export function ModalBanner({ title, message, tone = 'success', timeoutMs = 3200, onClose }: ModalBannerProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [onClose, timeoutMs]);

  return (
    <div className={`modal-banner ${tone}`} role="status" aria-live="polite">
      <div>
        <strong>{title}</strong>
        {message ? <span>{message}</span> : null}
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={onClose}>
        x
      </button>
    </div>
  );
}
