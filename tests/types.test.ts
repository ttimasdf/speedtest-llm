import { describe, it, expect } from 'bun:test';
import type {
  IntervalSnapshot,
  ThreadStreamState,
  HeatmapCell,
  StreamCallback,
  StreamTraceEvent,
  TraceRecord,
  SpeedTestResult,
  SpeedTestConfig,
  AggregateMetrics,
  RunMetrics,
  PercentileStats,
} from '../src/types.js';

describe('IntervalSnapshot', () => {
  it('can be constructed with all required fields', () => {
    const snapshot: IntervalSnapshot = {
      startTime: 0,
      endTime: 1000,
      tokens: 500,
      tps: 500,
      threadCount: 4,
      activeThreadCount: 3,
      omitted: false,
    };
    expect(snapshot.startTime).toBe(0);
    expect(snapshot.endTime).toBe(1000);
    expect(snapshot.tokens).toBe(500);
    expect(snapshot.tps).toBe(500);
    expect(snapshot.threadCount).toBe(4);
    expect(snapshot.activeThreadCount).toBe(3);
    expect(snapshot.omitted).toBe(false);
  });

  it('omitted interval reports omitted=true', () => {
    const snapshot: IntervalSnapshot = {
      startTime: 0,
      endTime: 1000,
      tokens: 0,
      tps: 0,
      threadCount: 4,
      activeThreadCount: 0,
      omitted: true,
    };
    expect(snapshot.omitted).toBe(true);
  });
});

describe('ThreadStreamState', () => {
  it('can represent a waiting state', () => {
    const state: ThreadStreamState = {
      threadId: 1,
      state: 'waiting',
      ttft: null,
      tokensInInterval: 0,
      totalTokens: 0,
      activeTime: 0,
      tokensPerSecond: 0,
    };
    expect(state.threadId).toBe(1);
    expect(state.state).toBe('waiting');
    expect(state.ttft).toBeNull();
    expect(state.tokensInInterval).toBe(0);
  });

  it('can represent a streaming state with TTFT', () => {
    const state: ThreadStreamState = {
      threadId: 2,
      state: 'streaming',
      ttft: 150,
      tokensInInterval: 75,
      totalTokens: 75,
      activeTime: 1000,
      tokensPerSecond: 75,
    };
    expect(state.state).toBe('streaming');
    expect(state.ttft).toBe(150);
    expect(state.tokensInInterval).toBe(75);
  });

  it('can represent a done state', () => {
    const state: ThreadStreamState = {
      threadId: 3,
      state: 'done',
      ttft: 200,
      tokensInInterval: 500,
      totalTokens: 500,
      activeTime: 1000,
      tokensPerSecond: 500,
    };
    expect(state.state).toBe('done');
    expect(state.tokensInInterval).toBe(500);
  });
});

describe('HeatmapCell', () => {
  it('can represent an active cell with TPS', () => {
    const cell: HeatmapCell = {
      threadIndex: 0,
      intervalIndex: 2,
      tps: 450,
      isWaiting: false,
    };
    expect(cell.threadIndex).toBe(0);
    expect(cell.intervalIndex).toBe(2);
    expect(cell.tps).toBe(450);
    expect(cell.isWaiting).toBe(false);
  });

  it('can represent a waiting cell with null TPS', () => {
    const cell: HeatmapCell = {
      threadIndex: 1,
      intervalIndex: 0,
      tps: null,
      isWaiting: true,
    };
    expect(cell.tps).toBeNull();
    expect(cell.isWaiting).toBe(true);
  });
});

describe('StreamCallback', () => {
  it('is callable with first-token event', () => {
    const cb: StreamCallback = (_threadIndex: number, event: string, _tokenCount?: number) => {
      expect(event).toBe('first-token');
    };
    cb(0, 'first-token');
  });

  it('is callable with chunk event and tokenCount', () => {
    let captured: { thread: number; tokens: number } | null = null;
    const cb: StreamCallback = (threadIndex, _event, tokenCount) => {
      captured = { thread: threadIndex, tokens: tokenCount ?? 0 };
    };
    cb(2, 'chunk', 50);
    expect(captured).toEqual({ thread: 2, tokens: 50 });
  });

  it('is callable with done event without tokenCount', () => {
    const cb: StreamCallback = (_threadIndex: number, event: string) => {
      expect(event).toBe('done');
    };
    cb(0, 'done');
  });
});

