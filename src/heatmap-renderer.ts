import type { HeatmapCell } from './types.js';

export function renderHeatmap(
  cells: HeatmapCell[][],
  columnWidth: number,
  isTTY: boolean,
): string {
  const nonEmptyRows = cells.filter(row => row.length > 0);
  if (nonEmptyRows.length === 0) return '';

  let maxTps = 0;
  for (const row of cells) {
    for (const c of row) {
      if (c.tps !== null && c.tps > maxTps) maxTps = c.tps;
    }
  }

  const rows: string[] = [];
  for (const row of cells) {
    if (row.length === 0) continue;
    const compacted = compactRow(row, columnWidth);
    const line = renderRow(compacted, maxTps, isTTY, row[0].threadIndex);
    rows.push(line);
  }

  return rows.join('\n');
}

function compactRow(row: HeatmapCell[], columnWidth: number): HeatmapCell[] {
  if (row.length <= columnWidth) return row;

  const bucketSize = Math.ceil(row.length / columnWidth);
  const buckets: HeatmapCell[] = [];

  for (let i = 0; i < row.length; i += bucketSize) {
    const slice = row.slice(i, Math.min(i + bucketSize, row.length));
    const allWaiting = slice.every(c => c.isWaiting);
    const nonNullTps = slice.filter(c => c.tps !== null).map(c => c.tps!);
    const avgTps =
      nonNullTps.length > 0
        ? nonNullTps.reduce((a, b) => a + b, 0) / nonNullTps.length
        : null;
    buckets.push({
      threadIndex: row[0].threadIndex,
      intervalIndex: Math.floor(i / bucketSize),
      tps: avgTps,
      isWaiting: allWaiting,
    });
  }

  return buckets;
}

const ANSI_BLUE = '\x1b[44m';
const ANSI_GREEN = '\x1b[42m';
const ANSI_YELLOW = '\x1b[43m';
const ANSI_RED = '\x1b[41m';
const ANSI_DIM_GREY = '\x1b[2m\x1b[37m';
const ANSI_RESET = '\x1b[0m';

const CHAR_WAITING = '\u00b7';
const CHAR_STREAMING = '\u2588';

function tpsToAnsiBg(tps: number, maxTps: number): string {
  if (maxTps <= 0) return ANSI_BLUE;
  const ratio = tps / maxTps;
  if (ratio <= 0.25) return ANSI_BLUE;
  if (ratio <= 0.5) return ANSI_GREEN;
  if (ratio <= 0.75) return ANSI_YELLOW;
  return ANSI_RED;
}

function renderRow(
  cells: HeatmapCell[],
  maxTps: number,
  isTTY: boolean,
  threadIndex: number,
): string {
  const label = `T${threadIndex + 1}`;

  if (!isTTY) {
    const chars = cells.map(c => (c.isWaiting ? CHAR_WAITING : CHAR_STREAMING));
    return `${label} ${chars.join('')}`;
  }

  const parts = cells.map(c => {
    const ansi = c.isWaiting
      ? ANSI_DIM_GREY
      : c.tps !== null
        ? tpsToAnsiBg(c.tps, maxTps)
        : ANSI_BLUE;
    const char = c.isWaiting ? CHAR_WAITING : CHAR_STREAMING;
    return `${ansi}${char}${ANSI_RESET}`;
  });

  return `${label} ${parts.join('')}`;
}
