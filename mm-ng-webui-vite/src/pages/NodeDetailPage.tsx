import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { MineMeldApi } from '../api/minemeld';
import { ApiError, getApiErrorMessage } from '../api/http';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { ModalBanner } from '../components/ModalBanner';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import type { ConfigDataType, NodeStatus, RunningConfigNode, WhitelistIndicator } from '../types/minemeld';
import {
  downstreamNodes,
  nodeDisplayName,
  nodeStateName,
  operatorNodeType,
  operatorNodeTypeLabel,
  statusNodes,
  upstreamFeedNodes,
} from '../utils/status';

type NodeDetailTab = 'stats' | 'info' | 'indicators' | 'graph';
type WhitelistForm = {
  indicator: string;
  type: string;
  direction: string;
  shareLevel: string;
  comment: string;
  ttl: string;
  expirationDisabled: boolean;
  attributesJson: string;
};
type GraphKind = 'feed' | 'processor' | 'output';
type GraphNode = {
  name: string;
  status?: NodeStatus;
  config?: RunningConfigNode;
  kind: GraphKind;
  x: number;
  y: number;
};
type GraphEdge = {
  from: string;
  to: string;
};

const tabs: Array<{ id: NodeDetailTab; label: string }> = [
  { id: 'stats', label: 'Stats' },
  { id: 'info', label: 'Info' },
  { id: 'indicators', label: 'Indicators' },
  { id: 'graph', label: 'Graph' },
];

function getTab(value: string | null, hasIndicators = false): NodeDetailTab {
  if (value === 'info' || value === 'graph') {
    return value;
  }

  if (value === 'indicators' && hasIndicators) {
    return value;
  }

  return 'stats';
}

