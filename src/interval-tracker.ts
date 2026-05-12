import type { IntervalSnapshot, ThreadStreamState } from './types.js';

interface ThreadState {
  state: 'waiting' | 'streaming' | 'done';
  tokensInInterval: number;
}

export interface IntervalTracker {
  onStreamEvent(threadIndex: number, event: 'first-token' | 'chunk' | 'done'): void;
  tick(now: number): IntervalSnapshot | null;
  finalize(now: number): IntervalSnapshot[];
  getThreadStates(): ThreadStreamState[];
}

export interface IntervalTrackerConfig {
  intervalMs: number;
  omitMs: number;
  threadCount: number;
}

export function createIntervalTracker(config: IntervalTrackerConfig): IntervalTracker {
  const { intervalMs, omitMs } = config;

  const threads: ThreadState[] = Array.from({ length: config.threadCount }, () => ({
    state: 'waiting' as const,
    tokensInInterval: 0,
  }));

  let clockStarted = false;
  let nextIntervalIndex = 0;

  function doTick(now: number): IntervalSnapshot | null {
    if (!clockStarted) return null;

    const intervalStart = nextIntervalIndex * intervalMs;
    const intervalEnd = intervalStart + intervalMs;

    if (now < intervalEnd) return null;

    const tokens = threads.reduce((sum, t) => sum + t.tokensInInterval, 0);
    const activeThreadCount = threads.filter(t => t.state === 'streaming').length;
    const omitted = intervalEnd <= omitMs;

    for (const t of threads) {
      t.tokensInInterval = 0;
    }

    nextIntervalIndex++;

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
    onStreamEvent(threadIndex: number, event: 'first-token' | 'chunk' | 'done'): void {
      const thread = threads[threadIndex];

      switch (event) {
        case 'first-token':
          thread.state = 'streaming';
          if (!clockStarted) {
            clockStarted = true;
          }
          break;
        case 'chunk':
          thread.tokensInInterval += 1;
          break;
        case 'done':
          thread.state = 'done';
          break;
      }
    },

    tick: doTick,

    finalize(now: number): IntervalSnapshot[] {
      if (!clockStarted) return [];

      const snapshots: IntervalSnapshot[] = [];

      while (true) {
        const nextEnd = (nextIntervalIndex + 1) * intervalMs;
        if (now >= nextEnd) {
          const s = doTick(now);
          if (s) snapshots.push(s);
        } else {
          break;
        }
      }

      const partialStart = nextIntervalIndex * intervalMs;
      if (now > partialStart) {
        const tokens = threads.reduce((sum, t) => sum + t.tokensInInterval, 0);
        const activeThreadCount = threads.filter(t => t.state === 'streaming').length;
        const duration = now - partialStart;
        const omitted = now <= omitMs;

        snapshots.push({
          startTime: partialStart,
          endTime: now,
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
