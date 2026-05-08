import { nodeStateName } from '../utils/status';

export function StatusBadge({ state, label }: { state?: number | string; label?: string }) {
  const text = label ?? (typeof state === 'number' ? nodeStateName(state) : state ?? 'UNKNOWN');
  const normalized = String(text).toLowerCase();
  const tone =
    normalized.includes('running') || normalized.includes('started') || normalized.includes('ready')
      ? 'good'
      : normalized.includes('stop') || normalized.includes('error')
        ? 'bad'
        : normalized.includes('init') || normalized.includes('rebuild') || normalized.includes('start')
          ? 'warn'
          : 'neutral';

  return <span className={`status-badge ${tone}`}>{text}</span>;
}
