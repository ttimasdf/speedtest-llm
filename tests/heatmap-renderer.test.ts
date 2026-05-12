import { describe, it, expect } from 'bun:test';
import { renderHeatmap } from '../src/heatmap-renderer.js';
import type { HeatmapCell } from '../src/types.js';

function cell(
  threadIndex: number,
  intervalIndex: number,
  tps: number | null,
  isWaiting: boolean,
): HeatmapCell {
  return { threadIndex, intervalIndex, tps, isWaiting };
}

describe('renderHeatmap', () => {
  it('returns empty string for empty cells array', () => {
    expect(renderHeatmap([], 40, true)).toBe('');
  });

  it('renders single streaming cell with ANSI codes in TTY mode', () => {
    const cells: HeatmapCell[][] = [[cell(0, 0, 100, false)]];
    const output = renderHeatmap(cells, 40, true);
    // Should have thread label T1 and one colored block
    expect(output).toContain('T1');
    expect(output).toContain('\x1b['); // ANSI escape
    expect(output).toContain('\x1b[0m'); // reset
    expect(output).toContain('\u2588'); // full block
  });

  it('renders waiting cell with dim grey middle-dot', () => {
    const cells: HeatmapCell[][] = [[cell(0, 0, null, true)]];
    const output = renderHeatmap(cells, 40, true);
    expect(output).toContain('\x1b[2m\x1b[37m'); // dim + grey
    expect(output).toContain('\u00b7'); // middle dot
    expect(output).toContain('\x1b[0m'); // reset
  });

  it('renders multiple thread rows with labels', () => {
    const cells: HeatmapCell[][] = [
      [cell(0, 0, 100, false)],
      [cell(1, 0, 200, false)],
    ];
    const output = renderHeatmap(cells, 40, true);
    expect(output).toContain('T1');
    expect(output).toContain('T2');
    const lines = output.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  it('compacts cells when interval count exceeds column width', () => {
    // 20 cells for thread 0, column width 5 → should merge into 5 cells
    const manyCells: HeatmapCell[] = [];
    for (let i = 0; i < 20; i++) {
      manyCells.push(cell(0, i, 100, false));
    }
    const output = renderHeatmap([manyCells], 5, true);
    const line = output.trim();
    // After compaction: 5 block chars + ANSI overhead for each
    // Count the block characters
    const blockCount = (line.match(/\u2588/g) || []).length;
    expect(blockCount).toBe(5);
  });

  it('strips ANSI codes in non-TTY mode', () => {
    const cells: HeatmapCell[][] = [[cell(0, 0, 100, false)]];
    const output = renderHeatmap(cells, 40, false);
    expect(output).not.toContain('\x1b[');
    expect(output).toContain('T1');
    expect(output).toContain('\u2588');
  });

  it('renders all-waiting cells correctly', () => {
    const cells: HeatmapCell[][] = [
      [cell(0, 0, null, true), cell(0, 1, null, true)],
      [cell(1, 0, null, true)],
    ];
    const output = renderHeatmap(cells, 40, true);
    const dotCount = (output.match(/\u00b7/g) || []).length;
    expect(dotCount).toBe(3); // 2 + 1 = 3 waiting cells total
    expect(output).toContain('T1');
    expect(output).toContain('T2');
  });
});
