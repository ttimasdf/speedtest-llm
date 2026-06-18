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

  it('uses chunk tokenCount when provided', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk', 100, 7);
    tracker.onStreamEvent(0, 'chunk', 200, 3);

    const snapshot = tracker.tick(1000);
    expect(snapshot!.tokens).toBe(10);
  });

  it('marks omitted intervals when end time falls within omitMs', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 2000, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');

    const snap1 = tracker.tick(1000);
    expect(snap1!.omitted).toBe(true);

    const snap2 = tracker.tick(2000);
    expect(snap2!.omitted).toBe(true);

    const snap3 = tracker.tick(3000);
    expect(snap3!.omitted).toBe(false);
  });

  it('keeps omitted pre-test timing instead of resetting intervals', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 2500, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');

    expect(tracker.tick(1000)!.omitted).toBe(true);
    expect(tracker.tick(2000)!.omitted).toBe(true);

    const snap = tracker.tick(3000);
    expect(snap).not.toBeNull();
    expect(snap!.startTime).toBe(2000);
    expect(snap!.endTime).toBe(3000);
    expect(snap!.omitted).toBe(false);
  });

  it('tracks active thread count correctly with mixed states', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 3 });

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
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token');

    expect(tracker.tick(500)).toBeNull();
    expect(tracker.tick(1000)).not.toBeNull();
    expect(tracker.tick(1500)).toBeNull();
    expect(tracker.tick(2000)).not.toBeNull();
  });

  it('uses elapsed time when ticks receive absolute performance.now values', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token', 1_000_000);

    expect(tracker.tick(1_000_500)).toBeNull();
    const snapshot = tracker.tick(1_001_000);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.startTime).toBe(0);
    expect(snapshot!.endTime).toBe(1000);
  });

  it('finalize returns all remaining intervals including partial', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

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

  it('final state exposes cumulative per-thread TPS for interrupted streams', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 0, threadCount: 1 });

    tracker.onStreamEvent(0, 'first-token', 1000);
    tracker.onStreamEvent(0, 'chunk', 1500, 25);
    tracker.finalize(2000);

    const state = tracker.getThreadStates()[0];
    expect(state.state).toBe('streaming');
    expect(state.totalTokens).toBe(25);
    expect(state.activeTime).toBe(1000);
    expect(state.tokensPerSecond).toBe(25);
  });

  it('finalize during omitted pre-test marks partial as omitted', () => {
    const tracker = createIntervalTracker({ intervalMs: 1000, omitMs: 5000, threadCount: 3 });

    tracker.onStreamEvent(0, 'first-token');
    tracker.onStreamEvent(0, 'chunk');

    const snapshots = tracker.finalize(3000);
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0].omitted).toBe(true);
  });
});
