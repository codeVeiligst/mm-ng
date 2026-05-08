import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Chart as ChartInstance, ChartDataset, ScriptableContext, TooltipItem } from 'chart.js';
import { MineMeldApi } from '../api/minemeld';
import { ErrorState, LoadingState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/StatTile';
import { StatusBadge } from '../components/StatusBadge';
import { displayUsername } from '../utils/authDisplay';
import {
  deriveCoreState,
  looksLikeTable,
  operatorNodeType,
  statusNodes,
  summarizeNodeHealth,
} from '../utils/status';
import type { MetricPoint, MetricSeries, PrototypeLibraries, RunningConfig, RunningConfigNode } from '../types/minemeld';

const CHART_RANGES = {
  '1h': { label: '1 hour', dt: 3600, r: 60 },
  '24h': { label: '24 hours', dt: 86400, r: 1800 },
  '7d': { label: '7 days', dt: 604800, r: 21600 },
  '30d': { label: '30 days', dt: 2592000, r: 43200 },
} as const;

type ChartRange = keyof typeof CHART_RANGES;
type TrendSeries = {
  label: string;
  color: string;
  values: MetricPoint[];
};
type TrendPoint = {
  x: number;
  y: number;
};

function SummaryBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="summary-bar">
      <div className="summary-bar-label">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="summary-bar-track" aria-label={`${label}: ${value}`}>
        <span className={`summary-bar-fill ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function metricValues(metrics: MetricSeries[] | undefined, name: string) {
  return metrics?.find((metric) => metric.metric === name)?.values?.filter((point) => typeof point[1] === 'number') ?? [];
}

function lastMetricValue(values: MetricPoint[]) {
  const last = [...values].reverse().find((point) => typeof point[1] === 'number');
  return typeof last?.[1] === 'number' ? Math.round(last[1]) : 0;
}

function chartTimestamp(timestamp: number) {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function rgba(hex: string, alpha: number) {
  const cleaned = hex.replace('#', '');
  const value = Number.parseInt(cleaned, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function TrendChart({ title, range, series, error }: { title: string; range: ChartRange; series: TrendSeries[]; error?: unknown }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartInstance<'line', TrendPoint[], number> | null>(null);
  const allPoints = series.flatMap((item) => item.values).filter((point): point is [number, number] => typeof point[1] === 'number');
  const hasData = allPoints.length > 1;
  const datasets = useMemo<Array<ChartDataset<'line', TrendPoint[]>>>(() => series.map((item) => ({
    label: item.label,
    data: item.values
      .filter((point): point is [number, number] => typeof point[1] === 'number')
      .map(([timestamp, value]) => ({ x: chartTimestamp(timestamp), y: value })),
    borderColor: item.color,
    backgroundColor: (context: ScriptableContext<'line'>) => {
      const chart = context.chart;
      const area = chart.chartArea;
      if (!area) {
        return rgba(item.color, 0.14);
      }
      const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      gradient.addColorStop(0, rgba(item.color, 0.24));
      gradient.addColorStop(1, rgba(item.color, 0.02));
      return gradient;
    },
    borderWidth: 2.5,
    cubicInterpolationMode: 'monotone',
    fill: true,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHitRadius: 14,
    tension: 0.38,
  })), [series]);

  useEffect(() => {
    if (!canvasRef.current || !hasData) {
      return;
    }

    let cancelled = false;
    let activeChart: ChartInstance<'line', TrendPoint[], number> | null = null;
    const canvas = canvasRef.current;

    void import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled) {
        return;
      }

      activeChart = new Chart<'line', TrendPoint[], number>(canvas, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          normalized: true,
          parsing: false,
          interaction: {
            intersect: false,
            mode: 'nearest',
            axis: 'x',
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              backgroundColor: '#17212b',
              borderColor: '#3d4b59',
              borderWidth: 1,
              cornerRadius: 6,
              displayColors: true,
              padding: 10,
              titleColor: '#ffffff',
              bodyColor: '#e6edf3',
              callbacks: {
                title: (items: Array<TooltipItem<'line'>>) => {
                  const timestamp = items[0]?.parsed.x;
                  return typeof timestamp === 'number' ? new Date(timestamp).toLocaleString() : '';
                },
                label: (item: TooltipItem<'line'>) => {
                  const value = typeof item.parsed.y === 'number' ? item.parsed.y : 0;
                  return `${item.dataset.label}: ${Math.round(value).toLocaleString()}`;
                },
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              grid: {
                color: 'rgba(134, 151, 168, 0.16)',
                drawTicks: false,
              },
              border: {
                display: false,
              },
              ticks: {
                color: '#657485',
                maxTicksLimit: 5,
                callback: (value) => new Date(Number(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            },
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(134, 151, 168, 0.16)',
                drawTicks: false,
              },
              border: {
                display: false,
              },
              ticks: {
                color: '#657485',
                maxTicksLimit: 4,
                callback: (value) => Math.round(Number(value)).toLocaleString(),
              },
            },
          },
          elements: {
            line: {
              borderCapStyle: 'round',
              borderJoinStyle: 'round',
            },
          },
          animation: {
            duration: 250,
          },
        },
      });
      chartRef.current = activeChart;
    });

    return () => {
      cancelled = true;
      activeChart?.destroy();
      chartRef.current = null;
    };
  }, [datasets, hasData]);

  return (
    <div className="dashboard-chart-card">
      <div className="chart-card-heading">
        <div>
          <h3>{title}</h3>
          <span>Last {range}</span>
        </div>
        <strong>{series.length ? lastMetricValue(series[0].values).toLocaleString() : '-'}</strong>
      </div>
      {error ? <div className="chart-placeholder">Unable to load metrics</div> : null}
      {!error && !hasData ? <div className="chart-placeholder">No stats yet</div> : null}
      {!error && hasData ? (
        <div className="trend-chart" role="img" aria-label={`${title} chart`}>
          <canvas ref={canvasRef} />
        </div>
      ) : null}
      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function normalizeIndicatorType(value: string | undefined): OutputIndicatorType | undefined {
  const normalized = `${value ?? ''}`.toLowerCase();
  if (normalized.includes('url')) {
    return 'URLs';
  }
  if (normalized.includes('domain') || normalized.includes('fqdn')) {
    return 'Domains';
  }
  if (
    normalized.includes('ipv4')
    || normalized.includes('ipv6')
    || normalized === 'ip'
    || normalized.includes('address')
    || normalized.includes('cidr')
    || normalized.includes('prefix')
    || normalized.includes('subnet')
  ) {
    return 'Prefixes';
  }

  return undefined;
}

type OutputIndicatorType = 'Domains' | 'URLs' | 'Prefixes';

function indicatorTypesForPrototype(prototypeName: string | undefined, prototypes: PrototypeLibraries | undefined) {
  const [libraryName, shortPrototypeName] = prototypeName?.split('.', 2) ?? [];
  const prototype = libraryName && shortPrototypeName ? prototypes?.[libraryName]?.prototypes?.[shortPrototypeName] : undefined;
  return prototype?.indicator_types ?? prototype?.indicatorTypes ?? [];
}

function inferConfiguredType(config: RunningConfigNode | undefined, prototypes: PrototypeLibraries | undefined): OutputIndicatorType | undefined {
  const prototypeName = config?.prototype;
  const indicatorTypes = indicatorTypesForPrototype(prototypeName, prototypes).concat(config?.indicator_types ?? config?.indicatorTypes ?? []);
  const explicit = indicatorTypes.find((type) => type !== 'any');
  if (explicit) {
    return normalizeIndicatorType(explicit);
  }

  return undefined;
}

function inferOutputType(
  name: string,
  config: RunningConfigNode | undefined,
  nodesByName: Record<string, ReturnType<typeof statusNodes>[number]>,
  configNodes: Record<string, RunningConfigNode>,
  prototypes: PrototypeLibraries | undefined,
  seen = new Set<string>(),
): OutputIndicatorType {
  const configuredType = inferConfiguredType(config, prototypes);
  if (configuredType) {
    return configuredType;
  }

  const nameType = normalizeIndicatorType(name);
  if (nameType) {
    return nameType;
  }

  if (seen.has(name)) {
    return 'Prefixes';
  }
  seen.add(name);

  const inputs = nodesByName[name]?.inputs ?? config?.inputs ?? [];
  for (const input of inputs) {
    const inputConfiguredType = inferConfiguredType(configNodes[input], prototypes);
    if (inputConfiguredType) {
      return inputConfiguredType;
    }

    const inputNameType = normalizeIndicatorType(input);
    if (inputNameType) {
      return inputNameType;
    }

    if (configNodes[input] || nodesByName[input]) {
      return inferOutputType(input, configNodes[input], nodesByName, configNodes, prototypes, seen);
    }
  }

  return 'Prefixes';
}

function outputTypeSlices(nodes: ReturnType<typeof statusNodes>, config: RunningConfig | undefined, prototypes: PrototypeLibraries | undefined) {
  const outputNodes = nodes.filter((node) => operatorNodeType(node, config?.nodes?.[node.name]) === 'output');
  const nodesByName = Object.fromEntries(nodes.map((node) => [node.name, node]));
  const configNodes = config?.nodes ?? {};
  const summary = outputNodes.reduce<Record<OutputIndicatorType, number>>((result, node) => {
    const label = inferOutputType(node.name, configNodes[node.name], nodesByName, configNodes, prototypes);
    result[label] += node.length ?? 0;
    return result;
  }, { Domains: 0, URLs: 0, Prefixes: 0 });

  return Object.entries(summary)
    .map(([label, value]) => ({ label, value }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
}

function DonutChart({ title, slices }: { title: string; slices: Array<{ label: string; value: number }> }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const colors = ['#f0c536', '#4bb8aa', '#5c8fcb', '#c77e73', '#7b8794'];
  let offset = 25;

  return (
    <div className="dashboard-chart-card">
      <div className="chart-card-heading">
        <div>
          <h3>{title}</h3>
          <span>Output-only indicator count by type</span>
        </div>
        <strong>{total.toLocaleString()}</strong>
      </div>
      {total === 0 ? <div className="chart-placeholder">No output indicators yet</div> : null}
      {total > 0 ? (
        <div className="donut-layout">
          <svg className="donut-chart" viewBox="0 0 42 42" role="img" aria-label={`${title} chart`}>
            <circle className="donut-base" cx="21" cy="21" r="15.915" />
            {slices.map((slice, index) => {
              const percent = (slice.value / total) * 100;
              const strokeDasharray = `${percent} ${100 - percent}`;
              const strokeDashoffset = offset;
              offset -= percent;
              return (
                <circle
                  key={slice.label}
                  className="donut-slice"
                  cx="21"
                  cy="21"
                  r="15.915"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  style={{ stroke: colors[index % colors.length] }}
                />
              );
            })}
          </svg>
          <div className="donut-legend">
            {slices.map((slice, index) => (
              <span key={slice.label}>
                <i style={{ background: colors[index % colors.length] }} />
                {slice.label}
                <strong>{slice.value.toLocaleString()} indicators</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StatusPage() {
  const [chartRange, setChartRange] = useState<ChartRange>('24h');
  const range = CHART_RANGES[chartRange];
  const userQuery = useQuery({ queryKey: ['aaa', 'current-user'], queryFn: MineMeldApi.currentUser });
  const statusQuery = useQuery({ queryKey: ['status'], queryFn: MineMeldApi.status, refetchInterval: 10_000 });
  const configQuery = useQuery({ queryKey: ['config', 'running'], queryFn: MineMeldApi.runningConfig, staleTime: 60_000 });
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes, staleTime: 60_000 });
  const globalMetricsQuery = useQuery({
    queryKey: ['metrics', 'minemeld', chartRange],
    queryFn: () => MineMeldApi.globalMetrics(range),
    refetchInterval: 300_000,
  });
  const minersMetricsQuery = useQuery({
    queryKey: ['metrics', 'miners', chartRange],
    queryFn: () => MineMeldApi.nodeTypeMetrics('miners', range),
    refetchInterval: 300_000,
  });
  const outputsMetricsQuery = useQuery({
    queryKey: ['metrics', 'outputs', chartRange],
    queryFn: () => MineMeldApi.nodeTypeMetrics('outputs', range),
    refetchInterval: 300_000,
  });

  const nodes = statusNodes(statusQuery.data);
  const health = summarizeNodeHealth(nodes);
  const nodeTypes = nodes.reduce(
    (summary, node) => {
      if (looksLikeTable(node)) {
        return summary;
      }

      const type = operatorNodeType(node, configQuery.data?.nodes?.[node.name]);
      if (type === 'miner') {
        summary.miners += 1;
      } else if (type === 'aggregate') {
        summary.processors += 1;
      } else {
        summary.outputs += 1;
      }

      return summary;
    },
    { miners: 0, processors: 0, outputs: 0 },
  );
  const indicatorCounts = nodes.reduce(
    (summary, node) => {
      if (looksLikeTable(node)) {
        return summary;
      }
      const type = operatorNodeType(node, configQuery.data?.nodes?.[node.name]);
      summary[type] += node.length ?? 0;
      return summary;
    },
    { miner: 0, aggregate: 0, output: 0 },
  );
  const loading = userQuery.isLoading || statusQuery.isLoading || configQuery.isLoading;
  const error = userQuery.error ?? statusQuery.error ?? configQuery.error;
  const username = displayUsername(userQuery.data, '-');
  const usernameSize = username.length > 42 ? '0.82rem' : username.length > 32 ? '0.95rem' : username.length > 24 ? '1.1rem' : undefined;
  const globalLength = metricValues(globalMetricsQuery.data, 'length');
  const minersLength = metricValues(minersMetricsQuery.data, 'length');
  const outputsLength = metricValues(outputsMetricsQuery.data, 'length');
  const minersAdded = metricValues(minersMetricsQuery.data, 'added');
  const minersAgedOut = metricValues(minersMetricsQuery.data, 'aged_out');
  const outputsAdded = metricValues(outputsMetricsQuery.data, 'added');
  const outputsRemoved = metricValues(outputsMetricsQuery.data, 'removed');
  const outputSlices = outputTypeSlices(nodes, configQuery.data, prototypesQuery.data);
  const totalIndicators = indicatorCounts.miner + indicatorCounts.aggregate + indicatorCounts.output;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="High-level MineMeld health, size, and runtime composition."
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} /> : null}
      {!loading && !error ? (
        <>
          <section className="stats-grid">
            <StatTile
              className="user-stat-tile"
              label="User"
              value={<span className="fit-username" style={usernameSize ? { fontSize: usernameSize } : undefined}>{username}</span>}
              hint={userQuery.data?.read_write ? 'read-write' : 'read-only'}
            />
            <StatTile label="Core" value={<StatusBadge label={deriveCoreState(nodes)} />} />
            <StatTile label="Nodes" value={nodes.length} />
            <StatTile label="Indicators" value={totalIndicators.toLocaleString()} />
          </section>
          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Health</h2>
                <p>Node state distribution from the live MineMeld runtime.</p>
              </div>
              <Link className="text-link" to="/nodes">
                Inspect nodes
              </Link>
            </div>
            <div className="summary-bars">
              <SummaryBar label="Running" value={health.running} total={nodes.length} tone="good" />
              <SummaryBar label="Pending" value={health.pending} total={nodes.length} tone="warn" />
              <SummaryBar label="Paused" value={health.paused} total={nodes.length} tone="neutral" />
              <SummaryBar label="Error" value={health.error} total={nodes.length} tone="bad" />
              <SummaryBar label="Unknown" value={health.unknown} total={nodes.length} tone="neutral" />
            </div>
          </section>
          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Trends</h2>
                <p>Indicator history from MineMeld metrics.</p>
              </div>
              <label className="chart-range-select">
                Range
                <select value={chartRange} onChange={(event) => setChartRange(event.target.value as ChartRange)}>
                  {Object.entries(CHART_RANGES).map(([value, option]) => (
                    <option key={value} value={value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="dashboard-chart-grid">
              <TrendChart
                title="All Indicators"
                range={chartRange}
                error={globalMetricsQuery.error}
                series={[{ label: 'Indicators', color: '#5c8fcb', values: globalLength }]}
              />
              <TrendChart
                title="Mined Entries"
                range={chartRange}
                error={minersMetricsQuery.error}
                series={[
                  { label: 'Current', color: '#4bb8aa', values: minersLength },
                  { label: 'Added', color: '#586994', values: minersAdded },
                  { label: 'Aged out', color: '#977390', values: minersAgedOut },
                ]}
              />
              <TrendChart
                title="Outputs"
                range={chartRange}
                error={outputsMetricsQuery.error}
                series={[
                  { label: 'Current', color: '#f0c536', values: outputsLength },
                  { label: 'Added', color: '#586994', values: outputsAdded },
                  { label: 'Removed', color: '#c77e73', values: outputsRemoved },
                ]}
              />
              <DonutChart title="Output Indicators" slices={outputSlices} />
            </div>
          </section>
          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Size</h2>
                <p>Compact counts for the main MineMeld concepts.</p>
              </div>
            </div>
            <div className="compact-summary-grid">
              <StatTile label="Miners" value={nodeTypes.miners} hint={`${indicatorCounts.miner.toLocaleString()} indicators`} />
              <StatTile label="Aggregates" value={nodeTypes.processors} hint={`${indicatorCounts.aggregate.toLocaleString()} indicators`} />
              <StatTile label="Outputs" value={nodeTypes.outputs} hint={`${indicatorCounts.output.toLocaleString()} indicators`} />
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
