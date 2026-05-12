# TEST SUITE

Unit and integration tests for the speedtest-llm CLI. Mirrors `src/` 1:1.

## WHERE TO LOOK

| Test file | Covers | Key patterns |
|-----------|--------|-------------|
| `config.test.ts` | `parseConfig()` validation | Valid/invalid modes, boundary values |
| `context-loader.test.ts` | `loadContext`, `estimateTokens`, `warnIfExceedsContext` | File loading, token math, warnings |
| `executor.test.ts` | `executeParallel()` | Mocked provider/modes, thread lifecycle |
| `heatmap-renderer.test.ts` | `renderHeatmap()` | TTY vs non-TTY ANSI output |
| `integration.test.ts` | End-to-end flows | Mock LLM, full run simulation |
| `interval-tracker.test.ts` | `createIntervalTracker()` | State machine transitions (waiting→streaming→done), tick timing, row omission |
| `iperf3-formatter.test.ts` | iperf3-style output | Banner, interval rows, summary, detailed stats |
| `metrics.test.ts` | `MetricsCollector`, `computeStats`, `computeAggregates` | Lifecycle tracking, stat aggregation |
| `modes.test.ts` | All 3 `ModeRunner` implementations | Mocked AI SDK, per-mode assertions |
| `output.test.ts` | JSON formatting, heatmap cells, file output | `Bun.write()` mocking, cell color conversion |
| `types.test.ts` | Compile-time readonly enforcement | Type-level assertions only, no runtime tests |

## CONVENTIONS

- **Import from `bun:test` only.** No jest, vitest, or third-party runners.
- **Mock with `mock()` and `mock.module()`.** No real LLM calls. Provider/model calls are always stubbed.
- **All 3 modes tested, always.** Never skip `fresh`, `cached`, or `prefill` in `modes.test.ts`.
- **Tests excluded from typecheck.** `tsconfig.json` only includes `src/**/*`.

## GOTCHAS

- `modes.test.ts` overrides `maxTokens` to 10 in prefill mode. Don't assert on the config's `maxTokens` value there.
- `types.test.ts` has no runtime assertions. If it compiles, it passes. Don't add `expect()` calls to it.
- `integration.test.ts` mocks the provider factory at the module level. Order of `mock.module()` calls matters.
- `interval-tracker.test.ts` uses fake timers. `tick()` calls must align with the 100ms interval the executor uses.
