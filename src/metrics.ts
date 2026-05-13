import type { RunMetrics, AggregateMetrics, PercentileStats } from './types.js';

interface RunState {
  startTime: number;
  ttft: number;
  totalTokens: number;
  endTime: number;
}

export interface MetricsCollector {
  startRun(): string;
  recordFirstToken(runId: string): void;
  recordChunk(runId: string, tokenCount: number): void;
  finishRun(runId: string): RunMetrics;
}

export function createMetricsCollector(): MetricsCollector {
  const runs = new Map<string, RunState>();

  return {
    startRun(): string {
      const runId = crypto.randomUUID();
      runs.set(runId, {
        startTime: performance.now(),
        ttft: 0,
        totalTokens: 0,
        endTime: 0,
      });
      return runId;
    },

    recordFirstToken(runId: string): void {
      const state = runs.get(runId);
      if (!state) throw new Error(`Unknown run: ${runId}`);
      state.ttft = performance.now() - state.startTime;
    },

    recordChunk(runId: string, tokenCount: number): void {
      const state = runs.get(runId);
      if (!state) throw new Error(`Unknown run: ${runId}`);
      state.totalTokens += tokenCount;
    },

    finishRun(runId: string): RunMetrics {
      const state = runs.get(runId);
      if (!state) throw new Error(`Unknown run: ${runId}`);
      state.endTime = performance.now();
      const totalTime = state.endTime - state.startTime;
      const generationTime = totalTime - state.ttft;
      const tokensPerSecond = generationTime > 0 ? (state.totalTokens / generationTime) * 1000 : 0;
      runs.delete(runId);
      return {
        ttft: state.ttft,
        totalTime,
        totalTokens: state.totalTokens,
        tokensPerSecond,
      };
    },
  };
}

export function computeStats(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    p99: sorted[Math.ceil(sorted.length * 0.99) - 1],
  };
}

export function computeAggregates(metrics: readonly RunMetrics[]): AggregateMetrics {
  if (metrics.length === 0) {
    return {
      ttft: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
      tokensPerSecond: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
      totalTime: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
      totalTokens: 0,
      threadCount: 0,
      successCount: 0,
      errorCount: 0,
    };
  }

  const ttftValues = metrics.map((m) => m.ttft);
  const tpsValues = metrics.map((m) => m.tokensPerSecond);
  const totalTimeValues = metrics.map((m) => m.totalTime);
  const totalTokens = metrics.reduce((acc, m) => acc + m.totalTokens, 0);

  return {
    ttft: computeStats(ttftValues),
    tokensPerSecond: computeStats(tpsValues),
    totalTime: computeStats(totalTimeValues),
    totalTokens,
    threadCount: metrics.length,
    successCount: metrics.length,
    errorCount: 0,
  };
}