function formatTimestamp(value: number | null | undefined) {
  if (!value) {
    return '-';
  }

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ConfigValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <em>empty</em>;
    }

    return (
      <ul className="config-list">
        {value.map((item, index) => (
          <li key={index}>
            <ConfigValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <em>empty</em>;
    }

    return (
      <dl className="config-object">
        {entries.map(([key, child]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <ConfigValue value={child} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (value === null || typeof value === 'undefined') {
    return <em>none</em>;
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'true' : 'false'}</span>;
  }

  return <span>{String(value)}</span>;
}

function linkedNodeList(names: string[]) {
  if (names.length === 0) {
    return <em>none</em>;
  }

  return (
    <ul className="inline-node-list">
      {names.map((name) => (
        <li key={name}>
          <Link to={`/nodes/${encodeURIComponent(name)}?tab=info`}>{name}</Link>
        </li>
      ))}
    </ul>
  );
}

function nodeTypeLabel(status: NodeStatus | undefined, config: RunningConfigNode | undefined) {
  return operatorNodeTypeLabel(operatorNodeType(status, config));
}

function indicatorTypes(config: RunningConfigNode | undefined) {
  return config?.indicator_types ?? config?.indicatorTypes ?? [];
}

function nodeClass(status: NodeStatus | undefined, config: RunningConfigNode | undefined) {
  return `${status?.class ?? config?.class ?? ''}`;
}

function whitelistDataType(nodeName: string, status: NodeStatus | undefined, config: RunningConfigNode | undefined): ConfigDataType | undefined {
  if (operatorNodeType(status, config) !== 'miner') {
    return undefined;
  }

  const className = nodeClass(status, config).toLowerCase();
  const prototype = `${config?.prototype ?? ''}`.toLowerCase();
  const name = nodeName.toLowerCase();

  if (className.includes('localdb')) {
    return 'localdb';
  }

  if (className.includes('yaml') || name.startsWith('wl') || prototype.includes('whitelist') || prototype.includes('.wl')) {
    return 'yaml';
  }

  return undefined;
}

function defaultWhitelistType(status: NodeStatus | undefined, config: RunningConfigNode | undefined) {
  const configured = indicatorTypes(config).find((type) => type && type !== 'any');
  if (configured) {
    return configured;
  }

  const className = nodeClass(status, config).toLowerCase();
  if (className.includes('url')) {
    return 'URL';
  }
  if (className.includes('domain')) {
    return 'domain';
  }
  if (className.includes('ipv6')) {
    return 'IPv6';
  }

  return 'IPv4';
}

function whitelistTypeChoices(status: NodeStatus | undefined, config: RunningConfigNode | undefined, dataType: ConfigDataType) {
  const configured = indicatorTypes(config).filter((type) => type && type !== 'any');
  if (dataType === 'yaml' && configured.length) {
    return configured;
  }

  if (dataType === 'yaml') {
    return [defaultWhitelistType(status, config)];
  }

  return configured.length ? configured : ['IPv4', 'IPv6', 'URL', 'domain', 'user-id', 'md5', 'sha256', 'sha1', 'ssdeep', 'email-addr'];
}

function cleanIndicator(indicator: WhitelistIndicator) {
  return Object.fromEntries(Object.entries(indicator).filter(([key, value]) => !key.startsWith('_') && typeof value !== 'undefined' && value !== '')) as WhitelistIndicator;
}

function visibleIndicators(indicators: WhitelistIndicator[] | undefined) {
  return (indicators ?? []).filter((indicator) => indicator && !indicator.removed && indicator.indicator);
}

function formatExpiration(value: number | 'disabled' | null | undefined) {
  if (value === 'disabled') {
    return 'Disabled';
  }

  return formatTimestamp(typeof value === 'number' ? value : undefined);
}

function validateIPv4Address(address: string) {
  const tokens = address.split('.');
  return tokens.length === 4 && tokens.every((token) => /^\d+$/.test(token) && Number(token) >= 0 && Number(token) <= 255);
}

function validateIPv4Indicator(value: string) {
  const range = value.split('-');
  if (range.length > 2) {
    return false;
  }

  if (range.length === 2) {
    return range.every(validateIPv4Address);
  }

  const [address, bits] = value.split('/');
  if (!validateIPv4Address(address)) {
    return false;
  }

  if (typeof bits === 'undefined') {
    return true;
  }

  return /^\d+$/.test(bits) && Number(bits) >= 0 && Number(bits) <= 32;
}

function validateDomainIndicator(value: string) {
  const normalized = value.startsWith('*.') ? value.slice(2) : value;
  return /^[a-z0-9.-]+$/i.test(normalized) && normalized.includes('.') && !normalized.includes('..');
}

function validateUrlIndicator(value: string) {
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return Boolean(parsed.hostname) && validateDomainIndicator(parsed.hostname);
    } catch {
      return false;
    }
  }

  const [host, ...pathParts] = value.split('/');
  const path = pathParts.join('/');
  return validateDomainIndicator(host) && path.length > 0 && !/\s/.test(path);
}

function validateWhitelistIndicator(value: string, type: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Indicator is required.';
  }

  const normalizedType = type.toLowerCase();
  if (normalizedType === 'ipv4') {
    return validateIPv4Indicator(trimmed) ? undefined : 'IPv4 indicators must be an address, CIDR prefix, or range.';
  }

  if (normalizedType === 'ipv6') {
    return trimmed.includes(':') ? undefined : 'IPv6 indicators must contain a valid IPv6 address or prefix.';
  }

  if (normalizedType === 'url') {
    return validateUrlIndicator(trimmed) ? undefined : 'URL indicators must be valid URLs or host/path values.';
  }

  if (normalizedType === 'domain') {
    return validateDomainIndicator(trimmed) ? undefined : 'Domain indicators must be valid host names or wildcard host names.';
  }

  return undefined;
}

function emptyWhitelistForm(type: string): WhitelistForm {
  return {
    indicator: '',
    type,
    direction: '',
    shareLevel: 'green',
    comment: '',
    ttl: '',
    expirationDisabled: false,
    attributesJson: '{}',
  };
}

function indicatorToForm(indicator: WhitelistIndicator, fallbackType: string): WhitelistForm {
  const attributes = cleanIndicator(indicator);
  delete attributes.indicator;
  delete attributes.type;
  delete attributes.direction;
  delete attributes.share_level;
  delete attributes.comment;
  delete attributes.ttl;
  delete attributes.removed;

  return {
    indicator: indicator.indicator ?? '',
    type: indicator.type ?? fallbackType,
    direction: indicator.direction ?? '',
    shareLevel: indicator.share_level ?? '',
    comment: indicator.comment ?? '',
    ttl: '',
    expirationDisabled: indicator._expiration_ts === 'disabled',
    attributesJson: JSON.stringify(attributes, null, 2),
  };
}

function formToIndicator(form: WhitelistForm, dataType: ConfigDataType): WhitelistIndicator {
  const record: WhitelistIndicator = {};

  if (dataType === 'localdb' && form.attributesJson.trim()) {
    Object.assign(record, JSON.parse(form.attributesJson));
  }

  record.indicator = form.indicator.trim();
  if (dataType === 'localdb') {
    record.type = form.type;
    if (form.expirationDisabled) {
      record.ttl = 'disabled';
    } else if (form.ttl.trim()) {
      record.ttl = Number(form.ttl);
    }
  }
  if (form.direction) {
    record.direction = form.direction;
  }
  if (form.shareLevel) {
    record.share_level = form.shareLevel;
  }
  if (form.comment.trim()) {
    record.comment = form.comment.trim();
  }

  return record;
}

function prototypeRoute(prototype: string) {
  const [libraryName, ...prototypeParts] = prototype.split('.');
  const prototypeName = prototypeParts.join('.');

  if (!libraryName || !prototypeName) {
    return undefined;
  }

  return `/prototypes/${encodeURIComponent(libraryName)}/${encodeURIComponent(prototypeName)}`;
}

function PrototypeValue({ prototype }: { prototype?: string }) {
  if (!prototype) {
    return <span>-</span>;
  }

  const route = prototypeRoute(prototype);
  if (!route) {
    return <span>{prototype}</span>;
  }

  return <Link to={route}>{prototype}</Link>;
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function FeedUrlValue({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <span className="feed-url-value">
      <span className="feed-url-text">{url}</span>
      <span className="feed-url-actions">
        <button className="icon-button" type="button" aria-label="Copy feed URL" title={copied ? 'Copied' : 'Copy'} onClick={copy}>
          <CopyIcon />
        </button>
        <button className="icon-button" type="button" aria-label="Open feed URL in new tab" title="Open in new tab" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
          <OpenIcon />
        </button>
      </span>
    </span>
  );
}

function graphKind(status: NodeStatus | undefined, config: RunningConfigNode | undefined): GraphKind {
  const className = `${status?.class ?? config?.class ?? ''}`.toLowerCase();
  const nodeType = `${config?.node_type ?? config?.nodeType ?? ''}`.toLowerCase();
  const name = `${status?.name ?? ''}`.toLowerCase();

  if (className.includes('redisset') || name.startsWith('output-') || nodeType === 'output') {
    return 'output';
  }

  if ((status?.inputs?.length ?? config?.inputs?.length ?? 0) === 0) {
    return 'feed';
  }

  return 'processor';
}

function buildGraph(currentName: string, allNodes: NodeStatus[], configNodes: Record<string, RunningConfigNode>): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const byName = Object.fromEntries(allNodes.map((node) => [nodeDisplayName(node), node]));
  const members = new Set<string>();
  const queue = [currentName];

  while (queue.length) {
    const name = queue.shift()!;
    if (members.has(name)) {
      continue;
    }

    members.add(name);
    const status = byName[name];
    const inputs = status?.inputs ?? configNodes[name]?.inputs ?? [];
    inputs.forEach((input) => {
      if (!members.has(input)) {
        queue.push(input);
      }
    });

    allNodes.forEach((node) => {
      const nodeName = nodeDisplayName(node);
      if ((node.inputs ?? configNodes[nodeName]?.inputs ?? []).includes(name) && !members.has(nodeName)) {
        queue.push(nodeName);
      }
    });
  }

  const edges: GraphEdge[] = [];
  members.forEach((name) => {
    const status = byName[name];
    const inputs = status?.inputs ?? configNodes[name]?.inputs ?? [];
    inputs.forEach((input) => {
      if (members.has(input)) {
        edges.push({ from: input, to: name });
      }
    });
  });

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  });

  const depths = new Map<string, number>();
  const resolveDepth = (name: string, seen = new Set<string>()): number => {
    if (depths.has(name)) {
      return depths.get(name)!;
    }
    if (seen.has(name)) {
      return 0;
    }

    seen.add(name);
    const parents = incoming.get(name) ?? [];
    const depth = parents.length ? 1 + Math.max(...parents.map((parent) => resolveDepth(parent, seen))) : 0;
    depths.set(name, depth);
    return depth;
  };

  members.forEach((name) => resolveDepth(name));
  const columns = new Map<number, string[]>();
  members.forEach((name) => {
    const depth = depths.get(name) ?? 0;
    columns.set(depth, [...(columns.get(depth) ?? []), name]);
  });

  const maxDepth = Math.max(0, ...columns.keys());
  const width = 980;
  const height = Math.max(360, Math.max(...Array.from(columns.values()).map((column) => column.length), 1) * 150);
  const leftPadding = 70;
  const usableWidth = width - 140;
  const graphNodes: GraphNode[] = [];

  columns.forEach((names, depth) => {
    const sortedNames = names.sort((a, b) => {
      if (a === currentName) {
        return -1;
      }
      if (b === currentName) {
        return 1;
      }
      return a.localeCompare(b);
    });
    const gap = height / (sortedNames.length + 1);
    sortedNames.forEach((name, index) => {
      const status = byName[name];
      const config = configNodes[name];
      graphNodes.push({
        name,
        status,
        config,
        kind: graphKind(status, config),
        x: leftPadding + (maxDepth === 0 ? usableWidth / 2 : (usableWidth * depth) / maxDepth),
        y: gap * (index + 1),
      });
    });
  });

  return { nodes: graphNodes, edges };
}

