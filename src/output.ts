import Table from "cli-table3";
import type {
  SpeedTestResult,
  SpeedTestConfig,
  RunMetrics,
  PercentileStats,
  SpeedTestMode,
} from "./types.js";

function fmtMs(ms: number): string {
  return ms.toFixed(2);
}

function fmtSec(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}

function fmtTokPerSec(tps: number): string {
  return tps.toFixed(2);
}

function fmtTokens(tokens: number): string {
  return tokens.toString();
}

function fmtInstructionFollowed(
  mode: SpeedTestMode,
  value: boolean | undefined
): string {
  if (mode !== "prefill") return "N/A";
  if (value === undefined) return "N/A";
  return value ? "OK" : "FAIL";
}

function buildThreadRows(
  threads: readonly RunMetrics[],
  mode: SpeedTestMode
): string[][] {
  return threads.map((t, i) => [
    `#${i + 1}`,
    fmtMs(t.ttft),
    fmtSec(t.totalTime),
    fmtTokens(t.totalTokens),
    fmtTokPerSec(t.tokensPerSecond),
    fmtInstructionFollowed(mode, t.instructionFollowed),
  ]);
}

function buildStatRow(
  label: string,
  ttft: PercentileStats,
  totalTime: PercentileStats,
  tps: PercentileStats,
  getter: (s: PercentileStats) => number
): string[] {
  return [
    label,
    fmtMs(getter(ttft)),
    fmtSec(getter(totalTime)),
    fmtTokPerSec(getter(tps)),
    "",
    "",
  ];
}

const statGetters: Record<string, (s: PercentileStats) => number> = {
  min: (s) => s.min,
  max: (s) => s.max,
  avg: (s) => s.avg,
  p50: (s) => s.p50,
  p95: (s) => s.p95,
  p99: (s) => s.p99,
};

export function formatTerminal(result: SpeedTestResult): string {
  const { mode, threads, aggregate } = result;

  const head = [
    "Thread",
    "TTFT(ms)",
    "Total Time",
    "Tokens",
    "tok/s",
    "Instr.Follow",
  ];

  const threadRows = buildThreadRows(threads, mode);

  const statHeader = ["STAT", "TTFT", "Total Time", "tok/s", "", ""];

  const statRows = Object.entries(statGetters).map(([label, getter]) =>
    buildStatRow(label, aggregate.ttft, aggregate.totalTime, aggregate.tokensPerSecond, getter)
  );

  const table = new Table({
    head,
    colWidths: [10, 12, 14, 13, 13, 16],
    chars: {
      top: "\u2550",
      "top-mid": "\u2564",
      "top-left": "\u2554",
      "top-right": "\u2557",
      bottom: "\u2550",
      "bottom-mid": "\u2567",
      "bottom-left": "\u255a",
      "bottom-right": "\u255d",
      left: "\u2551",
      "left-mid": "\u255f",
      mid: "\u2500",
      "mid-mid": "\u253c",
      right: "\u2551",
      "right-mid": "\u2562",
      middle: "\u2502",
    },
    style: {
      head: [],
      border: [],
      "padding-left": 1,
      "padding-right": 1,
    },
  });

  for (const row of threadRows) {
    table.push(row);
  }

  table.push(statHeader);

  for (const row of statRows) {
    table.push(row);
  }

  return table.toString();
}

export function formatJson(result: SpeedTestResult): string {
  return JSON.stringify(result, null, 2);
}

export function writeOutput(
  result: SpeedTestResult,
  config: SpeedTestConfig
): void {
  if (config.output === "terminal") {
    console.log(formatTerminal(result));
  } else if (config.output === "json") {
    const json = formatJson(result);
    if (config.outputFile) {
      Bun.write(config.outputFile, json);
    } else {
      console.log(json);
    }
  }

  if (result.errors.length > 0) {
    console.error(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
  }
}
