import { describe, it, expect } from 'bun:test';
import { formatJson } from '../src/output.js';
import type { SpeedTestResult, SpeedTestConfig, RunMetrics, AggregateMetrics } from '../src/types.js';

function makeConfig(overrides: Partial<SpeedTestConfig> = {}): SpeedTestConfig {
  return {
    mode: 'fresh',
    baseUrl: 'http://localhost:4000/v1',
    model: 'gpt-4o',
    maxTokens: 4096,
    threads: 1,
    apiKey: 'test',
    apiType: 'openai-chat',
    contextFile: 'assets/long-context.txt',
    output: 'terminal',
    timeout: 60000,
    verbose: false,
    rampUp: 0,
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<AggregateMetrics> = {}): AggregateMetrics {
  const stats = { min: 10, max: 50, avg: 30, p50: 30, p95: 48, p99: 50 };
  return {
    ttft: stats,
    tokensPerSecond: { min: 100, max: 500, avg: 300, p50: 300, p95: 480, p99: 500 },
    totalTime: { min: 100, max: 500, avg: 300, p50: 300, p95: 480, p99: 500 },
    totalTokens: 1000,
    threadCount: 2,
    successCount: 2,
    errorCount: 0,
    ...overrides,
  };
}

function makeResult(overrides: Partial<SpeedTestResult> = {}): SpeedTestResult {
  const threads: RunMetrics[] = overrides.threads ?? [
    { ttft: 10, totalTime: 100, totalTokens: 50, tokensPerSecond: 500 },
    { ttft: 20, totalTime: 200, totalTokens: 60, tokensPerSecond: 300 },
  ];
  return {
    mode: overrides.mode ?? 'fresh',
    config: overrides.config ?? makeConfig(),
    threads,
    aggregate: overrides.aggregate ?? makeAggregate(),
    errors: overrides.errors ?? [],
    timestamp: overrides.timestamp ?? '2025-01-01T00:00:00.000Z',
  };
}

describe('formatJson', () => {
  it('produces valid parseable JSON', () => {
    const result = makeResult();
    const json = formatJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.mode).toBe('fresh');
    expect(parsed.threads).toHaveLength(2);
    expect(parsed.aggregate).toBeDefined();
  });

  it('2-space indentation', () => {
    const result = makeResult();
    const json = formatJson(result);
    const lines = json.split('\n');
    expect(lines[1]).toMatch(/^  /);
    expect(lines[1]).not.toMatch(/^    /);
  });
});