function NodeGraph({
  currentName,
  nodes,
  configNodes,
}: {
  currentName: string;
  nodes: NodeStatus[];
  configNodes: Record<string, RunningConfigNode>;
}) {
  const graph = useMemo(() => buildGraph(currentName, nodes, configNodes), [configNodes, currentName, nodes]);
  const graphNodesByName = Object.fromEntries(graph.nodes.map((node) => [node.name, node]));

  if (graph.nodes.length <= 1) {
    return <EmptyState title="No graph" detail="Node is not connected." />;
  }

  const maxY = Math.max(...graph.nodes.map((node) => node.y), 360);
  const height = Math.max(360, maxY + 80);

  return (
    <div className="graph-panel">
      <div className="section-heading graph-heading">
        <h2>Connection Graph</h2>
        <div className="graph-legend">
          <span><i className="feed" /> Feed</span>
          <span><i className="processor" /> Processor</span>
          <span><i className="output" /> Output</span>
        </div>
      </div>
      <svg className="node-graph" viewBox={`0 0 980 ${height}`} role="img" aria-label={`Connection graph for ${currentName}`}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#a7b1bd" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const from = graphNodesByName[edge.from];
          const to = graphNodesByName[edge.to];
          if (!from || !to) {
            return null;
          }

          const mid = Math.max(40, (to.x - from.x) / 2);
          const path = `M ${from.x + 22} ${from.y} C ${from.x + mid} ${from.y}, ${to.x - mid} ${to.y}, ${to.x - 24} ${to.y}`;

          return <path className="graph-edge" key={`${edge.from}-${edge.to}`} d={path} markerEnd="url(#arrow)" />;
        })}
        {graph.nodes.map((node) => {
          const isCurrent = node.name === currentName;
          const labelX = node.x + 34 > 860 ? node.x - 34 : node.x + 34;
          const anchor = node.x + 34 > 860 ? 'end' : 'start';

          return (
            <a key={node.name} className="graph-node-link" href={`/nodes/${encodeURIComponent(node.name)}?tab=graph`}>
              <g className={`graph-node ${node.kind} ${isCurrent ? 'current' : ''}`}>
                <circle cx={node.x} cy={node.y} r={isCurrent ? 23 : 19} />
                <circle cx={node.x} cy={node.y} r={8} />
                {node.kind === 'processor' ? (
                  <text x={node.x} y={node.y + 7} textAnchor="middle" aria-hidden="true">*</text>
                ) : null}
                <text className="graph-node-label" x={labelX} y={node.y + 5} textAnchor={anchor}>
                  {node.name}
                </text>
              </g>
            </a>
          );
        })}
      </svg>
    </div>
  );
}

