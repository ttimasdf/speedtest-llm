export type ProviderType = 'openai-chat' | 'anthropic-messages' | 'openai-responses';
export type SpeedTestMode = 'fresh' | 'cached-long-context' | 'prefill';
export type OutputFormat = 'terminal' | 'json';

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
  readonly rampUpMs: number;
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

export interface AggregateMetrics {
  readonly ttft: PercentileStats;
  readonly tokensPerSecond: PercentileStats;
  readonly totalTime: PercentileStats;
  readonly totalTokens: number;
  readonly threadCount: number;
  readonly successCount: number;
  readonly errorCount: number;
}

export interface SpeedTestResult {
  readonly mode: SpeedTestMode;
  readonly config: SpeedTestConfig;
  readonly threads: readonly RunMetrics[];
  readonly aggregate: AggregateMetrics;
  readonly errors: readonly string[];
  readonly timestamp: string;
}
