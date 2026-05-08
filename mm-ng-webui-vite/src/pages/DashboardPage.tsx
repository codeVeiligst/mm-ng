import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/StatTile';
import { StatusBadge } from '../components/StatusBadge';
import { nodeStateName } from '../utils/status';

export function DashboardPage() {
  const statusQuery = useQuery({ queryKey: ['status'], queryFn: MineMeldApi.status, refetchInterval: 10_000 });
  const configQuery = useQuery({ queryKey: ['config', 'running'], queryFn: MineMeldApi.runningConfig });
  const engineQuery = useQuery({ queryKey: ['supervisor', 'status'], queryFn: MineMeldApi.engineStatus });

  const statusNodes = Object.values(statusQuery.data ?? {});
  const configNodes = Object.entries(configQuery.data?.nodes ?? {});
  const outputs = configNodes.filter(([, node]) => node.output).length;
  const inputs = configNodes.filter(([, node]) => (node.inputs ?? []).length === 0).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational overview for the running MineMeld engine and configured nodes."
      />
      <section className="stats-grid">
        <StatTile label="Engine" value={<StatusBadge label={engineQuery.data?.statename ?? 'UNKNOWN'} />} />
        <StatTile label="Configured nodes" value={configNodes.length} />
        <StatTile label="Inputs" value={inputs} hint="Nodes without upstream inputs" />
        <StatTile label="Outputs" value={outputs} hint="Feed and table outputs" />
      </section>
      <section className="section-block">
        <div className="section-heading">
          <h2>Node Status</h2>
          <Link className="text-link" to="/nodes">
            View all nodes
          </Link>
        </div>
        {statusQuery.isLoading ? <LoadingState /> : null}
        {statusQuery.isError ? <ErrorState error={statusQuery.error} /> : null}
        {statusQuery.isSuccess && statusNodes.length === 0 ? (
          <EmptyState title="No status entries" detail="The API returned an empty node status set." />
        ) : null}
        {statusNodes.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Class</th>
                  <th>State</th>
                  <th>Length</th>
                </tr>
              </thead>
              <tbody>
                {statusNodes.slice(0, 8).map((node) => (
                  <tr key={node.name}>
                    <td>
                      <Link to={`/nodes/${encodeURIComponent(node.name)}`}>{node.name}</Link>
                    </td>
                    <td>{node.class}</td>
                    <td>
                      <StatusBadge state={node.state} label={nodeStateName(node.state)} />
                    </td>
                    <td>{node.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
