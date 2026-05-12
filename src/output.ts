import type {
  SpeedTestResult,
  SpeedTestConfig,
  HeatmapCell,
} from "./types.js";

export function convertToHeatmapCells(result: SpeedTestResult): HeatmapCell[][] {
  const intervals = result.intervals ?? [];
  const threadStates = result.threadStates ?? [];
  if (intervals.length === 0 || threadStates.length === 0) {
    return [];
  }

  const threadCount = result.config.threads;
  const intervalCount = threadStates.length;
  const rows: HeatmapCell[][] = [];

  for (let threadIdx = 0; threadIdx < threadCount; threadIdx++) {
    const row: HeatmapCell[] = [];
    for (let intervalIdx = 0; intervalIdx < intervalCount; intervalIdx++) {
      const threadState = threadStates[intervalIdx][threadIdx];
      const cell: HeatmapCell = {
        threadIndex: threadIdx,
        intervalIndex: intervalIdx,
        tps: threadState?.state === "streaming" ? (threadState.tokensInInterval > 0 ? threadState.tokensInInterval / result.config.interval : null) : null,
        isWaiting: threadState?.state === "waiting",
      };
      row.push(cell);
    }
    rows.push(row);
  }

  return rows;
}

export function formatJson(result: SpeedTestResult): string {
  return JSON.stringify(result, null, 2);
}

export function writeJsonOutput(
  result: SpeedTestResult,
  config: SpeedTestConfig,
): void {
  const json = formatJson(result);
  if (config.outputFile) {
    Bun.write(config.outputFile, json);
  } else {
    console.log(json);
  }
}
