import type { SpeedTestConfig, StreamTraceEvent, TraceRecord } from './types.js';

interface ThreadTraceState {
  readonly traceId: string;
  readonly spanId: string;
  readonly startTimestamp: number;
  readonly startTimeUnixNano: string;
  readonly startPerformance: number;
  firstChunkPerformance: number | null;
  lastChunkPerformance: number | null;
  chunkCount: number;
  totalChars: number;
  estimatedTokens: number;
}

interface TraceWriter {
  write(data: string): unknown;
  end(): unknown | Promise<unknown>;
}

export interface TraceCollector {
  record(threadIndex: number, event: StreamTraceEvent): void;
  getRecords(): readonly TraceRecord[];
  flush(): Promise<void>;
}

const FLUSH_THRESHOLD_BYTES = 64 * 1024;

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

function nowUnixNano(): string {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeBlock(block: unknown): string {
  try {
    return JSON.stringify(block);
  } catch (err) {
    return JSON.stringify({ serialization_error: normalizeError(err) });
  }
}

class JsonlTraceExporter {
  private readonly records: TraceRecord[] = [];
  private readonly writer?: TraceWriter;
  private buffer = '';

  constructor(private readonly config: SpeedTestConfig) {
    if (config.traceOutput === 'file') {
      this.writer = Bun.file(config.traceFile ?? 'speedtest-llm-trace.jsonl').writer();
    }
  }

  export(record: TraceRecord): void {
    if (this.config.traceOutput === 'memory') {
      this.records.push(record);
      return;
    }

    if (this.config.traceOutput !== 'file' || !this.writer) {
      return;
    }

    this.buffer += JSON.stringify(record) + '\n';
    if (this.buffer.length >= FLUSH_THRESHOLD_BYTES) {
      this.flushBuffer();
    }
  }

  getRecords(): readonly TraceRecord[] {
    return this.records;
  }

  async flush(): Promise<void> {
    this.flushBuffer();
    if (this.writer) {
      await this.writer.end();
    }
  }

  private flushBuffer(): void {
    if (this.buffer.length === 0 || !this.writer) {
      return;
    }
    this.writer.write(this.buffer);
    this.buffer = '';
  }
}

export function createTraceCollector(config: SpeedTestConfig): TraceCollector {
  const exporter = new JsonlTraceExporter(config);
  const threads = new Map<number, ThreadTraceState>();

  function ensureThread(threadIndex: number): ThreadTraceState {
    const existing = threads.get(threadIndex);
    if (existing) return existing;

    const state: ThreadTraceState = {
      traceId: randomHex(16),
      spanId: randomHex(8),
      startTimestamp: Date.now(),
      startTimeUnixNano: nowUnixNano(),
      startPerformance: performance.now(),
      firstChunkPerformance: null,
      lastChunkPerformance: null,
      chunkCount: 0,
      totalChars: 0,
      estimatedTokens: 0,
    };
    threads.set(threadIndex, state);
    return state;
  }

  function baseRecord(threadIndex: number, state: ThreadTraceState, event: StreamTraceEvent): TraceRecord {
    const timestamp = Date.now();
    const currentPerformance = performance.now();
    return {
      trace_id: state.traceId,
      span_id: state.spanId,
      service_name: 'speedtest-llm',
      thread: threadIndex + 1,
      thread_index: threadIndex,
      event: event.event,
      api_type: config.apiType,
      mode: config.mode,
      model: config.model,
      timestamp,
      time_unix_nano: nowUnixNano(),
      stream_start_timestamp: state.startTimestamp,
      stream_start_time_unix_nano: state.startTimeUnixNano,
      elapsed_ms: currentPerformance - state.startPerformance,
    };
  }

  function recordChunkStats(
    record: Record<string, unknown>,
    state: ThreadTraceState,
    content: string | undefined,
  ): void {
    const currentPerformance = performance.now();
    const text = content ?? '';
    const chars = text.length;
    const bytes = new TextEncoder().encode(text).byteLength;
    const estimatedTokensDelta = chars > 0 ? estimateTokensFromText(text) : 0;

    if (content !== undefined && state.firstChunkPerformance === null) {
      state.firstChunkPerformance = currentPerformance;
    }

    const previousChunkPerformance = state.lastChunkPerformance;
    state.lastChunkPerformance = currentPerformance;
    state.chunkCount += 1;
    state.totalChars += chars;
    state.estimatedTokens += estimatedTokensDelta;

    const ttft = state.firstChunkPerformance === null
      ? null
      : state.firstChunkPerformance - state.startPerformance;
    const generationMs = state.firstChunkPerformance === null
      ? 0
      : currentPerformance - state.firstChunkPerformance;

    record.time_to_first_token = ttft;
    record.inter_chunk_ms = previousChunkPerformance === null
      ? null
      : currentPerformance - previousChunkPerformance;
    record.chunk_index = state.chunkCount;
    record.content_length = chars;
    record.content_bytes = bytes;
    record.content_chars_total = state.totalChars;
    record.estimated_tokens_delta = estimatedTokensDelta;
    record.estimated_tokens_total = state.estimatedTokens;
    record.estimated_tokens_per_second = generationMs > 0
      ? (state.estimatedTokens / generationMs) * 1000
      : 0;

    if (content !== undefined) {
      record.content = text;
    }
  }

  return {
    record(threadIndex: number, event: StreamTraceEvent): void {
      if (config.traceOutput === 'off') {
        return;
      }

      const state = ensureThread(threadIndex);
      const record = baseRecord(threadIndex, state, event) as Record<string, unknown>;

      switch (event.event) {
        case 'stream_start':
          break;
        case 'stream_first_chunk':
        case 'stream_chunk':
          record.block_type = event.blockType ?? (event.content !== undefined ? 'text-delta' : 'unknown');
          if (event.block !== undefined) {
            record.block_json = serializeBlock(event.block);
          }
          recordChunkStats(record, state, event.content);
          break;
        case 'stream_end': {
          const tokens = event.tokens ?? state.estimatedTokens;
          const firstChunkPerformance = state.firstChunkPerformance ?? performance.now();
          const totalTime = performance.now() - state.startPerformance;
          const generationTime = totalTime - (firstChunkPerformance - state.startPerformance);

          record.time_to_first_token = firstChunkPerformance - state.startPerformance;
          record.total_time = totalTime;
          record.generation_time = generationTime;
          record.tokens = tokens;
          record.chunks = state.chunkCount;
          record.content_chars_total = state.totalChars;
          record.estimated_tokens_total = state.estimatedTokens;
          record.tokens_per_second = generationTime > 0 ? (tokens / generationTime) * 1000 : 0;
          break;
        }
        case 'stream_error':
          record.error = normalizeError(event.error);
          break;
      }

      exporter.export(record as TraceRecord);
    },

    getRecords(): readonly TraceRecord[] {
      return exporter.getRecords();
    },

    flush(): Promise<void> {
      return exporter.flush();
    },
  };
}
