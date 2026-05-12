import { describe, it, expect } from 'bun:test';
import {
  formatHeader,
  formatBanner,
  formatColumnHeaders,
  formatIntervalRow,
  formatSeparator,
  formatSummaryLine,
  formatDetailedStats,
  formatFinal,
} from '../src/iperf3-formatter.js';
import type {
  SpeedTestConfig,
  IntervalSnapshot,
  AggregateMetrics,
  SpeedTestResult,
  PercentileStats,
} from '../src/types.js';


function makeConfig(overrides: Partial<SpeedTestConfig> = {}): SpeedTestConfig {
  return {
    mode: 'fresh',
    baseUrl: 'http://localhost:4000/v1',
    model: 'gpt-4o',
    maxTokens: 4096,
    threads: 3,
    apiKey: 'test',
    apiType: 'openai-chat',
    contextFile: 'assets/long-context.txt',
    output: 'terminal',
    timeout: 60000,
    verbose: false,
    rampUp: 0,
    interval: 1,
    omit: 2,
    ...overrides,
  };
}

const defaultPercentile: PercentileStats = {
  min: 10,
  max: 50,
  avg: 30,
  p50: 30,
  p95: 48,
  p99: 50,
};

function makeAggregate(overrides: Partial<AggregateMetrics> = {}): AggregateMetrics {
  return {
    ttft: { ...defaultPercentile },
    tokensPerSecond: { min: 100, max: 500, avg: 300, p50: 300, p95: 480, p99: 500 },
    totalTime: { min: 2000, max: 5000, avg: 3000, p50: 3000, p95: 4800, p99: 5000 },
    totalTokens: 755,
    threadCount: 3,
    successCount: 3,
    errorCount: 0,
    intervalTps: { ...defaultPercentile },
    totalIntervals: 4,
    ...overrides,
  };
}

function makeInterval(overrides: Partial<IntervalSnapshot> = {}): IntervalSnapshot {
  return {
    startTime: 0,
    endTime: 1000,
    tokens: 150,
    tps: 150.0,
    threadCount: 3,
    activeThreadCount: 3,
    omitted: false,
    ...overrides,
  };
}

function makeResult(overrides: Partial<SpeedTestResult> = {}): SpeedTestResult {
  return {
    mode: 'fresh',
    config: makeConfig(),
    threads: [
      { ttft: 10, totalTime: 100, totalTokens: 50, tokensPerSecond: 500 },
    ],
    aggregate: makeAggregate(),
    errors: [],
    timestamp: '2025-01-01T00:00:00.000Z',
    intervals: [
      makeInterval({ startTime: 0, endTime: 1000, tokens: 150, tps: 150.0, omitted: true }),
      makeInterval({ startTime: 1000, endTime: 2000, tokens: 200, tps: 200.0, omitted: true }),
      makeInterval({ startTime: 2000, endTime: 3000, tokens: 210, tps: 210.0 }),
      makeInterval({ startTime: 3000, endTime: 4000, tokens: 195, tps: 195.0 }),
    ],
    threadStates: [],
    ...overrides,
  };
}


describe('formatHeader', () => {
  it('formats header with config fields', () => {
    const config = makeConfig();
    const result = formatHeader(config);
    expect(result).toContain('speedtest-llm v1.0.0');
    expect(result).toContain('mode: fresh');
    expect(result).toContain('model: gpt-4o');
    expect(result).toContain('threads: 3');
    expect(result).toContain('base-url: http://localhost:4000/v1');
  });

  it('uses em dash separator', () => {
    const result = formatHeader(makeConfig());
    expect(result).toContain(' — ');
  });

  it('starts with speedtest-llm', () => {
    const result = formatHeader(makeConfig());
    expect(result.startsWith('speedtest-llm')).toBe(true);
  });
});

