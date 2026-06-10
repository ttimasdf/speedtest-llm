import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { SpeedTestConfig, RunMetrics } from '../src/types.js';

// Mock dependencies before importing executor
const mockRun = mock(async () => ({
  ttft: 10,
  totalTime: 100,
  totalTokens: 50,
  tokensPerSecond: 500,
}));

mock.module('../src/modes/registry.js', () => ({
  getRunner: () => ({
    name: 'test-runner',
    description: 'mock runner',
    run: mockRun,
  }),
}));

mock.module('../src/providers/factory.js', () => ({
  createProvider: () => ({}),
}));

mock.module('../src/context-loader.js', () => ({
  loadContext: async () => 'mock context',
}));

import { executeParallel } from '../src/executor.js';

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
    interval: 1,
    omit: 0,
    traceOutput: 'off',
    traceIncludeContent: false,
    ...overrides,
  };
}

describe('executeParallel', () => {
  beforeEach(() => {
    mockRun.mockClear();
    mockRun.mockImplementation(async () => ({
      ttft: 10,
      totalTime: 100,
      totalTokens: 50,
      tokensPerSecond: 500,
    }));
  });

  it('with threads=1 runs single thread', async () => {
    const result = await executeParallel(makeConfig({ threads: 1 }));

    expect(result.threads).toHaveLength(1);
    expect(result.aggregate.threadCount).toBe(1);
    expect(result.aggregate.successCount).toBe(1);
    expect(result.aggregate.errorCount).toBe(0);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('with threads=3 spawns 3 threads', async () => {
    const result = await executeParallel(makeConfig({ threads: 3 }));

    expect(result.threads).toHaveLength(3);
    expect(result.aggregate.threadCount).toBe(3);
    expect(result.aggregate.successCount).toBe(3);
    expect(result.aggregate.errorCount).toBe(0);
    expect(mockRun).toHaveBeenCalledTimes(3);
  });

  it('errors from individual threads do not crash', async () => {
    let callCount = 0;
    mockRun.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Thread 2 failed');
      }
      return {
        ttft: 10,
        totalTime: 100,
        totalTokens: 50,
        tokensPerSecond: 500,
      };
    });

    const result = await executeParallel(makeConfig({ threads: 3 }));

    expect(result.threads).toHaveLength(2);
    expect(result.aggregate.successCount).toBe(2);
    expect(result.aggregate.errorCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Thread 2 failed');
  });

  it('all threads fail gracefully', async () => {
    mockRun.mockImplementation(async () => {
      throw new Error('All fail');
    });

    const result = await executeParallel(makeConfig({ threads: 2 }));

    expect(result.threads).toHaveLength(0);
    expect(result.aggregate.successCount).toBe(0);
    expect(result.aggregate.errorCount).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it('result includes mode and timestamp', async () => {
    const result = await executeParallel(makeConfig({ mode: 'prefill' }));
    expect(result.mode).toBe('prefill');
    expect(result.timestamp).toBeTruthy();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
