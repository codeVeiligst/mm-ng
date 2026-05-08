import type { NodeStatus, RunningConfigNode, StatusByNode } from '../types/minemeld';

export const NODE_STATES = ['READY', 'CONNECTED', 'REBUILDING', 'RESET', 'INIT', 'STARTED', 'CHECKPOINT', 'IDLE', 'STOPPED'];
export type NodeHealth = 'running' | 'pending' | 'paused' | 'error' | 'unknown';
export type OperatorNodeType = 'miner' | 'aggregate' | 'output';

export function nodeStateName(state: number | undefined) {
  if (typeof state !== 'number') {
    return 'UNKNOWN';
  }

  return NODE_STATES[state] ?? `STATE ${state}`;
}

export function nodeDisplayName(node: NodeStatus, fallback = 'unknown') {
  return node.name || fallback;
}

export function normalizeStatusPayload(payload: StatusByNode | NodeStatus[] | undefined | null): StatusByNode {
  if (!payload) {
    return {};
  }

  if (Array.isArray(payload)) {
    return Object.fromEntries(
      payload
        .filter((node) => Boolean(node?.name))
        .map((node, index) => [nodeDisplayName(node, `node-${index}`), node]),
    );
  }

  return payload;
}

export function statusNodes(status: StatusByNode | undefined) {
  return Object.values(status ?? {}).sort((a, b) => nodeDisplayName(a).localeCompare(nodeDisplayName(b)));
}

export function looksLikeTable(node: NodeStatus) {
  const value = `${node.name ?? ''} ${node.class ?? ''}`.toLowerCase();
  return value.includes('table') || value.includes('localdb');
}

export function operatorNodeType(status: NodeStatus | undefined, config?: RunningConfigNode): OperatorNodeType {
  const className = `${status?.class ?? config?.class ?? ''}`.toLowerCase();
  const configuredType = `${config?.node_type ?? config?.nodeType ?? ''}`.toLowerCase();
  const name = `${status?.name ?? ''}`.toLowerCase();

  if (className.includes('redisset') || name.startsWith('output-') || configuredType === 'output') {
    return 'output';
  }

  if (className.includes('aggregate') || configuredType === 'processor' || (status?.inputs?.length ?? config?.inputs?.length ?? 0) > 0) {
    return 'aggregate';
  }

  return 'miner';
}

export function operatorNodeTypeLabel(type: OperatorNodeType) {
  return type === 'aggregate' ? 'Aggregate' : type === 'output' ? 'Output' : 'Miner';
}

export function hasPipelineRole(node: NodeStatus) {
  return (node.inputs?.length ?? 0) > 0;
}

export function deriveCoreState(nodes: NodeStatus[]) {
  if (nodes.length === 0) {
    return 'NO NODES';
  }

  const health = summarizeNodeHealth(nodes);
  if (health.error > 0) {
    return 'ATTENTION';
  }
  if (health.paused === nodes.length) {
    return 'STOPPED';
  }

  return 'RUNNING';
}

export function classifyNodeHealth(node: NodeStatus): NodeHealth {
  const stateName = nodeStateName(node.state);
  const text = `${stateName} ${node.sub_state ?? ''} ${node.sub_state_message ?? ''}`.toLowerCase();

  if (text.includes('error') || text.includes('fail')) {
    return 'error';
  }

  if (stateName === 'STOPPED') {
    return 'paused';
  }

  if (stateName === 'INIT' || stateName === 'REBUILDING' || stateName === 'CHECKPOINT' || stateName.startsWith('STATE ')) {
    return 'pending';
  }

  if (stateName === 'UNKNOWN') {
    return 'unknown';
  }

  return 'running';
}

export function summarizeNodeHealth(nodes: NodeStatus[]) {
  return nodes.reduce(
    (summary, node) => {
      summary[classifyNodeHealth(node)] += 1;
      return summary;
    },
    { running: 0, pending: 0, paused: 0, error: 0, unknown: 0 } satisfies Record<NodeHealth, number>,
  );
}

export function summarizeNodeStates(nodes: NodeStatus[]) {
  return nodes.reduce<Record<string, number>>((summary, node) => {
    const stateName = nodeStateName(node.state);
    summary[stateName] = (summary[stateName] ?? 0) + 1;
    return summary;
  }, {});
}

export function summarizeNodeTypes(nodes: NodeStatus[]) {
  return nodes.reduce(
    (summary, node) => {
      if (looksLikeTable(node)) {
        summary.tables += 1;
      } else if (node.output) {
        summary.outputs += 1;
      } else if (hasPipelineRole(node)) {
        summary.processors += 1;
      } else {
        summary.miners += 1;
      }
      return summary;
    },
    { miners: 0, processors: 0, outputs: 0, tables: 0 },
  );
}

export function downstreamNodes(nodes: NodeStatus[], nodeName: string) {
  return nodes
    .filter((node) => (node.inputs ?? []).includes(nodeName))
    .sort((a, b) => nodeDisplayName(a).localeCompare(nodeDisplayName(b)));
}

export function upstreamFeedNodes(
  nodeName: string,
  nodes: NodeStatus[],
  configNodes: Record<string, RunningConfigNode> = {},
) {
  const byName = Object.fromEntries(nodes.map((node) => [nodeDisplayName(node), node]));
  const result = new Map<string, NodeStatus>();
  const visited = new Set<string>();

  const visit = (name: string) => {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);

    const status = byName[name];
    const config = configNodes[name];
    const inputs = status?.inputs ?? config?.inputs ?? [];

    if (name !== nodeName && operatorNodeType(status, config) === 'miner') {
      if (status) {
        result.set(name, status);
      }
      return;
    }

    inputs.forEach(visit);
  };

  visit(nodeName);

  return Array.from(result.values()).sort((a, b) => nodeDisplayName(a).localeCompare(nodeDisplayName(b)));
}
