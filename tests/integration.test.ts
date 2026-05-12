import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type {
  SpeedTestConfig,
  RunMetrics,
} from '../src/types.js';
import type { MetricsCollector } from '../src/metrics.js';

type RunnerImpl = (
  config: SpeedTestConfig,
  model: unknown,
  metricsFactory: () => MetricsCollector,
  context: string,
  onStream?: (event: 'first-token' | 'chunk' | 'done') => void,
  signal?: AbortSignal,
) => Promise<RunMetrics>;

let mockRunnerImpl: RunnerImpl;

const mockRun = mock(async (...args: [SpeedTestConfig, unknown, () => MetricsCollector, string, ((e: 'first-token' | 'chunk' | 'done') => void)?]) =>
  mockRunnerImpl(...args),
);

mock.module('../src/modes/registry.js', () => ({
  getRunner: () => ({
    name: 'mock-runner',
    description: 'mock runner for integration tests',
    run: mockRun,
  }),
}));

mock.module('../src/providers/factory.js', () => ({
  createProvider: () => ({}),
}));

mock.module('../src/context-loader.js', () => ({
  loadContext: async () => 'mock long-context payload',
}));

// Imports AFTER module mocking — bun:mock requires mock.module() before ESM imports
import { executeParallel } from '../src/executor.js';
import {
  formatBanner,
  formatIntervalRow,
  formatFinal,
} from '../src/iperf3-formatter.js';
import { convertToHeatmapCells, formatJson, writeJsonOutput } from '../src/output.js';
import { renderHeatmap } from '../src/heatmap-renderer.js';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function makeConfig(overrides: Partial<SpeedTestConfig> = {}): SpeedTestConfig {
  return {
    mode: 'fresh',
    baseUrl: 'http://localhost:4000/v1',
    model: 'test-model',
    maxTokens: 4096,
    threads: 1,
    apiKey: 'test-key',
    apiType: 'openai-chat',
    contextFile: 'assets/long-context.txt',
    output: 'terminal',
    timeout: 60000,
    verbose: false,
    rampUp: 0,
    interval: 1,
    omit: 0,
    ...overrides,
  };
}

async function streamingRunner(
  config: SpeedTestConfig,
  _model: unknown,
  metricsFactory: () => MetricsCollector,
  _context: string,
  onStream?: (event: 'first-token' | 'chunk' | 'done') => void,
  _signal?: AbortSignal,
  opts: { durationMs: number; chunksPerTick: number; failAfterMs?: number; errorMsg?: string } = {
    durationMs: 2500,
    chunksPerTick: 10,
  },
): Promise<RunMetrics> {
  const collector = metricsFactory();
  const runId = collector.startRun();

  await Bun.sleep(20);
  collector.recordFirstToken(runId);
  onStream?.('first-token');

  const start = performance.now();

  while (performance.now() - start < opts.durationMs) {
    if (opts.failAfterMs !== undefined && performance.now() - start >= opts.failAfterMs) {
      throw new Error(opts.errorMsg ?? 'Simulated thread failure');
    }
    await Bun.sleep(100);
    for (let i = 0; i < opts.chunksPerTick; i++) {
      onStream?.('chunk');
      collector.recordChunk(runId, 1);
    }
  }

  onStream?.('done');
  return collector.finishRun(runId);
}

function spreadIntervals(result: Awaited<ReturnType<typeof executeParallel>>) {
  return [...(result.intervals ?? [])];
}

