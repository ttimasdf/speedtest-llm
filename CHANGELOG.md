# Changelog

All notable changes to `speedtest-llm` will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style sections and uses [Conventional Commits](https://www.conventionalcommits.org/) in git history.

## [1.0.0] - 2026-06-17

### Breaking Changes

- Removed `--ramp-up`. Speed tests now use burst-start behavior: all threads start immediately, and `--omit` is used to exclude initial pre-test intervals from aggregate interval stats.

### Added

- Initial `speedtest-llm` CLI for benchmarking LLM endpoint inference throughput and latency.
- Three benchmark modes:
  - `fresh` for zero-history generation throughput.
  - `cached-long-context` for long-context generation with a warmed KV cache.
  - `prefill` for cold long-context TTFT and instruction-following checks.
- OpenAI-compatible provider support through the Vercel AI SDK, with `openai-chat`, `anthropic-messages`, and `openai-responses` API formats.
- Parallel execution with configurable thread count, timeout, interval size, context file, model, base URL, and API key.
- Terminal output with iperf3-style live interval rows, summary statistics, and ANSI heatmap rendering.
- JSON output mode and optional output-file writing.
- OTEL-shaped stream tracing with `off`, `memory`, and JSONL `file` output targets.
- Optional trace content capture via `--trace-include-content`.
- Stream-end trace records containing full streamed output and normalized upstream token usage.
- Normalized token usage extraction for provider usage payloads, including cache, text, and reasoning token fields where available.
- `bin` entrypoint support so the CLI can be run as a package executable.
- Local run helper scripts and sample result/trace output workflow.
- Project knowledge-base documentation for AI-assisted development.

### Changed

- TPS is calculated from generation-only time instead of total request time.
- Iperf3-style output formatting was simplified for readability.
- Thinking/reasoning mode is disabled globally where provider parameters allow it, reducing benchmark variability.
- Verbose diagnostics now include stream and executor/tracker details useful for debugging live runs.

### Fixed

- Fixed final aggregate stats reporting zero TPS in some streaming/abort edge cases.
- Handled abort and usage races during streaming completion.
- Bounded timeout handling so pending thread startup/execution is cancelled cleanly.
- Improved interval tracking behavior for omitted intervals and partial final intervals.

### Tests

- Added unit coverage for config parsing, context loading, metrics, modes, output, interval tracking, heatmap rendering, iperf3 formatting, tracing, and result types.
- Added integration coverage for live interval output and real API TPS debugging.
