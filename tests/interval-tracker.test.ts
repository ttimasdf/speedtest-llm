import { describe, it, expect } from 'bun:test';
import { createIntervalTracker } from '../src/interval-tracker.js';

describe('IntervalTracker', () => {
  it('tick returns null before clock starts (no first-token event)', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 2 });

    expect(tracker.tick(500)).toBeNull();
    expect(tracker.tick(1500)).toBeNull();
    expect(tracker.tick(10000)).toBeNull();
  });

  it('clock starts on first-token, tick at interval boundary returns snapshot', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 1 });

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
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');

    const snapshot = tracker.tick(1000);
    expect(snapshot!.tokens).toBe(3);
  });

  it('marks omitted intervals when end time falls within omitMs', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 2000, rampUpMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');

    const snap1 = tracker.tick(1000);
    expect(snap1!.omitted).toBe(true);

    const snap2 = tracker.tick(2000);
    expect(snap2!.omitted).toBe(true);

    const snap3 = tracker.tick(3000);
    expect(snap3!.omitted).toBe(false);
  });

  it('tracks active thread count correctly with mixed states (no ramp-up)', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 3 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(1, 'first-token');

    const snap1 = tracker.tick(1000);
    expect(snap1!.threadCount).toBe(3);
    expect(snap1!.activeThreadCount).toBe(2);

    tracker.onStreamEvent(2, 'first-token');
    tracker.onStreamEvent(0, 'done');

    const snap2 = tracker.tick(2000);
    expect(snap2!.activeThreadCount).toBe(2);
  });

  it('tick returns null if no interval boundary has been crossed', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');

    expect(tracker.tick(500)).toBeNull();
    expect(tracker.tick(1000)).not.toBeNull();
    expect(tracker.tick(1500)).toBeNull();
    expect(tracker.tick(2000)).not.toBeNull();
  });

  it('uses elapsed time when ticks receive absolute performance.now values', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token', 1_000_000);

    expect(tracker.tick(1_000_500)).toBeNull();
    const snapshot = tracker.tick(1_001_000);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.startTime).toBe(0);
    expect(snapshot!.endTime).toBe(1000);
  });

  it('finalize returns all remaining intervals including partial', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');

    tracker.tick(1000);

    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'chunk');
    tracker.onStreamEvent(0, 'done');

    const snapshots = tracker.finalize(2500);
    expect(snapshots).toHaveLength(2);

    expect(snapshots[0].startTime).toBe(1000);
    expect(snapshots[0].endTime).toBe(2000);
    expect(snapshots[0].tokens).toBe(2);

    expect(snapshots[1].startTime).toBe(2000);
    expect(snapshots[1].endTime).toBe(2500);
    expect(snapshots[1].tokens).toBe(0);
  });

  describe('ramp-up', () => {
    it('marks ramp-up intervals as omitted, resets index at boundary', () => {
      const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 2500, threadCount: 2 });

      tracker.onStreamEvent(0, 'first-token');
      tracker.onStreamEvent(0, 'chunk');
      tracker.onStreamEvent(0, 'chunk');

      // First tick latches clockStartTime at 500. rampUpMs=2500 → boundary at 500+2500=3000
      tracker.tick(500);

      // Interval 0 (0-1000): entirely in ramp-up → omitted
      const s0 = tracker.tick(1000);
      expect(s0).not.toBeNull();
      expect(s0!.omitted).toBe(true);
      expect(s0!.tokens).toBe(2);

      // Interval 1 (1000-2000): entirely in ramp-up → omitted
      const s1 = tracker.tick(2000);
      expect(s1).not.toBeNull();
      expect(s1!.omitted).toBe(true);

      // Interval 2 (2000-3000): straddles boundary — captured as omitted, then index resets
      const s2 = tracker.tick(3000);
      expect(s2).not.toBeNull();
      expect(s2!.startTime).toBe(2000);
      expect(s2!.endTime).toBe(3000);
      expect(s2!.omitted).toBe(true); // interval started during ramp-up

      // After ramp-up: index reset to 0, interval numbering restarts
      const s3 = tracker.tick(4000);
      expect(s3).not.toBeNull();
      expect(s3!.startTime).toBe(0); // restarted
      expect(s3!.endTime).toBe(1000);
      expect(s3!.omitted).toBe(false);
    });

    it('discards ramp-up tokens from post-ramp-up intervals', () => {
      const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 2500, threadCount: 2 });

      tracker.onStreamEvent(0, 'first-token');
      tracker.tick(500); // latch clockStartTime

      // Ramp-up tokens
      tracker.onStreamEvent(0, 'chunk');
      tracker.onStreamEvent(0, 'chunk');
      tracker.onStreamEvent(0, 'chunk');

      // Cross ramp-up boundary at 500+2500=3000 — captures boundary interval, resets
      tracker.tick(3000);

      // Post-ramp-up tokens (new interval index 0)
      tracker.onStreamEvent(0, 'chunk');
      tracker.onStreamEvent(0, 'chunk');

      const snap = tracker.tick(4000);
      expect(snap!.startTime).toBe(0);
      expect(snap!.tokens).toBe(2); // only post-ramp-up tokens
      expect(snap!.omitted).toBe(false);
    });

    it('rampUpMs=0 behaves like no ramp-up', () => {
      const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 0, threadCount: 2 });

      tracker.onStreamEvent(0, 'first-token');
      tracker.onStreamEvent(0, 'chunk');

      const snap = tracker.tick(1000);
      expect(snap).not.toBeNull();
      expect(snap!.activeThreadCount).toBe(1);
      expect(snap!.omitted).toBe(false);
    });

    it('finalize during ramp-up does not hang, marks partial as omitted', () => {
      const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, rampUpMs: 5000, threadCount: 3 });

      tracker.onStreamEvent(0, 'first-token');
      tracker.onStreamEvent(0, 'chunk');

      tracker.tick(100); // latch clockStartTime

      const snapshots = tracker.finalize(3000);
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].omitted).toBe(true);
    });
  });
});
