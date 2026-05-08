import { getApiErrorMessage } from '../api/http';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <div className="state-row">{label}...</div>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = getApiErrorMessage(error);

  return (
    <div className="error-state">
      <strong>Unable to load data</strong>
      <span>{message}</span>
    </div>
  );
}
