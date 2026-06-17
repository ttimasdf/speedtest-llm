import { describe, it, expect } from 'bun:test';
import { freshRunner } from '../src/modes/fresh.js';
import { createMetricsCollector } from '../src/metrics.js';
import { createProvider } from '../src/providers/factory.js';
import type { SpeedTestConfig } from '../src/types.js';

function loadEnv(): { baseUrl: string; apiKey: string; model: string } | null {
  const baseUrl = process.env.BASE_URL;
  const apiKey = process.env.API_KEY;
  const model = process.env.MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

function makeConfig(env: { baseUrl: string; apiKey: string; model: string }): SpeedTestConfig {
  return {
    mode: 'fresh',
    baseUrl: env.baseUrl,
    model: env.model,
    maxTokens: 50,
    threads: 1,
    apiKey: env.apiKey,
    apiType: 'openai-chat',
    contextFile: 'assets/long-context.txt',
    output: 'terminal',
    timeout: 30_000,
    verbose: false,
    interval: 1,
    omit: 0,
    traceOutput: 'off',
    traceIncludeContent: false,
  };
}

describe('Real API Integration', () => {
  const env = loadEnv();

  if (!env) {
    it.skip('set BASE_URL, API_KEY, MODEL env vars to enable real API test', () => {});
    return;
  }

  it('fresh mode with real API -> totalTokens > 0 and tokensPerSecond > 0', async () => {
    const config = makeConfig(env);
    const model = createProvider(config);

    const onStream = (event: string) => {
      console.log(`  [stream] ${event}`);
    };

    const result = await freshRunner.run(
      config,
      model,
      () => createMetricsCollector(),
      '',
      onStream,
    );

    console.log('RunMetrics:', JSON.stringify(result, null, 2));

    expect(result.totalTokens, 'totalTokens should be > 0').toBeGreaterThan(0);
    expect(result.ttft, 'TTFT should be > 0').toBeGreaterThan(0);
    expect(result.totalTime, 'totalTime should be > 0').toBeGreaterThan(0);
    expect(result.tokensPerSecond, 'tokensPerSecond should be > 0').toBeGreaterThan(0);
  }, 60_000);

  it('executeParallel with real API -> aggregate tokensPerSecond > 0', async () => {
    const { executeParallel } = await import('../src/executor.js');
    const config = makeConfig(env);

    const result = await executeParallel(config);

    console.log('Aggregate:', JSON.stringify(result.aggregate, null, 2));
    console.log('Thread:', JSON.stringify(result.threads[0], null, 2));

    expect(result.threads.length, 'should have 1 success').toBe(1);
    expect(result.aggregate.totalTokens, 'agg totalTokens > 0').toBeGreaterThan(0);
    expect(result.threads[0].totalTokens, 'thread totalTokens > 0').toBeGreaterThan(0);
    expect(result.threads[0].tokensPerSecond, 'thread TPS > 0').toBeGreaterThan(0);
  }, 60_000);
});
