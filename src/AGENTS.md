# src/ — Core Implementation

Source code for the speedtest-llm CLI. See root AGENTS.md for project conventions, commands, and anti-patterns.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add/change CLI flags | `cli.ts` + `config.ts` | Two separate Commander instances; update both |
| Change output format | `iperf3-formatter.ts` | iperf3-style terminal table |
| Change heatmap display | `heatmap-renderer.ts` | ANSI color, terminal-width-aware |
| Add a new test mode | `modes/` | Has its own AGENTS.md |
| Add a new LLM provider | `providers/factory.ts` | All go through `createOpenAICompatible` |
| Modify parallel execution | `executor.ts` | Thread spawning, tick loop, result aggregation |
| Change interval snapshots | `interval-tracker.ts` | Per-thread state machine (waiting→streaming→done) |
| Type definitions | `types.ts` | Every property is `readonly` |
| Statistics/metrics | `metrics.ts` | `MetricsCollector`, percentile calc, aggregates |
| Context file loading | `context-loader.ts` | `Bun.file()`, token est. ~4 chars/token |
| File/JSON output | `output.ts` | `Bun.write()` for file serialization |
| Entry point | `index.ts` | Re-exports `cli.js` |

## KEY PATTERNS

- **Dual Commander**: `cli.ts` defines flags for the user; `config.ts` runs a second Commander parse purely for validation. Flag changes must touch both.
- **Lazy imports**: `cli.ts` dynamically imports `iperf3-formatter`, `heatmap-renderer`, and `output` only after flag parsing succeeds. Keeps startup fast when `--help` or errors fire.
- **Tick loop**: `executor.ts` owns a 100ms `setInterval`. It calls `intervalTracker.tick()` each cycle to snapshot per-thread token counts into interval records. The interval uses `performance.now()` for timing, not `Date.now()`.
- **State machine**: `interval-tracker.ts` tracks each thread as `waiting` → `streaming` (on first token) → `done`. The clock starts on the first `firstToken` callback, not on thread spawn.
- **Per-thread collectors**: `executor.ts` creates a fresh `MetricsCollector` per thread via a factory function. Collectors are never shared. Each tracks TTFT, total tokens, and throughput independently.
- **No tok/s in prefill mode**: `metrics.ts` skips throughput calculation when `config.mode === 'prefill'`. Only TTFT matters there.
- **Compact heatmap**: `heatmap-renderer.ts` buckets rows when the terminal is too narrow. If `stdout.isTTY` is false, ANSI codes are suppressed entirely.

## GOTCHAS

- `config.ts` parses `argv` independently from `cli.ts`. If you add a flag in one and forget the other, validation silently ignores the new flag.
- `context-loader.ts` warns but doesn't abort when `--context` points to a tiny file. Thresholds live in the loader, not in config validation.
- `executor.ts` uses `Promise.allSettled`, so one thread failing never cancels others. Always check each thread's `status` in the result array.
- `interval-tracker.ts` omits intervals where no thread streamed (all `waiting` or all `done`). The formatter skips these silently.
- `metrics.ts` `computeStats` returns zeroed `PercentileStats` for empty arrays instead of throwing. Callers should check `values.length` if zero is a meaningful signal.
- `output.ts` handles both JSON and heatmap output. Heatmap cells use ANSI escape codes that won't render in JSON files; `output.ts` strips them for non-TTY.
- Thread ramp-up (`config.rampUp`) delays each thread's spawn by `rampUp * 1000 * i` ms. Thread 0 starts immediately, thread N starts N intervals later.