describe('formatBanner', () => {
  it('includes formatHeader content', () => {
    const config = makeConfig();
    const result = formatBanner(config);
    expect(result).toContain('speedtest-llm v1.0.0');
    expect(result).toContain('mode: fresh');
    expect(result).toContain('model: gpt-4o');
    expect(result).toContain('threads: 3');
    expect(result).toContain('base-url: http://localhost:4000/v1');
  });

  it('includes Running speedtest...', () => {
    const result = formatBanner(makeConfig());
    expect(result).toContain('Running speedtest...');
  });

  it('has blank line after Running speedtest...', () => {
    const result = formatBanner(makeConfig());
    expect(result).toMatch(/Running speedtest\.\.\.\n$/);
  });

  it('includes verbose detail lines when verbose is true', () => {
    const config = makeConfig({ verbose: true });
    const result = formatBanner(config);
    expect(result).toContain('  max-tokens: 4096');
    expect(result).toContain('  api-type: openai-chat');
    expect(result).toContain('  output: terminal');
    expect(result).toContain('  timeout: 60s');
    expect(result).toContain('  interval: 1s, omit: 2s');
  });

  it('excludes verbose detail lines when verbose is false', () => {
    const result = formatBanner(makeConfig({ verbose: false }));
    expect(result).not.toContain('  max-tokens:');
    expect(result).not.toContain('  api-type:');
    expect(result).not.toContain('  timeout:');
    expect(result).not.toContain('  interval:');
  });

  it('has zero box-drawing chars', () => {
    const result = formatBanner(makeConfig());
    expect(result).not.toMatch(/[╔╗╚╝╠╣╦╩╬│]/);
  });
});

describe('formatColumnHeaders', () => {
  it('contains expected column headers', () => {
    const result = formatColumnHeaders();
    expect(result).toContain('ID');
    expect(result).toContain('Interval');
    expect(result).toContain('Tokens');
    expect(result).toContain('tok/s');
    expect(result).toContain('Threads');
  });

  it('has [ ID] prefix', () => {
    const result = formatColumnHeaders();
    expect(result.startsWith('[ ID]')).toBe(true);
  });
});

describe('formatIntervalRow', () => {
  it('formats a normal interval row', () => {
    const snapshot = makeInterval({
      startTime: 2000,
      endTime: 3000,
      tokens: 210,
      tps: 210.0,
      threadCount: 3,
      activeThreadCount: 3,
      omitted: false,
    });
    const result = formatIntervalRow(snapshot);
    expect(result).toContain('[ALL]');
    expect(result).toContain('2.00-3.00s');
    expect(result).toContain('~210');
    expect(result).toContain('210.0');
    expect(result).toContain('3/3');
    expect(result).not.toContain('(omitted)');
  });

  it('formats an omitted interval row with (omitted) suffix', () => {
    const snapshot = makeInterval({
      startTime: 0,
      endTime: 1000,
      tokens: 150,
      tps: 150.0,
      threadCount: 3,
      activeThreadCount: 3,
      omitted: true,
    });
    const result = formatIntervalRow(snapshot);
    expect(result).toContain('(omitted)');
  });

  it('uses ~ prefix for token count', () => {
    const snapshot = makeInterval({ tokens: 42, tps: 42.0 });
    const result = formatIntervalRow(snapshot);
    expect(result).toContain('~42');
  });
});

describe('formatSeparator', () => {
  it('contains only dashes and spaces', () => {
    const result = formatSeparator();
    expect(result).toMatch(/^[- ]+$/);
  });
});

describe('formatSummaryLine', () => {
  it('formats cumulative totals', () => {
    const aggregate = makeAggregate({ totalTokens: 755, threadCount: 3 });
    const result = formatSummaryLine(aggregate, 4);
    expect(result).toContain('[ALL]');
    expect(result).toContain('0.00-4.00s');
    expect(result).toContain('~755');
    expect(result).toContain('3/3');
  });

  it('calculates average TPS from total tokens and total intervals', () => {
    const aggregate = makeAggregate({
      totalTokens: 755,
      threadCount: 3,
      totalIntervals: 4,
    });
    const result = formatSummaryLine(aggregate, 4);
    expect(result).toContain('188.8');
  });
});

