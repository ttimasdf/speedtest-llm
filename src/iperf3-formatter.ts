import type {
  SpeedTestConfig,
  IntervalSnapshot,
  AggregateMetrics,
  SpeedTestResult,
  PercentileStats,
} from './types.js';

const VERSION = '1.0.0';
const SEPARATOR = '- - - - - - - - - - - - - - - - - - - - - - - -';

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

export function formatHeader(config: SpeedTestConfig): string {
  return [
    `speedtest-llm v${VERSION} — `,
    `mode: ${config.mode}, `,
    `model: ${config.model}, `,
    `threads: ${config.threads}, `,
    `base-url: ${config.baseUrl}`,
  ].join('');
}

export function formatBanner(config: SpeedTestConfig): string {
  const lines: string[] = [];
  lines.push(formatHeader(config));

  if (config.verbose) {
    lines.push(`  max-tokens: ${config.maxTokens}`);
    lines.push(`  api-type: ${config.apiType}`);
    lines.push(`  output: ${config.output}`);
    lines.push(`  timeout: ${config.timeout / 1000}s`);
    lines.push(`  interval: ${config.interval}s, omit: ${config.omit}s`);
  }

  lines.push('Running speedtest...');
  lines.push('');

  return lines.join('\n');
}

export function formatColumnHeaders(): string {
  return 'Interval        Tokens     tok/s    Threads';
}

export function formatIntervalRow(snapshot: IntervalSnapshot): string {
  const interval = `${(snapshot.startTime / 1000).toFixed(2)}-${(snapshot.endTime / 1000).toFixed(2)}s`;
  const tokens = `~${snapshot.tokens}`;
  const tps = snapshot.tps.toFixed(1);
  const threads = `${snapshot.activeThreadCount}/${snapshot.threadCount}`;
  const omitted = snapshot.omitted ? '  (omitted)' : '';

  return (
    padRight(interval, 14) +
    padLeft(tokens, 7) + ' tokens  ' +
    padLeft(tps, 7) + ' tok/s  ' +
    padLeft(threads, 4) +
    omitted
  );
}

export function formatSeparator(): string {
  return SEPARATOR;
}

export function formatSummaryLine(
  aggregate: AggregateMetrics,
  totalIntervals: number,
): string {
  const measuredDuration = aggregate.measuredDuration ?? 0;
  const measuredTokensValue = aggregate.measuredTokens ?? aggregate.totalTokens;
  const measuredStart = aggregate.measuredStartTime ?? 0;
  const measuredEnd = aggregate.measuredEndTime ?? measuredDuration;
  const totalTps = aggregate.totalTokensPerSecond ?? 0;
  const totalDuration = measuredDuration > 0
    ? measuredDuration / 1000
    : totalIntervals;
  const interval = measuredDuration > 0
    ? `${(measuredStart / 1000).toFixed(2)}-${(measuredEnd / 1000).toFixed(2)}s`
    : `0.00-${totalDuration.toFixed(2)}s`;
  const measuredTokens = measuredDuration > 0 ? measuredTokensValue : aggregate.totalTokens;
  const tokens = `~${measuredTokens}`;
  const avgTps = measuredDuration > 0
    ? totalTps.toFixed(1)
    : totalDuration > 0
      ? (aggregate.totalTokens / totalDuration).toFixed(1)
      : '0.0';
  const threads = `${aggregate.threadCount}/${aggregate.threadCount}`;

  return (
    padRight(interval, 14) +
    padLeft(tokens, 7) + ' tokens  ' +
    padLeft(avgTps, 7) + ' tok/s  ' +
    padLeft(threads, 4)
  );
}

function formatPercentileLine(
  label: string,
  stats: PercentileStats,
  unit: string,
  valueWidth: number,
  divisor: number = 1,
): string {
  const fmt = (v: number) => {
    const formatted = (v / divisor).toFixed(2);
    return `${padLeft(formatted, valueWidth)}${unit}`;
  };
  return (
    padRight(label, 14) +
    `min=${fmt(stats.min)}  max=${fmt(stats.max)}  avg=${fmt(stats.avg)}  ` +
    `p50=${fmt(stats.p50)}  p95=${fmt(stats.p95)}  p99=${fmt(stats.p99)}`
  );
}

export function formatDetailedStats(aggregate: AggregateMetrics): string {
  const lines: string[] = [];
  lines.push('--- Detailed Stats ---');
  lines.push(formatPercentileLine('TTFT:', aggregate.ttft, 's', 6, 1000));
  lines.push(formatPercentileLine('tok/s:', aggregate.tokensPerSecond, '', 6));
  const totalTps = aggregate.totalTokensPerSecond ?? 0;
  const measuredTokens = aggregate.measuredTokens ?? aggregate.totalTokens;
  const measuredDuration = aggregate.measuredDuration ?? 0;
  const measuredStart = aggregate.measuredStartTime ?? 0;
  const measuredEnd = aggregate.measuredEndTime ?? measuredDuration;
  lines.push(`Total tok/s:  ${totalTps.toFixed(2)} (${measuredTokens} tokens / ${(measuredDuration / 1000).toFixed(2)}s measured, ${(measuredStart / 1000).toFixed(2)}-${(measuredEnd / 1000).toFixed(2)}s)`);
  return lines.join('\n');
}

export function formatFinal(
  config: SpeedTestConfig,
  result: SpeedTestResult,
  heatmap: string,
  intervals: IntervalSnapshot[],
): string {
  const lines: string[] = [];

  lines.push(formatBanner(config));
  lines.push(formatColumnHeaders());

  for (const interval of intervals) {
    lines.push(formatIntervalRow(interval));
  }

  lines.push(formatSeparator());
  lines.push(formatColumnHeaders());
  lines.push(formatSummaryLine(result.aggregate, intervals.length));
  lines.push('');
  lines.push(formatDetailedStats(result.aggregate));

  if (heatmap.length > 0) {
    lines.push('');
    lines.push('--- Heatmap (TPS per thread × interval) ---');
    lines.push(heatmap);
  }

  lines.push('');
  lines.push('speedtest-llm Done.');

  return lines.join('\n');
}
