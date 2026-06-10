export type ProviderType = 'openai-chat' | 'anthropic-messages' | 'openai-responses';
export type SpeedTestMode = 'fresh' | 'cached-long-context' | 'prefill';
export type OutputFormat = 'terminal' | 'json';
export type TraceOutput = 'off' | 'memory' | 'file';

export interface SpeedTestConfig {
  readonly mode: SpeedTestMode;
  readonly baseUrl: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly threads: number;
  readonly apiKey: string;
  readonly apiType: ProviderType;
  readonly contextFile: string;
  readonly output: OutputFormat;
  readonly outputFile?: string;
  readonly timeout: number;
  readonly verbose: boolean;
  readonly rampUp: number;
  readonly interval: number;
  readonly omit: number;
  readonly traceOutput: TraceOutput;
  readonly traceFile?: string;
  readonly traceIncludeContent: boolean;
}

export interface RunMetrics {
  readonly ttft: number;
  readonly totalTime: number;
  readonly totalTokens: number;
  readonly tokensPerSecond: number;
  readonly instructionFollowed?: boolean;
}

export interface PercentileStats {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export interface IntervalSnapshot {
  readonly startTime: number;
  readonly endTime: number;
  readonly tokens: number;
  readonly tps: number;
  readonly threadCount: number;
  readonly activeThreadCount: number;
  readonly omitted: boolean;
}

export interface ThreadStreamState {
  readonly state: 'waiting' | 'streaming' | 'done';
  readonly tokensInInterval: number;
}

export interface HeatmapCell {
  readonly threadIndex: number;
  readonly intervalIndex: number;
  readonly tps: number | null;
  readonly isWaiting: boolean;
}

export type StreamTraceEvent =
  | { readonly event: 'stream_start' }
  | { readonly event: 'stream_first_chunk'; readonly content?: string; readonly blockType?: string; readonly block?: unknown }
  | { readonly event: 'stream_chunk'; readonly content?: string; readonly blockType?: string; readonly block?: unknown }
  | { readonly event: 'stream_end'; readonly tokens?: number }
  | { readonly event: 'stream_error'; readonly error: unknown };

export interface TraceRecord {
  readonly trace_id: string;
  readonly span_id: string;
  readonly service_name: string;
  readonly thread: number;
  readonly thread_index: number;
  readonly event: string;
  readonly api_type: ProviderType;
  readonly mode: SpeedTestMode;
  readonly model: string;
  readonly timestamp: number;
  readonly time_unix_nano: string;
  readonly stream_start_timestamp: number;
  readonly stream_start_time_unix_nano: string;
  readonly elapsed_ms: number;
  readonly [key: string]: unknown;
}

export type StreamCallback = (threadIndex: number, event: 'first-token' | 'chunk' | 'done', tokenCount?: number) => void;

export interface AggregateMetrics {
  readonly ttft: PercentileStats;
  readonly tokensPerSecond: PercentileStats;
  readonly totalTime: PercentileStats;
  readonly totalTokens: number;
  readonly threadCount: number;
  readonly successCount: number;
  readonly errorCount: number;
  readonly intervalTps?: PercentileStats;
  readonly totalIntervals?: number;
}

export interface SpeedTestResult {
  readonly mode: SpeedTestMode;
  readonly config: SpeedTestConfig;
  readonly threads: readonly RunMetrics[];
  readonly aggregate: AggregateMetrics;
  readonly errors: readonly string[];
  readonly timestamp: string;
  readonly intervals?: readonly IntervalSnapshot[];
  readonly threadStates?: readonly ThreadStreamState[][];
  readonly traces?: readonly TraceRecord[];
}
