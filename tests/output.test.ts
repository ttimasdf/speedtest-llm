import { describe, it, expect } from 'bun:test';
import { formatTerminal, formatJson } from '../src/output.js';
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
    rampUpMs: 0,
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

describe('formatTerminal', () => {
  it('returns string with table content', () => {
    const output = formatTerminal(makeResult());
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('includes thread rows for each thread', () => {
    const result = makeResult({
      threads: [
        { ttft: 15, totalTime: 150, totalTokens: 100, tokensPerSecond: 666.67 },
        { ttft: 25, totalTime: 250, totalTokens: 200, tokensPerSecond: 800 },
      ],
    });
    const output = formatTerminal(result);
    expect(output).toContain('#1');
    expect(output).toContain('#2');
  });

  it('includes aggregate stats', () => {
    const output = formatTerminal(makeResult());
    expect(output).toContain('min');
    expect(output).toContain('max');
    expect(output).toContain('avg');
    expect(output).toContain('p50');
    expect(output).toContain('p95');
    expect(output).toContain('p99');
  });

  it('shows OK/FAIL for prefill mode instructionFollowed', () => {
    const result = makeResult({
      mode: 'prefill',
      threads: [
        { ttft: 10, totalTime: 100, totalTokens: 1, tokensPerSecond: 10, instructionFollowed: true },
        { ttft: 20, totalTime: 200, totalTokens: 1, tokensPerSecond: 5, instructionFollowed: false },
      ],
    });
    const output = formatTerminal(result);
    expect(output).toContain('OK');
    expect(output).toContain('FAIL');
  });

  it('shows N/A for non-prefill modes', () => {
    const result = makeResult({
      mode: 'fresh',
      threads: [
        { ttft: 10, totalTime: 100, totalTokens: 50, tokensPerSecond: 500 },
      ],
    });
    const output = formatTerminal(result);
    expect(output).toContain('N/A');
  });
});

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
