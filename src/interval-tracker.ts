import type { IntervalSnapshot, ThreadStreamState } from './types.js';

interface ThreadState {
  state: 'waiting' | 'streaming' | 'done';
  tokensInInterval: number;
  totalTokens: number;
  firstTokenTime: number | null;
  streamingStartedAt: number | null;
  activeTime: number;
}

export interface IntervalTracker {
  onStreamEvent(threadIndex: number, event: 'first-token' | 'chunk' | 'done', now?: number, tokenCount?: number): void;
  tick(now: number): IntervalSnapshot | null;
  finalize(now: number): IntervalSnapshot[];
  getThreadStates(): ThreadStreamState[];
}

export interface IntervalTrackerConfig {
  intervalMs: number;
  omitMs: number;
  threadCount: number;
}

export function createIntervalTracker(config: IntervalTrackerConfig, verbose = false): IntervalTracker {
  const { intervalMs, omitMs } = config;

  const log = (msg: string) => { if (verbose) console.error(`[tracker] ${msg}`); };

  const threads: ThreadState[] = Array.from({ length: config.threadCount }, () => ({
    state: 'waiting' as const,
    tokensInInterval: 0,
    totalTokens: 0,
    firstTokenTime: null,
    streamingStartedAt: null,
    activeTime: 0,
  }));

  let clockStarted = false;
  let phaseStartTime = 0;
  let nextIntervalIndex = 0;
  let lastObservedTime = 0;
  let lastSnapshotThreadStates: ThreadStreamState[] | null = null;

  function elapsedSincePhaseStart(now: number): number {
    return now - phaseStartTime;
  }

  function threadActiveTime(thread: ThreadState, now: number): number {
    if (thread.state !== 'streaming' || thread.streamingStartedAt === null) {
      return thread.activeTime;
    }
    return thread.activeTime + Math.max(0, now - thread.streamingStartedAt);
  }

  function buildThreadStates(now: number): ThreadStreamState[] {
    return threads.map((t, i) => {
      const activeTime = threadActiveTime(t, now);
      return {
        threadId: i,
        state: t.state,
        ttft: t.firstTokenTime === null ? null : t.firstTokenTime - phaseStartTime,
        tokensInInterval: t.tokensInInterval,
        totalTokens: t.totalTokens,
        activeTime,
        tokensPerSecond: activeTime > 0 ? (t.totalTokens / activeTime) * 1000 : 0,
      };
    });
  }

  function doTick(now: number): IntervalSnapshot | null {
    if (!clockStarted) return null;
    lastObservedTime = now;

    const intervalStart = nextIntervalIndex * intervalMs;
    const intervalEnd = intervalStart + intervalMs;
    const elapsed = elapsedSincePhaseStart(now);

    if (elapsed < intervalEnd) return null;

    const tokens = threads.reduce((sum, t) => sum + t.tokensInInterval, 0);
    const activeThreadCount = threads.filter(t => t.state === 'streaming').length;
    const omitted = intervalEnd <= omitMs;

    lastSnapshotThreadStates = buildThreadStates(now);

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
    onStreamEvent(threadIndex: number, event: 'first-token' | 'chunk' | 'done', now = 0, tokenCount = 1): void {
      const thread = threads[threadIndex];
      lastObservedTime = now;
      lastSnapshotThreadStates = null;

      switch (event) {
        case 'first-token':
          thread.state = 'streaming';
          thread.firstTokenTime ??= now;
          thread.streamingStartedAt = now;
          log(`T${threadIndex} first-token (streaming=${threads.filter(t => t.state === 'streaming').length}/${config.threadCount})`);
          if (!clockStarted) {
            clockStarted = true;
            phaseStartTime = now;
            log(`clock started on T${threadIndex} first-token`);
          }
          break;
        case 'chunk': {
          const tokens = Math.max(0, tokenCount);
          thread.tokensInInterval += tokens;
          thread.totalTokens += tokens;
          break;
        }
        case 'done':
          if (thread.state === 'streaming' && thread.streamingStartedAt !== null) {
            thread.activeTime += Math.max(0, now - thread.streamingStartedAt);
            thread.streamingStartedAt = null;
          }
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
      lastObservedTime = now;
      log(`finalize: streaming=${threads.filter(t => t.state === 'streaming').length}, done=${threads.filter(t => t.state === 'done').length}, waiting=${threads.filter(t => t.state === 'waiting').length}`);

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
        const omitted = elapsed <= omitMs;

        lastSnapshotThreadStates = buildThreadStates(now);

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
      if (lastSnapshotThreadStates) {
        const snapshot = lastSnapshotThreadStates;
        lastSnapshotThreadStates = null;
        return snapshot;
      }
      return buildThreadStates(lastObservedTime);
    },
  };
}
