import type { IntervalSnapshot, ThreadStreamState } from './types.js';

interface ThreadState {
  state: 'waiting' | 'streaming' | 'done';
  tokensInInterval: number;
}

export interface IntervalTracker {
  onStreamEvent(threadIndex: number, event: 'first-token' | 'chunk' | 'done', now?: number): void;
  tick(now: number): IntervalSnapshot | null;
  finalize(now: number): IntervalSnapshot[];
  getThreadStates(): ThreadStreamState[];
}

export interface IntervalTrackerConfig {
  intervalMs: number;
  omitMs: number;
  rampUpMs: number;
  threadCount: number;
}

export function createIntervalTracker(config: IntervalTrackerConfig, verbose = false): IntervalTracker {
  const { intervalMs, omitMs, rampUpMs } = config;

  const log = (msg: string) => { if (verbose) console.error(`[tracker] ${msg}`); };

  const threads: ThreadState[] = Array.from({ length: config.threadCount }, () => ({
    state: 'waiting' as const,
    tokensInInterval: 0,
  }));

  let clockStarted = false;
  let clockStartTime = 0;
  let phaseStartTime = 0;
  let rampUpComplete = rampUpMs <= 0;
  let nextIntervalIndex = 0;

  function elapsedSincePhaseStart(now: number): number {
    return now - phaseStartTime;
  }

  function doTick(now: number): IntervalSnapshot | null {
    if (!clockStarted) return null;

    const intervalStart = nextIntervalIndex * intervalMs;
    const intervalEnd = intervalStart + intervalMs;
    const elapsed = elapsedSincePhaseStart(now);

    if (elapsed < intervalEnd) return null;

    // Time-based ramp-up check. The interval that crosses the ramp-up
    // boundary is omitted, then the visible interval clock restarts at the
    // emitted interval boundary.
    const wasInRampUp = !rampUpComplete && rampUpMs > 0;
    let rampUpJustEnded = false;
    if (wasInRampUp && now - clockStartTime >= rampUpMs) {
      rampUpComplete = true;
      rampUpJustEnded = true;
    }

    const tokens = threads.reduce((sum, t) => sum + t.tokensInInterval, 0);
    const activeThreadCount = threads.filter(t => t.state === 'streaming').length;
    const omitted = intervalEnd <= omitMs || wasInRampUp;

    for (const t of threads) {
      t.tokensInInterval = 0;
    }

    // Reset counters at ramp-up boundary AFTER capturing the boundary interval
    if (rampUpJustEnded) {
      log(`ramp-up complete after ${((now - clockStartTime) / 1000).toFixed(2)}s, resetting counters`);
      phaseStartTime += intervalEnd;
      nextIntervalIndex = 0;
    } else {
      nextIntervalIndex++;
    }

    return {
      startTime: intervalStart,
      endTime: intervalEnd,
      tokens,
      tps: (tokens / intervalMs) * 1000,
      threadCount: config.threadCount,
      activeThreadCount,
      omitted,
    };
  }

  return {
    onStreamEvent(threadIndex: number, event: 'first-token' | 'chunk' | 'done', now = 0): void {
      const thread = threads[threadIndex];

      switch (event) {
        case 'first-token':
          thread.state = 'streaming';
          log(`T${threadIndex} first-token (streaming=${threads.filter(t => t.state === 'streaming').length}/${config.threadCount})`);
          if (!clockStarted) {
            clockStarted = true;
            clockStartTime = now;
            phaseStartTime = now;
            if (rampUpMs > 0) {
              log(`clock started on T${threadIndex} first-token, ramp-up ${(rampUpMs / 1000).toFixed(1)}s begins`);
            } else {
              log(`clock started on T${threadIndex} first-token`);
            }
          }
          break;
        case 'chunk':
          thread.tokensInInterval += 1;
          break;
        case 'done':
          thread.state = 'done';
          log(`T${threadIndex} done (streaming=${threads.filter(t => t.state === 'streaming').length}, done=${threads.filter(t => t.state === 'done').length})`);
          break;
      }
    },

    tick: doTick,

    finalize(now: number): IntervalSnapshot[] {
      if (!clockStarted) {
        log(`finalize: clock never started, no snapshots`);
        return [];
      }
      log(`finalize: rampUpComplete=${rampUpComplete}, streaming=${threads.filter(t => t.state === 'streaming').length}, done=${threads.filter(t => t.state === 'done').length}, waiting=${threads.filter(t => t.state === 'waiting').length}`);

      const snapshots: IntervalSnapshot[] = [];

      while (true) {
        const nextEnd = (nextIntervalIndex + 1) * intervalMs;
        if (elapsedSincePhaseStart(now) >= nextEnd) {
          const s = doTick(now);
          if (s) {
            snapshots.push(s);
          } else {
            break;
          }
        } else {
          break;
        }
      }

      const partialStart = nextIntervalIndex * intervalMs;
      const elapsed = elapsedSincePhaseStart(now);
      if (elapsed > partialStart) {
        const tokens = threads.reduce((sum, t) => sum + t.tokensInInterval, 0);
        const activeThreadCount = threads.filter(t => t.state === 'streaming').length;
        const duration = elapsed - partialStart;
        const omitted = elapsed <= omitMs || !rampUpComplete;

        snapshots.push({
          startTime: partialStart,
          endTime: elapsed,
          tokens,
          tps: duration > 0 ? (tokens / duration) * 1000 : 0,
          threadCount: config.threadCount,
          activeThreadCount,
          omitted,
        });
      }

      return snapshots;
    },

    getThreadStates(): ThreadStreamState[] {
      return threads.map((t, i) => ({
        threadId: i,
        state: t.state,
        ttft: null as number | null,
        tokensInInterval: t.tokensInInterval,
      }));
    },
  };
}
