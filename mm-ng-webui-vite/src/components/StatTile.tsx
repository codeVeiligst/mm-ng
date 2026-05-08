export function StatTile({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`stat-tile${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
