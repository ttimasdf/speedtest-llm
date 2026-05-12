# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-12
**Commit:** cd75c9e
**Branch:** main

## OVERVIEW

LLM inference speed testing CLI — `speedtest-llm`. Bun + TypeScript, compiles to standalone binary. Uses Vercel AI SDK for provider abstraction, Commander.js for CLI.

## STRUCTURE

```
.
├── src/             # All source code
│   ├── modes/       # Test mode implementations (ModeRunner pattern)
│   └── providers/   # LLM provider factory
├── tests/           # All tests (1:1 mapping to src/ files)
├── assets/          # Long context test file (long-context.txt)
└── dist/            # Built binary output
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a new test mode | `src/modes/` | Implement `ModeRunner` interface, register in `registry.ts` |
| Change CLI flags | `src/cli.ts` + `src/config.ts` | cli.ts defines flags, config.ts validates them |
| Change output formatting | `src/iperf3-formatter.ts` | iperf3-style terminal output |
| Change heatmap rendering | `src/heatmap-renderer.ts` | ANSI color terminal heatmap |
| Add a new LLM provider | `src/providers/factory.ts` | All providers go through `createOpenAICompatible` |
| Modify parallel execution | `src/executor.ts` | Thread spawning, interval tracking, result aggregation |
| Change interval/metric tracking | `src/interval-tracker.ts` | Per-thread state machine (waiting→streaming→done) |
| Type definitions | `src/types.ts` | All interfaces and types — `SpeedTestConfig`, `SpeedTestResult`, etc. |
| Context file loading | `src/context-loader.ts` | Loads long context, estimates tokens |
| Statistics computation | `src/metrics.ts` | `MetricsCollector` + `computeStats`/`computeAggregates` |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `SpeedTestConfig` | Interface | `src/types.ts` | Central config — all settings are `readonly` |
| `SpeedTestResult` | Interface | `src/types.ts` | Full test result with intervals, thread states |
| `ModeRunner` | Interface | `src/modes/runner.ts` | Contract: `name`, `description`, `run()` |
| `parseConfig()` | Function | `src/config.ts` | Validates CLI args → `SpeedTestConfig` |
| `executeParallel()` | Function | `src/executor.ts` | Orchestrates threads, interval tracking, aggregation |
| `createProvider()` | Function | `src/providers/factory.ts` | Config → `LanguageModel` via AI SDK |
| `getRunner()` / `registerRunner()` | Functions | `src/modes/registry.ts` | Mode lookup by string key |
| `createMetricsCollector()` | Function | `src/metrics.ts` | Per-thread metrics (TTFT, tok/s, total) |
| `createIntervalTracker()` | Function | `src/interval-tracker.ts` | Interval-based TPS snapshots |
| `freshRunner` / `cachedRunner` / `prefillRunner` | ModeRunner | `src/modes/*.ts` | Three test modes |

## CONVENTIONS

- **Bun-only runtime**: Never use Node.js APIs when Bun has a native equivalent. See CLAUDE.md for full list.
- **ESM with `.js` extensions**: All imports use `.js` extension despite `.ts` files (nodenext module resolution).
- **`readonly` everywhere**: All type properties are `readonly`. New types must follow this.
- **`Bun.file()` over `node:fs`**: Use `Bun.file()` for file reads (see `context-loader.ts`).
- **`Bun.write()` for output**: Use `Bun.write()` for file writes (see `output.ts`).
- **No separate test deps**: Bun test runner is built-in. Import from `bun:test`.
- **Tests 1:1 with source**: Each `src/foo.ts` has a `tests/foo.test.ts`.

## ANTI-PATTERNS (THIS PROJECT)

- DO NOT warm up cache in prefill mode — tests cold-start TTFT only
- DO NOT measure tok/s in prefill mode — only TTFT matters
- DO NOT use `maxTokens` from config in prefill mode — override to 10 internally
- DO NOT fail if response ≠ "OK" in prefill mode — record `instructionFollowed: false`
- DO NOT couple interval-tracking into mode implementations — modes fire callbacks only
- DO NOT emit ANSI codes when stdout is not a TTY
- DO NOT change mode semantic behavior when refactoring output
- DO NOT skip any mode during testing — all 3 must be tested
- DO NOT assume a real LLM is always available — provide mock fallback
- AVOID AI slop: over-abstraction, excessive JSDoc, premature utility extraction
- NEVER separate implementation + test into different tasks — they are ONE task

## COMMANDS

```bash
bun install              # Install deps
bun test                 # Run all tests
bun run typecheck        # TypeScript type checking (no emit)
bun run build            # Compile to standalone binary at dist/speedtest-llm
bun src/index.ts         # Run directly (dev)
```

## NOTES

- `config.ts` has its own Commander instance for validation (separate from `cli.ts`). Changes to flags must update BOTH files.
- `interval-tracker.ts` uses a state machine per thread: `waiting` → `streaming` → `done`. `tick()` is called on a 100ms interval in executor.
- `heatmap-renderer.ts` compacts rows to fit terminal width via bucketing.
- All API types use `openai-chat` as default but `anthropic-messages` is the most tested.
- `tsconfig.json` only includes `src/**/*` — tests are excluded from typecheck.
