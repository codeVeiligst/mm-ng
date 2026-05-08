import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/StatTile';
import { StatusBadge } from '../components/StatusBadge';
import { classifyNodeHealth, nodeDisplayName, nodeStateName, operatorNodeType, operatorNodeTypeLabel, statusNodes, summarizeNodeHealth } from '../utils/status';

function nodeStateLabel(node: Parameters<typeof classifyNodeHealth>[0]) {
  const health = classifyNodeHealth(node);
  if (health === 'error') {
    return 'ERROR';
  }

  return nodeStateName(node.state);
}

export function NodesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const nameFilter = searchParams.get('q') ?? '';
  const statusQuery = useQuery({ queryKey: ['status'], queryFn: MineMeldApi.status, refetchInterval: 10_000 });
  const configQuery = useQuery({ queryKey: ['config', 'running'], queryFn: MineMeldApi.runningConfig, staleTime: 60_000 });
  const nodes = statusNodes(statusQuery.data);
  const configNodes = configQuery.data?.nodes ?? {};
  const health = summarizeNodeHealth(nodes);
  const normalizedFilter = nameFilter.trim().toLowerCase();
  const filteredNodes = normalizedFilter
    ? nodes.filter((node, index) => nodeDisplayName(node, `node-${index}`).toLowerCase().includes(normalizedFilter))
    : nodes;

  return (
    <>
      <PageHeader
        title="Nodes"
        description="MineMeld miners, processors, outputs, feeds, and tables with their current runtime state."
      />
      <section className="stats-grid">
        <StatTile label="Total nodes" value={nodes.length} />
        <StatTile label="Running" value={health.running} />
        <StatTile label="Attention" value={health.error + health.pending + health.unknown} hint="error, pending, or unknown" />
        <div className="stat-tile filter-tile">
          <label htmlFor="node-name-filter">Filter by node name</label>
          <input
            id="node-name-filter"
            value={nameFilter}
            placeholder="Name contains..."
            onChange={(event) => {
              const value = event.target.value;
              setSearchParams(value ? { q: value } : {});
            }}
          />
          <small>{filteredNodes.length} shown</small>
        </div>
      </section>
      <section className="section-block">
        {statusQuery.isLoading ? <LoadingState /> : null}
        {statusQuery.isError ? <ErrorState error={statusQuery.error} /> : null}
        {configQuery.isError ? <ErrorState error={configQuery.error} /> : null}
        {statusQuery.isSuccess && nodes.length === 0 ? (
          <EmptyState title="No nodes found" detail="Start mm-ng-core or add nodes in Config." />
        ) : null}
        {statusQuery.isSuccess && nodes.length > 0 && filteredNodes.length === 0 ? (
          <EmptyState title="No matching nodes" detail="No node name matches the current filter." />
        ) : null}
        {filteredNodes.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Node Type</th>
                  <th>Class / Type</th>
                  <th>State</th>
                  <th>Indicators</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node, index) => {
                  const name = nodeDisplayName(node, `node-${index}`);
                  const type = operatorNodeType(node, configNodes[name]);
                  const healthState = classifyNodeHealth(node);

                  return (
                    <tr className={healthState === 'error' ? 'node-row-error' : undefined} key={name}>
                      <td>
                        <Link to={`/nodes/${encodeURIComponent(name)}`}>{name}</Link>
                      </td>
                      <td>
                        <span className={`node-type-badge ${type}`}>{operatorNodeTypeLabel(type)}</span>
                      </td>
                      <td>{node.class ?? '-'}</td>
                      <td>
                        <StatusBadge label={nodeStateLabel(node)} />
                      </td>
                      <td>{node.length ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
