import { describe, it, expect } from 'bun:test';
import { createIntervalTracker } from '../src/interval-tracker.js';

describe('IntervalTracker', () => {
  it('tick returns null before clock starts (no first-token event)', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 2 });

    expect(tracker.tick(500)).toBeNull();
    expect(tracker.tick(1500)).toBeNull();
    expect(tracker.tick(10000)).toBeNull();
  });

  it('clock starts on first-token, tick at interval boundary returns snapshot', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');

    const snapshot = tracker.tick(1000);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.startTime).toBe(0);
    expect(snapshot!.endTime).toBe(1000);
    expect(snapshot!.omitted).toBe(false);
    expect(snapshot!.threadCount).toBe(1);
    expect(snapshot!.activeThreadCount).toBe(1);
  });

  it('accumulates chunk events into token count within an interval', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');

    const snapshot = tracker.tick(1000);
    expect(snapshot!.tokens).toBe(3);
  });

  it('marks omitted intervals when end time falls within omitMs', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 2000, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');

    // Interval 0: 0-1000, end 1000 <= 2000 → omitted
    const snap1 = tracker.tick(1000);
    expect(snap1!.omitted).toBe(true);

    // Interval 1: 1000-2000, end 2000 <= 2000 → omitted
    const snap2 = tracker.tick(2000);
    expect(snap2!.omitted).toBe(true);

    // Interval 2: 2000-3000, end 3000 > 2000 → not omitted
    const snap3 = tracker.tick(3000);
    expect(snap3!.omitted).toBe(false);
  });

  it('tracks active thread count correctly with mixed states', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 3 });

    tracker.onStreamEvent(0, 'first-token'); // thread 0 → streaming
    tracker.onStreamEvent(1, 'first-token'); // thread 1 → streaming
    // thread 2 still waiting

    const snap1 = tracker.tick(1000);
    expect(snap1!.threadCount).toBe(3);
    expect(snap1!.activeThreadCount).toBe(2);

    // thread 2 starts, thread 0 finishes
    tracker.onStreamEvent(2, 'first-token'); // thread 2 → streaming
    tracker.onStreamEvent(0, 'done');         // thread 0 → done

    const snap2 = tracker.tick(2000);
    expect(snap2!.activeThreadCount).toBe(2); // threads 1 and 2 streaming
  });

  it('tick returns null if no interval boundary has been crossed', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');

    expect(tracker.tick(500)).toBeNull();       // before first boundary
    expect(tracker.tick(1000)).not.toBeNull();  // at first boundary
    expect(tracker.tick(1500)).toBeNull();       // before second boundary
    expect(tracker.tick(2000)).not.toBeNull();   // at second boundary
  });

  it('finalize returns all remaining intervals including partial', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');

    // Collect the first full interval
    tracker.tick(1000);

    // More tokens in the next interval window
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'done');

    // Finalize at 2500ms — should return:
    //   completed interval 1 (1000-2000) with 2 tokens
    //   partial interval 2 (2000-2500) with 0 tokens
    const snapshots = tracker.finalize(2500);
    expect(snapshots).toHaveLength(2);

    expect(snapshots[0].startTime).toBe(1000);
    expect(snapshots[0].endTime).toBe(2000);
    expect(snapshots[0].tokens).toBe(2);

    expect(snapshots[1].startTime).toBe(2000);
    expect(snapshots[1].endTime).toBe(2500);
    expect(snapshots[1].tokens).toBe(0);
  });
});
