import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/StatTile';
import { StatusBadge } from '../components/StatusBadge';

function percent(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '-';
}

function cpuValues(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
}

function cpuAverage(value: unknown) {
  const values = cpuValues(value);
  if (values.length === 0) {
    return '-';
  }

  const average = values.reduce((total, item) => total + item, 0) / values.length;
  return `${average.toFixed(1)}%`;
}

function metricLabel(key: string, value: unknown) {
  if (key === 'cpu') {
    const values = cpuValues(value);
    return values.length ? `${cpuAverage(value)} average across ${values.length} cores` : '-';
  }

  if (key === 'memory' || key === 'swap' || key === 'disk') {
    return percent(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'enabled' : 'disabled';
  }

  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function SystemLayout() {
  return (
    <>
      <PageHeader title="System" description="Supervisor, backup, restore, and extension management." />
      <nav className="tab-strip route-tabs">
        <NavLink to="/system/dashboard">Dashboard</NavLink>
        <NavLink to="/system/extensions">Extensions</NavLink>
      </nav>
      <Outlet />
    </>
  );
}

export function SystemDashboardPage() {
  const engineQuery = useQuery({ queryKey: ['supervisor', 'status'], queryFn: MineMeldApi.engineStatus });
  const systemQuery = useQuery({ queryKey: ['status', 'system'], queryFn: MineMeldApi.systemStatus });
  const values = Object.entries(systemQuery.data ?? {});
  const cpu = systemQuery.data?.cpu;
  const memory = systemQuery.data?.memory;
  const disk = systemQuery.data?.disk;
  const swap = systemQuery.data?.swap;

  return (
    <section className="section-block">
      <div className="stats-grid">
        <StatTile label="Supervisor" value={<StatusBadge label={engineQuery.data?.statename ?? 'UNKNOWN'} />} />
        <StatTile label="CPU" value={cpuAverage(cpu)} hint={`${cpuValues(cpu).length} cores`} />
        <StatTile label="Memory" value={percent(memory)} hint="used" />
        <StatTile label="Disk" value={percent(disk)} hint="used" />
      </div>
      <div className="stats-grid compact-system-stats">
        <StatTile label="Swap" value={percent(swap)} hint="used" />
        <StatTile label="SNS" value={systemQuery.data?.sns ? 'enabled' : 'disabled'} />
        <StatTile label="System fields" value={values.length} />
      </div>
      {engineQuery.isLoading || systemQuery.isLoading ? <LoadingState /> : null}
      {engineQuery.isError ? <ErrorState error={engineQuery.error} /> : null}
      {systemQuery.isError ? <ErrorState error={systemQuery.error} /> : null}
      {values.length > 0 ? (
        <dl className="definition-list system-definition-list">
          {values.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{metricLabel(key, value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function SystemExtensionsPage() {
  const extensionsQuery = useQuery({ queryKey: ['extensions'], queryFn: MineMeldApi.extensions });

  return (
    <section className="section-block">
      <div className="section-heading">
        <h2>Extensions</h2>
        <button className="button secondary" type="button" disabled>
          Upload
        </button>
      </div>
      {extensionsQuery.isLoading ? <LoadingState /> : null}
      {extensionsQuery.isError ? <ErrorState error={extensionsQuery.error} /> : null}
      {extensionsQuery.isSuccess ? (
        <EmptyState
          title="Extension management foundation"
          detail="Upload, install from Git, activate, and remove actions will use the existing /extensions API."
        />
      ) : null}
    </section>
  );
}