describe('Integration: iperf3-style output', () => {
  beforeEach(() => {
    mockRun.mockClear();
    mockRunnerImpl = (...args) => streamingRunner(...args);
  });

  it('fresh mode → full iperf3 output structure (banner, intervals, summary, heatmap, Done.)', async () => {
    const config = makeConfig({ threads: 2, interval: 1, omit: 0 });
    const result = await executeParallel(config);

    expect(result.intervals).toBeDefined();
    expect(result.intervals!.length).toBeGreaterThanOrEqual(2);
    expect(result.threadStates).toBeDefined();
    expect(result.threadStates!.length).toBeGreaterThanOrEqual(2);

    const heatmapCells = convertToHeatmapCells(result);
    const heatmap = renderHeatmap(heatmapCells, 40, true);
    const intervals = spreadIntervals(result);
    const output = formatFinal(config, result, heatmap, intervals);

    expect(output).toContain('speedtest-llm v1.0.0');
    expect(output).toContain('mode: fresh');
    expect(output).toContain('model: test-model');
    expect(output).toContain('threads: 2');
    expect(output).toContain('Running speedtest...');
    expect(output).toContain('[ ID] Interval        Tokens     tok/s    Threads');
    expect(output).toContain('[ALL]');
    expect(output).toContain('tokens');
    expect(output).toContain('tok/s');
    expect(output).toContain('- - - - - - - - - - - - - - - - - - - - - - - -');
    expect(output).toMatch(/\[ALL\].*0\.00-.*s/);
    expect(output).toContain('--- Detailed Stats ---');
    expect(output).toContain('TTFT:');
    expect(output).toContain('Total Time:');
    expect(output).toContain('tok/s:');
    expect(output).toContain('--- Heatmap (TPS per thread × interval) ---');
    expect(output).toContain('T1');
    expect(output).toContain('T2');
    expect(output).toContain('speedtest-llm Done.');
  });

  it('fresh mode with -i 2 --omit 1 → correct interval timing', async () => {
    const config = makeConfig({ threads: 1, interval: 2, omit: 1 });
    mockRunnerImpl = (...args) =>
      streamingRunner(...args, { durationMs: 5000, chunksPerTick: 10 });

    const result = await executeParallel(config);
    const intervals = spreadIntervals(result);

    expect(intervals.length).toBeGreaterThanOrEqual(2);

    expect(intervals[0].startTime).toBe(0);
    expect(intervals[0].endTime).toBe(2000);
    expect(intervals[1].startTime).toBe(2000);
    expect(intervals[1].endTime).toBe(4000);

    // interval=2, omit=1: intervalEnd (2000ms) > omitMs (1000ms) → no intervals omitted
    expect(intervals[0].omitted).toBe(false);

    const row = formatIntervalRow(intervals[0]);
    expect(row).toContain('0.00-2.00s');
    expect(row).not.toContain('(omitted)');

    const output = formatFinal(config, result, '', intervals);
    expect(output).toContain('0.00-2.00s');
    expect(output).toContain('2.00-4.00s');
  }, 15000);

  it('cached-long-context mode → output has intervals', async () => {
    const config = makeConfig({ mode: 'cached-long-context', threads: 1, interval: 1 });
    const result = await executeParallel(config);

    expect(result.mode).toBe('cached-long-context');
    expect(result.intervals).toBeDefined();
    expect(result.intervals!.length).toBeGreaterThanOrEqual(2);

    const intervals = spreadIntervals(result);
    const output = formatFinal(config, result, '', intervals);
    expect(output).toContain('mode: cached-long-context');
    expect(output).toContain('[ALL]');
    expect(output).toContain('speedtest-llm Done.');
  });

  it('prefill mode → output has intervals', async () => {
    mockRunnerImpl = (...args) =>
      streamingRunner(...args, { durationMs: 1500, chunksPerTick: 2 });

    const config = makeConfig({ mode: 'prefill', threads: 1, interval: 1 });
    const result = await executeParallel(config);

    expect(result.mode).toBe('prefill');
    expect(result.intervals).toBeDefined();
    expect(result.intervals!.length).toBeGreaterThanOrEqual(1);

    const intervals = spreadIntervals(result);
    const output = formatFinal(config, result, '', intervals);
    expect(output).toContain('mode: prefill');
    expect(output).toContain('[ALL]');
    expect(output).toContain('speedtest-llm Done.');
  });

  it('JSON output → verify structure has intervals, heatmap, threadStates', async () => {
    const config = makeConfig({ threads: 2, output: 'json' });
    const result = await executeParallel(config);

    const heatmapCells = convertToHeatmapCells(result);
    expect(heatmapCells.length).toBe(2);
    expect(heatmapCells[0].length).toBeGreaterThanOrEqual(2);

    const jsonStr = formatJson(result);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.mode).toBe('fresh');
    expect(parsed.config).toBeDefined();
    expect(parsed.config.model).toBe('test-model');
    expect(parsed.threads).toBeInstanceOf(Array);
    expect(parsed.threads.length).toBe(2);
    expect(parsed.aggregate).toBeDefined();
    expect(parsed.aggregate.threadCount).toBe(2);
    expect(parsed.timestamp).toBeTruthy();

    expect(parsed.intervals).toBeInstanceOf(Array);
    expect(parsed.intervals.length).toBeGreaterThanOrEqual(2);
    expect(parsed.intervals[0]).toHaveProperty('startTime');
    expect(parsed.intervals[0]).toHaveProperty('endTime');
    expect(parsed.intervals[0]).toHaveProperty('tokens');
    expect(parsed.intervals[0]).toHaveProperty('tps');
    expect(parsed.intervals[0]).toHaveProperty('omitted');

    expect(parsed.threadStates).toBeInstanceOf(Array);
    expect(parsed.threadStates.length).toBeGreaterThanOrEqual(2);
    expect(parsed.threadStates[0]).toBeInstanceOf(Array);
    expect(parsed.threadStates[0].length).toBe(2);
    expect(parsed.threadStates[0][0]).toHaveProperty('state');
    expect(parsed.threadStates[0][0]).toHaveProperty('tokensInInterval');
  });

  it('JSON output with output-file → writes to file', async () => {
    const tmpFile = '/tmp/speedtest-integration-json-test.json';
    const config = makeConfig({ threads: 1, output: 'json', outputFile: tmpFile });
    const result = await executeParallel(config);

    writeJsonOutput(result, config);
    await Bun.sleep(200);

    const file = Bun.file(tmpFile);
    expect(await file.exists()).toBe(true);

    const content = await file.text();
    const parsed = JSON.parse(content);
    expect(parsed.mode).toBe('fresh');
    expect(parsed.intervals).toBeInstanceOf(Array);

    await Bun.$`rm -f ${tmpFile}`;
  });

  it('non-TTY heatmap → no ANSI escape codes', async () => {
    const config = makeConfig({ threads: 2, interval: 1 });
    const result = await executeParallel(config);

    const heatmapCells = convertToHeatmapCells(result);
    expect(heatmapCells.length).toBe(2);

    const nonTtyHeatmap = renderHeatmap(heatmapCells, 40, false);
    expect(nonTtyHeatmap.length).toBeGreaterThan(0);
    expect(nonTtyHeatmap).not.toMatch(ANSI_RE);
    expect(nonTtyHeatmap).toContain('T1');
    expect(nonTtyHeatmap).toContain('T2');

    const ttyHeatmap = renderHeatmap(heatmapCells, 40, true);
    expect(ttyHeatmap).toMatch(ANSI_RE);
  });

  it('error handling → errors displayed when a thread fails', async () => {
    let callCount = 0;
    mockRunnerImpl = async (config, model, metricsFactory, context, onStream) => {
      callCount++;
      if (callCount === 2) {
        onStream?.('first-token');
        await Bun.sleep(100);
        throw new Error('Simulated connection timeout');
      }
      return streamingRunner(config, model, metricsFactory, context, onStream, {
        durationMs: 2000,
        chunksPerTick: 10,
      });
    };

    const config = makeConfig({ threads: 3, interval: 1 });
    const result = await executeParallel(config);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Simulated connection timeout');
    expect(result.aggregate.errorCount).toBe(1);
    expect(result.aggregate.successCount).toBe(2);
    expect(result.threads).toHaveLength(2);

    const intervals = spreadIntervals(result);
    const output = formatFinal(config, result, '', intervals);
    expect(output).toContain('speedtest-llm Done.');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('verbose mode → extra detail lines in banner', async () => {
    const config = makeConfig({ verbose: true });
    const banner = formatBanner(config);

    expect(banner).toContain('max-tokens: 4096');
    expect(banner).toContain('api-type: openai-chat');
    expect(banner).toContain('output: terminal');
    expect(banner).toContain('timeout: 60s');
    expect(banner).toContain('interval: 1s');
    expect(banner).toContain('omit: 0s');

    const nonVerboseBanner = formatBanner(makeConfig({ verbose: false }));
    expect(nonVerboseBanner).not.toContain('max-tokens:');
    expect(nonVerboseBanner).not.toContain('api-type:');
    expect(nonVerboseBanner).toContain('Running speedtest...');
  });

  it('multiple threads → per-thread state tracking', async () => {
    const config = makeConfig({ threads: 3, interval: 1 });
    const result = await executeParallel(config);

    expect(result.threads).toHaveLength(3);
    expect(result.threadStates).toBeDefined();
    expect(result.threadStates!.length).toBeGreaterThanOrEqual(2);

    for (const intervalStates of result.threadStates!) {
      expect(intervalStates).toHaveLength(3);
      for (const state of intervalStates) {
        expect(['waiting', 'streaming', 'done']).toContain(state.state);
        expect(typeof state.tokensInInterval).toBe('number');
      }
    }

    const heatmapCells = convertToHeatmapCells(result);
    expect(heatmapCells).toHaveLength(3);

    const intervalCount = result.threadStates!.length;
    for (const row of heatmapCells) {
      expect(row).toHaveLength(intervalCount);
    }

    const heatmap = renderHeatmap(heatmapCells, 40, false);
    expect(heatmap).toContain('T1');
    expect(heatmap).toContain('T2');
    expect(heatmap).toContain('T3');
  });

  it('interval snapping at correct boundaries', async () => {
    const config = makeConfig({ threads: 1, interval: 1, omit: 0 });
    mockRunnerImpl = (...args) =>
      streamingRunner(...args, { durationMs: 3500, chunksPerTick: 10 });

    const result = await executeParallel(config);
    const intervals = spreadIntervals(result);

    expect(intervals.length).toBeGreaterThanOrEqual(3);

    expect(intervals[0].startTime).toBe(0);
    expect(intervals[0].endTime).toBe(1000);
    expect(intervals[1].startTime).toBe(1000);
    expect(intervals[1].endTime).toBe(2000);
    expect(intervals[2].startTime).toBe(2000);
    expect(intervals[2].endTime).toBe(3000);

    if (intervals.length >= 4) {
      expect(intervals[3].startTime).toBe(3000);
      expect(intervals[3].endTime).toBeGreaterThan(3000);
      expect(intervals[3].endTime).toBeLessThanOrEqual(4000);
    }

    const fullIntervals = intervals.filter(i => i.endTime - i.startTime === 1000);
    for (const interval of fullIntervals) {
      expect(interval.tokens).toBeGreaterThanOrEqual(0);
      expect(interval.threadCount).toBe(1);
      expect(interval.activeThreadCount).toBeGreaterThanOrEqual(0);
    }

    const totalTokens = intervals.reduce((sum, i) => sum + i.tokens, 0);
    expect(totalTokens).toBeGreaterThan(0);

    const row0 = formatIntervalRow(intervals[0]);
    expect(row0).toContain('0.00-1.00s');

    const row1 = formatIntervalRow(intervals[1]);
    expect(row1).toContain('1.00-2.00s');
  }, 15000);
});
