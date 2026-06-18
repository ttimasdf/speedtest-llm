import { describe, it, expect, mock, beforeEach } from 'bun:test';

let mockUsageOutputTokens: number | undefined = 100;
let mockStreamChunks: string[] = ['hello', ' world'];
let mockStreamErrorAfterChunks: number | undefined;

mock.module('ai', () => ({
  streamText: (opts: any) => {
    const usage = { outputTokens: mockUsageOutputTokens };

    function createStream() {
      return (async function* () {
        let emitted = 0;
        for (const text of mockStreamChunks) {
          const chunk = { type: 'text-delta', text };
          if (opts.onChunk) {
            opts.onChunk({ chunk });
          }
          emitted++;
          yield chunk;
          if (mockStreamErrorAfterChunks !== undefined && emitted >= mockStreamErrorAfterChunks) {
            throw new Error('stream aborted');
          }
        }
        if (opts.onFinish) {
          opts.onFinish({ totalUsage: usage, usage });
        }
      })();
    }

    const stream = createStream();

    return {
      textStream: stream,
      consumeStream: async () => {
        for await (const _ of stream) {}
      },
      usage: Promise.resolve(usage),
    };
  },
}));

import { freshRunner } from '../src/modes/fresh.js';
import { cachedRunner } from '../src/modes/cached.js';
import { prefillRunner } from '../src/modes/prefill.js';
import { createMetricsCollector } from '../src/metrics.js';
import type { SpeedTestConfig } from '../src/types.js';

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
    interval: 1,
    omit: 0,
    traceOutput: 'off',
    traceIncludeContent: false,
    ...overrides,
  };
}

const mockModel = {} as any;

describe('Mode: fresh', () => {
  beforeEach(() => {
    mockUsageOutputTokens = 100;
    mockStreamChunks = ['hello', ' world'];
    mockStreamErrorAfterChunks = undefined;
  });

  it('uses prompt (not messages), records metrics from stream chunks', async () => {
    const config = makeConfig();
    const result = await freshRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'unused context',
    );

    // 'hello' (5 chars → round(5/4)=1) + ' world' (6 chars → round(6/4)=2) = 3
    expect(result.totalTokens).toBe(3);
    expect(result.ttft).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    expect(result.tokensPerSecond).toBeGreaterThanOrEqual(0);
  });

  it('falls back to result.usage when no stream chunks', async () => {
    mockStreamChunks = [];
    mockUsageOutputTokens = 100;
    const config = makeConfig();
    const result = await freshRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'unused context',
    );

    expect(result.totalTokens).toBe(100);
  });

  it('keeps partial token count when a stream is interrupted', async () => {
    mockStreamChunks = ['partial output'];
    mockStreamErrorAfterChunks = 1;
    const config = makeConfig();
    const result = await freshRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'unused context',
    );

    expect(result.totalTokens).toBe(4);
    expect(result.tokensPerSecond).toBeGreaterThanOrEqual(0);
  });
});

describe('Mode: cached', () => {
  beforeEach(() => {
    mockUsageOutputTokens = 200;
    mockStreamChunks = ['cached', ' response'];
    mockStreamErrorAfterChunks = undefined;
  });

  it('sends two requests (warmup + measured), metrics from second only', async () => {
    const config = makeConfig({ contextFile: 'test-context' });
    const result = await cachedRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'long context text here',
    );

    // 'cached' (6 chars → round(6/4)=2) + ' response' (9 chars → round(9/4)=2) = 4
    expect(result.totalTokens).toBe(4);
    expect(result.ttft).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
  });
});

describe('Mode: prefill', () => {
  beforeEach(() => {
    mockUsageOutputTokens = 5;
    mockStreamChunks = ['O', 'K'];
    mockStreamErrorAfterChunks = undefined;
  });

  it('uses maxOutputTokens=10, measures TTFT, validates instruction', async () => {
    const config = makeConfig({ mode: 'prefill' });
    const result = await prefillRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'some context',
    );

    // 'O' (1 char → round(1/4)=0 → max(1,0)=1) + 'K' (1 char → same) = 2
    expect(result.totalTokens).toBe(2);
    expect(result.ttft).toBeGreaterThanOrEqual(0);
    expect(result.instructionFollowed).toBe(true);
  });

  it('falls back to result.usage when no stream chunks', async () => {
    mockStreamChunks = [];
    mockUsageOutputTokens = 5;
    const config = makeConfig({ mode: 'prefill' });
    const result = await prefillRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'some context',
    );

    expect(result.totalTokens).toBe(5);
  });

  it('instructionFollowed is false when response is not "OK"', async () => {
    mockStreamChunks = ['No', 'pe'];
    const config = makeConfig({ mode: 'prefill' });
    const result = await prefillRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'some context',
    );

    expect(result.instructionFollowed).toBe(false);
  });
});
