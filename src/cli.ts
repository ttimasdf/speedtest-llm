import { Command } from 'commander';
import { parseConfig } from './config.js';

function buildArgv(opts: Record<string, unknown>): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined || value === false) continue;
    const flag = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (value === true) {
      args.push(flag);
    } else {
      args.push(flag, String(value));
    }
  }
  return [...args];
}

const program = new Command();

program
  .name('speedtest-llm')
  .description('LLM endpoint speed testing tool')
  .version('1.0.0');

program
  .command('run')
  .description('Run a speed test')
  .requiredOption('-m, --mode <mode>', 'Test mode: fresh, cached-long-context, prefill')
  .option('-u, --base-url <url>', 'Base URL for the API', 'http://localhost:4000/v1')
  .option('-M, --model <model>', 'Model name', 'deepseek-v4-flash')
  .option('-t, --threads <n>', 'Number of concurrent threads', '3')
  .option('--max-tokens <n>', 'Maximum tokens per request', '4096')
  .option('-a, --api-type <type>', 'API provider type: openai-chat, anthropic-messages, openai-responses', 'anthropic-messages')
  .option('-k, --api-key <key>', 'API key (takes priority over LLM_API_KEY env var)')
  .option('-c, --context-file <path>', 'Path to long context file', 'assets/long-context.txt')
  .option('-o, --output <format>', 'Output format: terminal, json', 'terminal')
  .option('--output-file <path>', 'Output file path (for json output)')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '60000')
  .option('--verbose', 'Enable verbose logging', false)
  .option('--ramp-up-ms <ms>', 'Ramp-up period in milliseconds', '0')
  .action(async (opts) => {
    try {
      const config = parseConfig(buildArgv(opts));

      console.log(`speedtest-llm v1.0.0 — mode: ${config.mode}, model: ${config.model}, threads: ${config.threads}`);
      if (config.verbose) {
        console.log(`  base-url: ${config.baseUrl}`);
        console.log(`  max-tokens: ${config.maxTokens}`);
        console.log(`  api-type: ${config.apiType}`);
        console.log(`  output: ${config.output}`);
      }
      console.log(`Running speedtest...`);
      console.log();

      const { executeParallel } = await import('./executor.js');
      const result = await executeParallel(config);

      const { writeOutput } = await import('./output.js');
      writeOutput(result, config);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('ECONNREFUSED') || message.includes('fetch failed') || message.includes('ConnectionRefused') || message.includes('Unable to connect')) {
        console.error(`\n  Cannot connect to ${buildArgv(opts).find((_, i, a) => a[i-1] === '--base-url') || 'the endpoint'} — is the gateway running?`);
      } else if (message.includes('401') || message.includes('403') || message.includes('Unauthorized')) {
        console.error('\n  Authentication failed — check your API key.');
      } else if (message.includes('429') || message.includes('rate limit')) {
        console.error('\n  Rate limited — reduce threads or wait before retrying.');
      } else if (message.includes('timeout') || message.includes('timed out')) {
        console.error('\n  Request timed out — the endpoint may be overloaded.');
      } else {
        console.error(`\n  Error: ${message}`);
        if (opts.verbose) {
          console.error(err);
        }
      }
      process.exit(1);
    }
  });

program
  .command('modes')
  .description('Describe available test modes')
  .action(() => {
    console.log('Available test modes:');
    console.log('');
    console.log('  fresh              Fresh Speed Test — zero conversation history, generates long output');
    console.log('                     Measures: pure tok/s generation speed');
    console.log('');
    console.log('  cached-long-context  Cached Long Context Speed — sends long context twice');
    console.log('                     (first as warmup, second measured). Tests tok/s under');
    console.log('                     long context with populated KV cache');
    console.log('');
    console.log('  prefill             Prefill Speed / Instruction Following — long context,');
    console.log('                     zero cache, outputs just "OK". Tests prefill speed (TTFT)');
    console.log('                     and instruction following under long context load');
  });

program.parse();