describe('formatDetailedStats', () => {
  it('contains labeled stats for ttft', () => {
    const aggregate = makeAggregate();
    const result = formatDetailedStats(aggregate);
    expect(result).toContain('TTFT');
    expect(result).toContain('min=');
    expect(result).toContain('max=');
    expect(result).toContain('avg=');
    expect(result).toContain('p50=');
    expect(result).toContain('p95=');
    expect(result).toContain('p99=');
  });

  it('contains totalTime stats', () => {
    const aggregate = makeAggregate();
    const result = formatDetailedStats(aggregate);
    expect(result).toContain('Total Time');
  });

  it('contains tok/s stats', () => {
    const aggregate = makeAggregate();
    const result = formatDetailedStats(aggregate);
    expect(result).toMatch(/tok\/s/);
  });

  it('has "--- Detailed Stats ---" header', () => {
    const result = formatDetailedStats(makeAggregate());
    expect(result).toContain('--- Detailed Stats ---');
  });

  it('formats ttft values in seconds', () => {
    const aggregate = makeAggregate();
    const result = formatDetailedStats(aggregate);
    expect(result).toContain('TTFT:');
    expect(result).toContain('s  ');
    expect(result).not.toContain('ms');
  });

  it('formats totalTime values with s units', () => {
    const aggregate = makeAggregate();
    const result = formatDetailedStats(aggregate);
    expect(result).toContain('s');
  });
});

describe('formatFinal', () => {
  it('assembles complete output with all sections', () => {
    const config = makeConfig();
    const result = makeResult();
    const heatmap = 'T1 ████\nT2 ███·\nT3 ···█';
    const output = formatFinal(config, result, heatmap, result.intervals as IntervalSnapshot[]);

    expect(output).toContain('speedtest-llm v1.0.0');
    expect(output).toContain('[ ID]');
    expect(output).toContain('[ALL]');
    expect(output).toContain('--- Detailed Stats ---');
    expect(output).toContain('T1 ████');
    expect(output).toContain('speedtest-llm Done.');
  });

  it('ends with "speedtest-llm Done."', () => {
    const config = makeConfig();
    const result = makeResult();
    const output = formatFinal(config, result, '', []);
    const trimmed = output.trimEnd();
    expect(trimmed.endsWith('speedtest-llm Done.')).toBe(true);
  });

  it('contains separator between intervals and summary', () => {
    const config = makeConfig();
    const result = makeResult();
    const output = formatFinal(config, result, '', result.intervals as IntervalSnapshot[]);
    expect(output).toContain('- - -');
  });

  it('omits heatmap section when heatmap is empty', () => {
    const config = makeConfig();
    const result = makeResult();
    const output = formatFinal(config, result, '', []);
    expect(output).not.toContain('--- Heatmap');
  });

  it('includes heatmap section when heatmap is non-empty', () => {
    const config = makeConfig();
    const result = makeResult();
    const heatmap = 'T1 ████';
    const output = formatFinal(config, result, heatmap, []);
    expect(output).toContain('--- Heatmap');
    expect(output).toContain('T1 ████');
  });
});

describe('no box-drawing characters', () => {
  it('formatHeader has zero box-drawing chars', () => {
    const result = formatHeader(makeConfig());
    expect(result).not.toMatch(/[╔═╗║╚╝╠╣╦╩╬─│]/);
  });

  it('formatColumnHeaders has zero box-drawing chars', () => {
    const result = formatColumnHeaders();
    expect(result).not.toMatch(/[╔═╗║╚╝╠╣╦╩╬─│]/);
  });

  it('formatIntervalRow has zero box-drawing chars', () => {
    const result = formatIntervalRow(makeInterval());
    expect(result).not.toMatch(/[╔═╗║╚╝╠╣╦╩╬─│]/);
  });

  it('formatSeparator has zero box-drawing chars', () => {
    const result = formatSeparator();
    expect(result).not.toMatch(/[╔═╗║╚╝╠╣╦╩╬─│]/);
  });

  it('formatSummaryLine has zero box-drawing chars', () => {
    const result = formatSummaryLine(makeAggregate(), 4);
    expect(result).not.toMatch(/[╔═╗║╚╝╠╣╦╩╬─│]/);
  });

  it('formatDetailedStats has zero box-drawing chars', () => {
    const result = formatDetailedStats(makeAggregate());
    expect(result).not.toMatch(/[╔═╗║╚╝╠╣╦╩╬─│]/);
  });

  it('formatFinal has zero box-drawing chars', () => {
    const config = makeConfig();
    const result = makeResult();
    const output = formatFinal(config, result, 'T1 ██', result.intervals as IntervalSnapshot[]);
    expect(output).not.toMatch(/[╔╗╚╝╠╣╦╩╬│]/);
  });
});
