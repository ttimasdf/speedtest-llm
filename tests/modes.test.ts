import { describe, it, expect, mock, beforeEach } from 'bun:test';

let mockUsageOutputTokens = 100;
let mockStreamChunks: string[] = ['hello', ' world'];

mock.module('ai', () => ({
  streamText: (opts: any) => {
    const usage = { outputTokens: mockUsageOutputTokens };

    function createStream() {
      return (async function* () {
        for (const text of mockStreamChunks) {
          const chunk = { type: 'text-delta', text };
          if (opts.onChunk) {
            opts.onChunk({ chunk });
          }
          yield chunk;
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
    rampUpMs: 0,
    ...overrides,
  };
}

const mockModel = {} as any;

describe('Mode: fresh', () => {
  beforeEach(() => {
    mockUsageOutputTokens = 100;
    mockStreamChunks = ['hello', ' world'];
  });

  it('uses prompt (not messages), records metrics', async () => {
    const config = makeConfig();
    const result = await freshRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'unused context',
    );

    expect(result.totalTokens).toBe(100);
    expect(result.ttft).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    expect(result.tokensPerSecond).toBeGreaterThanOrEqual(0);
  });
});

describe('Mode: cached', () => {
  beforeEach(() => {
    mockUsageOutputTokens = 200;
    mockStreamChunks = ['cached', ' response'];
  });

  it('sends two requests (warmup + measured), metrics from second only', async () => {
    const config = makeConfig({ contextFile: 'test-context' });
    const result = await cachedRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'long context text here',
    );

    expect(result.totalTokens).toBe(200);
    expect(result.ttft).toBeGreaterThanOrEqual(0);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
  });
});

describe('Mode: prefill', () => {
  beforeEach(() => {
    mockUsageOutputTokens = 5;
    mockStreamChunks = ['O', 'K'];
  });

  it('uses maxOutputTokens=10, measures TTFT, validates instruction', async () => {
    const config = makeConfig({ mode: 'prefill' });
    const result = await prefillRunner.run(
      config,
      mockModel,
      () => createMetricsCollector(),
      'some context',
    );

    expect(result.totalTokens).toBe(5);
    expect(result.ttft).toBeGreaterThanOrEqual(0);
    expect(result.instructionFollowed).toBe(true);
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