describe('SpeedTestConfig extension', () => {
  it('includes interval and omit fields', () => {
    const config: SpeedTestConfig = {
      mode: 'fresh',
      baseUrl: 'http://localhost:4000/v1',
      model: 'gpt-4',
      maxTokens: 1024,
      threads: 4,
      apiKey: 'test-key',
      apiType: 'openai-chat',
      contextFile: 'context.txt',
      output: 'terminal',
      timeout: 60000,
      verbose: false,
      interval: 500,
      omit: 3,
      traceOutput: 'memory',
      traceFile: 'trace.jsonl',
      traceIncludeContent: true,
    };
    expect(config.interval).toBe(500);
    expect(config.omit).toBe(3);
    expect(config.traceOutput).toBe('memory');
    expect(config.traceIncludeContent).toBe(true);
  });
});

describe('SpeedTestResult extension', () => {
  it('includes intervals and threadStates fields', () => {
    const result: SpeedTestResult = {
      mode: 'fresh',
      config: {
        mode: 'fresh',
        baseUrl: 'http://localhost:4000/v1',
        model: 'gpt-4',
        maxTokens: 1024,
        threads: 1,
        apiKey: 'test-key',
        apiType: 'openai-chat',
        contextFile: 'context.txt',
        output: 'terminal',
        timeout: 60000,
        verbose: false,
            interval: 500,
        omit: 3,
        traceOutput: 'off',
        traceIncludeContent: false,
      },
      threads: [
        { ttft: 50, totalTime: 2000, totalTokens: 100, tokensPerSecond: 50 },
      ],
      aggregate: {
        ttft: { min: 50, max: 50, avg: 50, p50: 50, p95: 50, p99: 50 },
        tokensPerSecond: { min: 50, max: 50, avg: 50, p50: 50, p95: 50, p99: 50 },
        totalTime: { min: 2000, max: 2000, avg: 2000, p50: 2000, p95: 2000, p99: 2000 },
        totalTokens: 100,
        totalTokensPerSecond: 50,
        measuredDuration: 2000,
        measuredTokens: 100,
        measuredStartTime: 0,
        measuredEndTime: 2000,
        threadCount: 1,
        successCount: 1,
        errorCount: 0,
        intervalTps: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        totalIntervals: 0,
      },
      errors: [],
      timestamp: '2025-01-01T00:00:00Z',
      intervals: [],
      threadStates: [],
      traces: [],
    };
    expect(Array.isArray(result.intervals)).toBe(true);
    expect(Array.isArray(result.threadStates)).toBe(true);
    expect(Array.isArray(result.traces)).toBe(true);
  });
});

describe('Trace types', () => {
  it('can represent stream trace events and OTEL-shaped records', () => {
    const event: StreamTraceEvent = { event: 'stream_chunk', content: 'hello', blockType: 'text-delta' };
    const record: TraceRecord = {
      trace_id: 'a'.repeat(32),
      span_id: 'b'.repeat(16),
      service_name: 'speedtest-llm',
      thread: 1,
      thread_index: 0,
      event: event.event,
      api_type: 'openai-chat',
      mode: 'fresh',
      model: 'gpt-4',
      timestamp: 123,
      time_unix_nano: '123000000',
      stream_start_timestamp: 100,
      stream_start_time_unix_nano: '100000000',
      elapsed_ms: 23,
      tokens: 10,
    };
    expect(record.event).toBe('stream_chunk');
    expect(record.tokens).toBe(10);
  });
});

describe('AggregateMetrics extension', () => {
  it('includes intervalTps and totalIntervals fields', () => {
    const agg: AggregateMetrics = {
      ttft: { min: 10, max: 100, avg: 55, p50: 50, p95: 90, p99: 99 },
      tokensPerSecond: { min: 100, max: 500, avg: 300, p50: 300, p95: 450, p99: 490 },
      totalTime: { min: 1000, max: 5000, avg: 3000, p50: 3000, p95: 4500, p99: 4900 },
      totalTokens: 1000,
      totalTokensPerSecond: 310,
      measuredDuration: 3225,
      measuredTokens: 1000,
      measuredStartTime: 0,
      measuredEndTime: 3225,
      threadCount: 5,
      successCount: 5,
      errorCount: 0,
      intervalTps: { min: 150, max: 480, avg: 310, p50: 320, p95: 460, p99: 475 },
      totalIntervals: 20,
    };
    expect(agg.intervalTps.min).toBe(150);
    expect(agg.intervalTps.max).toBe(480);
    expect(agg.totalIntervals).toBe(20);
  });
});
