import { Command } from 'commander';
import type { OutputFormat, ProviderType, SpeedTestConfig, SpeedTestMode, TraceOutput } from './types.js';

const VALID_MODES: SpeedTestMode[] = ['fresh', 'cached-long-context', 'prefill'];
const VALID_API_TYPES: ProviderType[] = ['openai-chat', 'anthropic-messages', 'openai-responses'];
const VALID_OUTPUT_FORMATS: OutputFormat[] = ['terminal', 'json'];
const VALID_TRACE_OUTPUTS: TraceOutput[] = ['off', 'memory', 'file'];

export function parseConfig(argv: string[]): SpeedTestConfig {
  const program = new Command();

  program
    .name('llm-speedtest')
    .description('LLM endpoint speed testing tool')
    .option('-m, --mode <mode>', 'Test mode: fresh, cached-long-context, prefill')
    .option('-u, --base-url <url>', 'Base URL for the API', 'http://localhost:4000/v1')
    .option('-M, --model <model>', 'Model name', 'deepseek-v4-flash')
    .option('-t, --threads <n>', 'Number of concurrent threads', '3')
    .option('--max-tokens <n>', 'Maximum tokens per request', '4096')
    .option('-a, --api-type <type>', 'API provider type: openai-chat, anthropic-messages, openai-responses', 'anthropic-messages')
    .option('-k, --api-key <key>', 'API key (takes priority over LLM_API_KEY env var)')
    .option('-c, --context-file <path>', 'Path to long context file', 'assets/long-context.txt')
    .option('-o, --output <format>', 'Output format: terminal, json', 'terminal')
    .option('--output-file <path>', 'Output file path (for json output)')
    .option('--timeout <s>', 'Request timeout in seconds', '60')
    .option('--verbose', 'Enable verbose logging', false)
    .option('-i, --interval <seconds>', 'Interval between snapshots in seconds', '1')
    .option('--omit <seconds>', 'Omit initial pre-test seconds from results', '0')
    .option('--trace-output <target>', 'Trace output: off, memory, file', 'off')
    .option('--trace-file <path>', 'Trace JSONL file path (for --trace-output file)', 'speedtest-llm-trace.jsonl')
    .option('--trace-include-content', 'Include streamed text content in trace records', false);

  program.parse(argv, { from: 'user' });
  const opts = program.opts();

  const mode = opts.mode as string | undefined;
  if (!mode) {
    console.error('Error: --mode is required. Must be one of: fresh, cached-long-context, prefill');
    process.exit(1);
  }
  if (!VALID_MODES.includes(mode as SpeedTestMode)) {
    console.error(`Error: Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(', ')}`);
    process.exit(1);
  }

  const threads = parseInt(opts.threads, 10);
  if (isNaN(threads) || threads < 1) {
    console.error('Error: --threads must be an integer >= 1');
    process.exit(1);
  }

  const maxTokens = parseInt(opts.maxTokens, 10);
  if (isNaN(maxTokens) || maxTokens < 1) {
    console.error('Error: --max-tokens must be an integer >= 1');
    process.exit(1);
  }

  const baseUrl = opts.baseUrl as string;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    console.error('Error: --base-url must start with http:// or https://');
    process.exit(1);
  }

  const apiType = opts.apiType as string;
  if (!VALID_API_TYPES.includes(apiType as ProviderType)) {
    console.error(`Error: Invalid --api-type "${apiType}". Must be one of: ${VALID_API_TYPES.join(', ')}`);
    process.exit(1);
  }

  const output = opts.output as string;
  if (!VALID_OUTPUT_FORMATS.includes(output as OutputFormat)) {
    console.error(`Error: Invalid --output "${output}". Must be one of: ${VALID_OUTPUT_FORMATS.join(', ')}`);
    process.exit(1);
  }

  const apiKey = (opts.apiKey as string | undefined) || process.env.LLM_API_KEY;
  if (!apiKey) {
    console.error('Error: API key required. Set LLM_API_KEY environment variable or use --api-key');
    process.exit(1);
  }

  const timeoutSec = parseFloat(opts.timeout);
  if (isNaN(timeoutSec) || timeoutSec <= 0) {
    console.error('Error: --timeout must be a positive number (seconds)');
    process.exit(1);
  }
  const timeout = timeoutSec * 1000;

  const interval = parseFloat(opts.interval);
  if (isNaN(interval) || interval <= 0) {
    console.error('Error: --interval must be a positive number (seconds)');
    process.exit(1);
  }

  const omit = parseFloat(opts.omit);
  if (isNaN(omit) || omit < 0) {
    console.error('Error: --omit must be a non-negative number (seconds)');
    process.exit(1);
  }

  const traceOutput = opts.traceOutput as string;
  if (!VALID_TRACE_OUTPUTS.includes(traceOutput as TraceOutput)) {
    console.error(`Error: Invalid --trace-output "${traceOutput}". Must be one of: ${VALID_TRACE_OUTPUTS.join(', ')}`);
    process.exit(1);
  }

  const outputFile = opts.outputFile as string | undefined;
  const traceFile = opts.traceFile as string | undefined;

  return {
    mode: mode as SpeedTestMode,
    baseUrl,
    model: opts.model as string,
    maxTokens,
    threads,
    apiKey,
    apiType: apiType as ProviderType,
    contextFile: opts.contextFile as string,
    output: output as OutputFormat,
    outputFile: (output === 'json' && outputFile) ? outputFile : undefined,
    timeout,
    verbose: !!opts.verbose,
    interval,
    omit,
    traceOutput: traceOutput as TraceOutput,
    traceFile: traceOutput === 'file' ? traceFile : undefined,
    traceIncludeContent: !!opts.traceIncludeContent,
  };
}