function StatsTab({ status, config }: { status: NodeStatus; config?: RunningConfigNode }) {
  const statistics = Object.entries(status.statistics ?? {});

  return (
    <div className="detail-grid">
      <div>
        <h2>Status</h2>
        <dl className="definition-list">
          <div>
            <dt>State</dt>
            <dd>
              <StatusBadge state={status.state} label={nodeStateName(status.state)} />
            </dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{status.class ?? config?.class ?? '-'}</dd>
          </div>
          <div>
            <dt>Indicators</dt>
            <dd>{status.length ?? '-'}</dd>
          </div>
          <div>
            <dt>Inputs</dt>
            <dd>{status.inputs?.length ? status.inputs.join(', ') : '-'}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>{status.output ? 'enabled' : 'disabled'}</dd>
          </div>
          <div>
            <dt>Prototype</dt>
            <dd>
              <PrototypeValue prototype={config?.prototype} />
            </dd>
          </div>
        </dl>
      </div>
      <div>
        <h2>Statistics</h2>
        {statistics.length ? (
          <dl className="definition-list compact">
            {statistics.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState title="No statistics" />
        )}
      </div>
    </div>
  );
}

function IndicatorsTab({
  nodeName,
  status,
  config,
  dataType,
}: {
  nodeName: string;
  status: NodeStatus;
  config?: RunningConfigNode;
  dataType: ConfigDataType;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const datafilename = `${nodeName}_indicators`;
  const defaultType = defaultWhitelistType(status, config);
  const typeChoices = whitelistTypeChoices(status, config, dataType);
  const [form, setForm] = useState<WhitelistForm>(() => emptyWhitelistForm(defaultType));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhitelistIndicator | null>(null);
  const queryKey = ['config-data', datafilename, dataType];

  const indicatorsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return (await MineMeldApi.configData<WhitelistIndicator[]>(datafilename, dataType)) ?? [];
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          return [];
        }
        throw error;
      }
    },
  });

  const invalidateIndicators = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ['status'] });
  };

  const saveYaml = useMutation({
    mutationFn: (indicators: WhitelistIndicator[]) => MineMeldApi.saveConfigData(datafilename, indicators, 'yaml', nodeName),
    onSuccess: invalidateIndicators,
  });

  const appendLocalDb = useMutation({
    mutationFn: (indicator: WhitelistIndicator) => MineMeldApi.appendConfigData(datafilename, indicator, 'localdb', nodeName),
    onSuccess: invalidateIndicators,
  });

  const indicators = visibleIndicators(indicatorsQuery.data);
  const isSaving = saveYaml.isPending || appendLocalDb.isPending;
  const operationError = formError ?? (saveYaml.error ? getApiErrorMessage(saveYaml.error) : appendLocalDb.error ? getApiErrorMessage(appendLocalDb.error) : null);
  const canEdit = auth.isReadWrite;

  const resetForm = () => {
    setForm(emptyWhitelistForm(defaultType));
    setEditingKey(null);
    setFormError(null);
  };

  const submitIndicator = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const validationError = validateWhitelistIndicator(form.indicator, form.type);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (form.ttl.trim() && (!/^\d+$/.test(form.ttl.trim()) || Number(form.ttl) < 1)) {
      setFormError('Time to live must be a positive number of seconds.');
      return;
    }

    let record: WhitelistIndicator;
    try {
      record = formToIndicator(form, dataType);
    } catch {
      setFormError('Attributes must be valid JSON.');
      return;
    }

    if (dataType === 'localdb') {
      appendLocalDb.mutate(record, { onSuccess: resetForm });
      return;
    }

    const existing = indicatorsQuery.data ?? [];
    const next = existing.filter((indicator) => indicator.indicator !== record.indicator || indicator.removed);
    next.push(record);
    saveYaml.mutate(next, { onSuccess: resetForm });
  };

  const editIndicator = (indicator: WhitelistIndicator) => {
    const type = indicator.type ?? defaultType;
    setForm(indicatorToForm(indicator, type));
    setEditingKey(`${indicator.indicator ?? ''}:${type}`);
    setFormError(null);
  };

  const removeIndicator = (indicator: WhitelistIndicator) => {
    if (dataType === 'localdb') {
      appendLocalDb.mutate({
        indicator: indicator.indicator,
        type: indicator.type ?? defaultType,
        ttl: -1,
        removed: true,
      });
      return;
    }

    saveYaml.mutate((indicatorsQuery.data ?? []).filter((candidate) => candidate.indicator !== indicator.indicator));
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    removeIndicator(deleteTarget);
    setDeleteTarget(null);
  };

  return (
    <div className="node-info whitelist-tab">
      <div className="node-info-heading">
        <h2>Indicators</h2>
      </div>
      <dl className="definition-list full-width-definition-list">
        <div>
          <dt>Data file</dt>
          <dd>{datafilename}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{dataType === 'localdb' ? 'Local DB' : 'YAML'}</dd>
        </div>
        <div>
          <dt>Indicators</dt>
          <dd>{indicators.length.toLocaleString()}</dd>
        </div>
      </dl>

      {indicatorsQuery.isLoading ? <LoadingState /> : null}
      {indicatorsQuery.isError ? <ErrorState error={indicatorsQuery.error} /> : null}
      {operationError ? <div className="form-error">{operationError}</div> : null}
      {deleteTarget ? (
        <ConfirmModal title="Delete indicator" pending={isSaving} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)}>
          <p>
            Delete <strong>{deleteTarget.indicator}</strong> from this whitelist?
          </p>
        </ConfirmModal>
      ) : null}

      {canEdit ? (
        <form className="indicator-form" onSubmit={submitIndicator}>
          <label>
            Indicator
            <input value={form.indicator} disabled={Boolean(editingKey)} onChange={(event) => setForm({ ...form, indicator: event.target.value })} placeholder="Indicator" />
          </label>
          <label>
            Type
            <select value={form.type} disabled={dataType === 'yaml' || Boolean(editingKey)} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {typeChoices.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction
            <select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}>
              <option value="">Default</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </label>
          <label>
            Share level
            <select value={form.shareLevel} onChange={(event) => setForm({ ...form, shareLevel: event.target.value })}>
              <option value="">Default</option>
              <option value="green">Green</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
            </select>
          </label>
          <label className="wide-field">
            Comment
            <input value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder="Comment" />
          </label>
          {dataType === 'localdb' ? (
            <>
              <label>
                Time to live
                <input
                  value={form.ttl}
                  disabled={form.expirationDisabled}
                  onChange={(event) => setForm({ ...form, ttl: event.target.value })}
                  placeholder="Default"
                />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.expirationDisabled} onChange={(event) => setForm({ ...form, expirationDisabled: event.target.checked })} />
                Disable expiration
              </label>
              <label className="wide-field">
                Attributes
                <textarea rows={5} value={form.attributesJson} onChange={(event) => setForm({ ...form, attributesJson: event.target.value })} />
              </label>
            </>
          ) : null}
          <div className="form-actions wide-field">
            <button className="button primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingKey ? 'Update indicator' : 'Add indicator'}
            </button>
            {editingKey ? (
              <button className="button secondary" type="button" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="legacy-form-note">
          <strong>Read-only</strong>
          <span>Indicator management requires read-write access.</span>
        </div>
      )}

      {!indicatorsQuery.isLoading && indicators.length === 0 ? <EmptyState title="No indicators" detail="This whitelist has no configured indicators." /> : null}
      {indicators.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Indicator</th>
                <th>Type</th>
                <th>Direction</th>
                <th>Share level</th>
                <th>Comment</th>
                <th>Last update</th>
                <th>Expiration</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {indicators.map((indicator) => {
                const type = indicator.type ?? defaultType;
                const key = `${indicator.indicator ?? ''}:${type}`;
                return (
                  <tr key={key}>
                    <td>{indicator.indicator}</td>
                    <td>{type}</td>
                    <td>{indicator.direction ? String(indicator.direction).toUpperCase() : '-'}</td>
                    <td>{indicator.share_level ? String(indicator.share_level).toUpperCase() : '-'}</td>
                    <td>{indicator.comment ?? '-'}</td>
                    <td>{formatTimestamp(indicator._update_ts)}</td>
                    <td>{formatExpiration(indicator._expiration_ts)}</td>
                    {canEdit ? (
                      <td>
                        <div className="row-actions">
                          <button className="button secondary compact" type="button" onClick={() => editIndicator(indicator)}>
                            Edit
                          </button>
                          <button className="button danger compact" type="button" onClick={() => setDeleteTarget(indicator)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function InfoTab({
  nodeName,
  status,
  config,
  outputs,
  upstreamFeeds,
}: {
  nodeName: string;
  status: NodeStatus;
  config?: RunningConfigNode;
  outputs: NodeStatus[];
  upstreamFeeds: NodeStatus[];
}) {
  const inputNames = status.inputs ?? config?.inputs ?? [];
  const outputNames = outputs.map((node) => nodeDisplayName(node));
  const upstreamFeedNames = upstreamFeeds.map((node) => nodeDisplayName(node));
  const indicators = indicatorTypes(config);
  const type = operatorNodeType(status, config);
  const feedBaseUrl = `${window.location.origin}/feeds/${nodeName}`;

  return (
    <div className="node-info">
      <div className="node-info-heading">
        <h2>Status</h2>
      </div>
      <div className="detail-grid no-padding">
        <dl className="definition-list">
          <div>
            <dt>Name</dt>
            <dd>{nodeName}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{status.class ?? config?.class ?? '-'}</dd>
          </div>
          <div>
            <dt>Prototype</dt>
            <dd>
              <PrototypeValue prototype={config?.prototype} />
            </dd>
          </div>
          <div>
            <dt>Node type</dt>
            <dd>
              <span className={`node-type-badge ${type}`}>{nodeTypeLabel(status, config)}</span>
            </dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>
              <StatusBadge state={status.state} label={nodeStateName(status.state)} />
            </dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd>{formatTimestamp(status.last_run)}</dd>
          </div>
          <div>
            <dt>Last successful run</dt>
            <dd>{formatTimestamp(status.last_successful_run)}</dd>
          </div>
          <div>
            <dt># Indicators</dt>
            <dd>{status.length ?? '-'}</dd>
          </div>
        </dl>
        <dl className="definition-list">
          <div>
            <dt>Output</dt>
            <dd>
              <StatusBadge label={status.output ? 'ENABLED' : 'DISABLED'} />
            </dd>
          </div>
          <div>
            <dt>Inputs</dt>
            <dd>{linkedNodeList(inputNames)}</dd>
          </div>
          {type === 'output' ? (
            <div>
              <dt>Originating feeds</dt>
              <dd>{linkedNodeList(upstreamFeedNames)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Outputs</dt>
            <dd>{linkedNodeList(outputNames)}</dd>
          </div>
          <div>
            <dt>Indicator types</dt>
            <dd>{indicators.length ? indicators.join(', ') : '-'}</dd>
          </div>
          <div>
            <dt>Sub state</dt>
            <dd>{status.sub_state ?? '-'}</dd>
          </div>
          <div>
            <dt>Sub state message</dt>
            <dd>{status.sub_state_message ?? '-'}</dd>
          </div>
        </dl>
      </div>
      {type === 'output' ? (
        <dl className="definition-list full-width-definition-list">
          <div>
            <dt>Feed base URL</dt>
            <dd>
              <FeedUrlValue url={feedBaseUrl} />
            </dd>
          </div>
        </dl>
      ) : null}
      {config?.config ? (
        <>
          <h2>Config</h2>
          <div className="config-panel">
            <ConfigValue value={config.config} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function NodeDetailPage() {
  const { nodename = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const decodedName = decodeURIComponent(nodename);
  const [runNotice, setRunNotice] = useState<{ title: string; message?: string } | null>(null);
  const statusQuery = useQuery({ queryKey: ['status'], queryFn: MineMeldApi.status, refetchInterval: 10_000 });
  const configQuery = useQuery({ queryKey: ['config', 'running'], queryFn: MineMeldApi.runningConfig, staleTime: 60_000 });
  const allNodes = statusNodes(statusQuery.data);
  const status = statusQuery.data?.[decodedName];
  const configNodes = configQuery.data?.nodes ?? {};
  const config = configNodes[decodedName];
  const indicatorDataType = status ? whitelistDataType(decodedName, status, config) : undefined;
  const activeTab = getTab(searchParams.get('tab'), Boolean(indicatorDataType));
  const visibleTabs = tabs.filter((tab) => tab.id !== 'indicators' || Boolean(indicatorDataType));
  const outputs = downstreamNodes(allNodes, decodedName);
  const upstreamFeeds = upstreamFeedNodes(decodedName, allNodes, configNodes);
  const type = status ? operatorNodeType(status, config) : undefined;
  const runNodeNow = useMutation({
    mutationFn: () => MineMeldApi.hupNode(decodedName),
    onSuccess: () => {
      setRunNotice({ title: 'Run scheduled', message: `New run for ${decodedName} was successfully scheduled.` });
      window.setTimeout(() => {
        void statusQuery.refetch();
      }, 500);
    },
  });

  return (
    <>
      <PageHeader
        title={decodedName}
        eyebrow="Node"
        description="Stats, information, and connection graph for this node."
        actions={
          type === 'miner' && !indicatorDataType ? (
            <button className="button secondary" type="button" onClick={() => runNodeNow.mutate()} disabled={runNodeNow.isPending}>
              {runNodeNow.isPending ? 'Scheduling...' : 'Run now'}
            </button>
          ) : null
        }
      />
      {runNodeNow.isError ? <ErrorState error={runNodeNow.error} /> : null}
      {runNotice ? <ModalBanner title={runNotice.title} message={runNotice.message} onClose={() => setRunNotice(null)} /> : null}
      {statusQuery.isLoading || configQuery.isLoading ? <LoadingState /> : null}
      {statusQuery.isError ? <ErrorState error={statusQuery.error} /> : null}
      {configQuery.isError ? <ErrorState error={configQuery.error} /> : null}
      {statusQuery.isSuccess && !status ? (
        <EmptyState title="Node not found" detail="The node is not present in the current status response." />
      ) : null}
      {status ? (
        <section className="section-block">
          <div className="tab-strip" role="tablist" aria-label="Node detail views">
            {visibleTabs.map((tab) => (
              <button
                className={activeTab === tab.id ? 'active' : undefined}
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setSearchParams(tab.id === 'stats' ? {} : { tab: tab.id })}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'stats' ? <StatsTab status={status} config={config} /> : null}
          {activeTab === 'info' ? (
            <InfoTab
              nodeName={decodedName}
              status={status}
              config={config}
              outputs={outputs}
              upstreamFeeds={upstreamFeeds}
            />
          ) : null}
          {activeTab === 'indicators' && indicatorDataType ? <IndicatorsTab nodeName={decodedName} status={status} config={config} dataType={indicatorDataType} /> : null}
          {activeTab === 'graph' ? <NodeGraph currentName={decodedName} nodes={allNodes} configNodes={configNodes} /> : null}
        </section>
      ) : null}
    </>
  );
}
