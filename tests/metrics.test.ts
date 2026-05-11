import { describe, it, expect } from 'bun:test';
import { createMetricsCollector, computeAggregates } from '../src/metrics.js';
import type { RunMetrics } from '../src/types.js';

describe('MetricsCollector', () => {
  it('single run: startRun → recordFirstToken → recordChunk → finishRun returns valid RunMetrics', async () => {
    const collector = createMetricsCollector();
    const runId = collector.startRun();

    // Small delay so TTFT > 0
    await Bun.sleep(5);
    collector.recordFirstToken(runId);
    collector.recordChunk(runId, 100);

    // Small delay so totalTime > 0
    await Bun.sleep(5);
    const result = collector.finishRun(runId);

    expect(result.ttft).toBeGreaterThan(0);
    expect(result.totalTime).toBeGreaterThan(0);
    expect(result.totalTokens).toBe(100);
    expect(result.tokensPerSecond).toBeGreaterThan(0);
  });

  it('TTFT is positive', async () => {
    const collector = createMetricsCollector();
    const runId = collector.startRun();
    await Bun.sleep(2);
    collector.recordFirstToken(runId);
    collector.recordChunk(runId, 50);
    await Bun.sleep(2);
    const result = collector.finishRun(runId);
    expect(result.ttft).toBeGreaterThan(0);
  });

  it('tokensPerSecond calculation is correct', async () => {
    const collector = createMetricsCollector();
    const runId = collector.startRun();
    collector.recordFirstToken(runId);
    collector.recordChunk(runId, 200);
    await Bun.sleep(10);
    const result = collector.finishRun(runId);

    // tokensPerSecond = (totalTokens / totalTime) * 1000
    const expectedTps = (200 / result.totalTime) * 1000;
    expect(result.tokensPerSecond).toBeCloseTo(expectedTps, 2);
  });

  it('recordChunk accumulates token count', () => {
    const collector = createMetricsCollector();
    const runId = collector.startRun();
    collector.recordFirstToken(runId);
    collector.recordChunk(runId, 50);
    collector.recordChunk(runId, 30);
    collector.recordChunk(runId, 20);
    const result = collector.finishRun(runId);
    expect(result.totalTokens).toBe(100);
  });

  it('throws for unknown run ID', () => {
    const collector = createMetricsCollector();
    expect(() => collector.recordFirstToken('nonexistent')).toThrow('Unknown run');
    expect(() => collector.recordChunk('nonexistent', 1)).toThrow('Unknown run');
    expect(() => collector.finishRun('nonexistent')).toThrow('Unknown run');
  });
});

describe('computeAggregates', () => {
  it('5 sample runs → correct min/max/avg/p50/p95/p99', () => {
    const runs: RunMetrics[] = [
      { ttft: 10, totalTime: 100, totalTokens: 50, tokensPerSecond: 500 },
      { ttft: 20, totalTime: 200, totalTokens: 60, tokensPerSecond: 300 },
      { ttft: 30, totalTime: 300, totalTokens: 70, tokensPerSecond: 233.33 },
      { ttft: 40, totalTime: 400, totalTokens: 80, tokensPerSecond: 200 },
      { ttft: 50, totalTime: 500, totalTokens: 90, tokensPerSecond: 180 },
    ];

    const agg = computeAggregates(runs);

    expect(agg.ttft.min).toBe(10);
    expect(agg.ttft.max).toBe(50);
    expect(agg.ttft.avg).toBe(30);
    expect(agg.ttft.p50).toBe(30);

    expect(agg.totalTokens).toBe(350);
    expect(agg.threadCount).toBe(5);
    expect(agg.successCount).toBe(5);
    expect(agg.errorCount).toBe(0);
  });

  it('empty array → all zeros', () => {
    const agg = computeAggregates([]);
    expect(agg.ttft.min).toBe(0);
    expect(agg.ttft.max).toBe(0);
    expect(agg.ttft.avg).toBe(0);
    expect(agg.ttft.p50).toBe(0);
    expect(agg.ttft.p95).toBe(0);
    expect(agg.ttft.p99).toBe(0);
    expect(agg.tokensPerSecond.min).toBe(0);
    expect(agg.totalTime.min).toBe(0);
    expect(agg.totalTokens).toBe(0);
    expect(agg.threadCount).toBe(0);
    expect(agg.successCount).toBe(0);
    expect(agg.errorCount).toBe(0);
  });

  it('single element → min=max=avg=p50=p95=p99', () => {
    const runs: RunMetrics[] = [
      { ttft: 42, totalTime: 1000, totalTokens: 200, tokensPerSecond: 200 },
    ];
    const agg = computeAggregates(runs);
    expect(agg.ttft.min).toBe(42);
    expect(agg.ttft.max).toBe(42);
    expect(agg.ttft.avg).toBe(42);
    expect(agg.ttft.p50).toBe(42);
    expect(agg.ttft.p95).toBe(42);
    expect(agg.ttft.p99).toBe(42);
  });
});
