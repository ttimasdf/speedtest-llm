# speedtest-llm

LLM inference speed testing CLI — like network speedtest, but for your LLM endpoints.

## Quick Start

```bash
# Install
bun install

# Build binary
bun run build

# Run a speed test (requires an LLM gateway running)
export LLM_API_KEY="your-key"
./dist/speedtest-llm run --mode fresh --base-url http://localhost:4000/v1
```

## Test Modes

### `fresh` — Fresh Speed Test
Zero conversation history. Generates a long essay and measures pure tok/s generation speed.

```bash
./dist/speedtest-llm run --mode fresh --max-tokens 4096 --threads 1
```

Metrics: TTFT, tok/s, total time, total tokens

### `cached-long-context` — Cached Long Context Speed
Sends long context twice — first as warmup (populates KV cache), second measured. Tests tok/s under long context.

```bash
./dist/speedtest-llm run --mode cached-long-context --threads 1
```

Metrics: TTFT, tok/s, total time, total tokens

### `prefill` — Prefill Speed / Instruction Following
Long context, zero cache, outputs just "OK". Tests prefill speed (TTFT) and instruction following under long context load.

```bash
./dist/speedtest-llm run --mode prefill --threads 1
```

Metrics: TTFT, instruction following (OK/FAIL)

## CLI Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-m, --mode` | fresh\|cached-long-context\|prefill | (required) | Test mode |
| `-u, --base-url` | string | `http://localhost:4000/v1` | LLM gateway URL |
| `-M, --model` | string | `gpt-4o` | Model name |
| `-t, --threads` | number | `1` | Concurrent request threads |
| `--max-tokens` | number | `4096` | Max output tokens |
| `-a, --api-type` | openai-chat\|anthropic-messages\|openai-responses | `openai-chat` | API format |
| `-k, --api-key` | string | (from `LLM_API_KEY`) | API key |
| `-c, --context-file` | path | `assets/long-context.txt` | Long context source |
| `-o, --output` | terminal\|json | `terminal` | Output format |
| `--output-file` | path | — | JSON output path |
| `--timeout` | number | `60000` | Request timeout (ms) |
| `--verbose` | flag | `false` | Enable debug output |
| `--omit` | number | `0` | Omit initial pre-test seconds from interval stats |

Additional commands:
```bash
./dist/speedtest-llm modes     # List available modes
./dist/speedtest-llm run --help # Show all options
```

## Output

### Terminal Table
Displays per-thread metrics and aggregate statistics (min, max, avg, p50, p95, p99).

### JSON Export
```bash
./dist/speedtest-llm run --mode fresh --output json --output-file result.json
```

JSON schema:
```json
{
  "mode": "fresh",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "threads": [{ "ttft": 150.23, "totalTime": 22100, "totalTokens": 1000, "tokensPerSecond": 45.24 }],
  "aggregate": {
    "ttft": { "min": 150.23, "max": 150.23, "avg": 150.23, "p50": 150.23, "p95": 150.23, "p99": 150.23 },
    "tokensPerSecond": { "min": 45.24, "max": 45.24, "avg": 45.24, "p50": 45.24, "p95": 45.24, "p99": 45.24 },
    "totalTime": { "min": 22100, "max": 22100, "avg": 22100, "p50": 22100, "p95": 22100, "p99": 22100 }
  },
  "errors": []
}
```

## Environment Variables

- `LLM_API_KEY` — API key for the LLM gateway (can be overridden with `--api-key`)

## Troubleshooting

### Connection refused
```
Cannot connect to API: Unable to connect.
```
→ Verify your gateway is running at the specified `--base-url`.

### Authentication failed (401/403)
→ Check your `LLM_API_KEY` or `--api-key` value.

### Rate limited (429)
→ Reduce `--threads` or wait before retrying.

### Timeout
→ Increase `--timeout` or check if the endpoint is overloaded.

## Development

```bash
# Type check
bun run typecheck

# Run tests
bun test

# Build
bun run build
```

## Tech Stack
- TypeScript + Bun
- Vercel AI SDK (@ai-sdk/openai-compatible)
- commander.js
- cli-table3 + chalk

