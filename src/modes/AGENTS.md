# src/modes/ — Test Mode Implementations

Each mode runs one LLM inference test, producing `RunMetrics` via a private `MetricsCollector`.

## WHERE TO LOOK

| File | Role |
|------|------|
| `runner.ts` | `ModeRunner` interface. The contract every mode implements. |
| `registry.ts` | `Map<SpeedTestMode, ModeRunner>`. Pre-registers all 3 modes. |
| `index.ts` | Re-exports `ModeRunner` type + `getRunner`/`registerRunner`. |
| `fresh.ts` | Cold-start test. Essay prompt, no history. Full metrics. |
| `cached.ts` | KV-cache test. Two passes: warmup (discarded) + measured. Full metrics. |
| `prefill.ts` | Prefill speed test. Long context + "OK" reply. TTFT only. |

## ADDING A MODE

1. Create `newmode.ts`, export a `ModeRunner` object.
2. Register it in `registry.ts` via `registerRunner('key', runner)`.
3. Add the key to `SpeedTestMode` union in `src/types.ts`.

## MODE RULES

| Mode | Metrics | Warmup | maxTokens | Response check |
|------|---------|--------|-----------|----------------|
| fresh | TTFT + tok/s + total | None | From config | None |
| cached-long-context | TTFT + tok/s + total | First pass discarded | From config | None |
| prefill | TTFT only | None | Hardcoded to 10 | Records `instructionFollowed` |

## GOTCHAS

- Each mode calls `metricsFactory()` to create its own collector. Never share collectors across modes.
- Modes fire `onStream` events: `'first-token'`, `'chunk'`, `'done'`. The executor's interval tracker depends on these.
- Prefill mode MUST NOT measure tok/s. `metrics.ts` skips throughput when `config.mode === 'prefill'`.
- Prefill MUST NOT warm up cache. Its whole point is cold-start TTFT under long context.
- Cached mode's warmup failure is caught and warned, not fatal. Some endpoints don't support caching.
- Prefill checks if `fullResponse.trim() === 'OK'` but never fails on mismatch. It records the boolean.
- All modes accept an `AbortSignal` and pass it through to `streamText`. Always wire it up.
