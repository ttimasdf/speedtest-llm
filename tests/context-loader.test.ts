import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { loadContext, estimateTokens, warnIfExceedsContext } from '../src/context-loader.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ctx-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('loadContext', () => {
  it('with existing file returns non-empty string', async () => {
    const filePath = join(tempDir, 'context.txt');
    await writeFile(filePath, 'Hello, this is test context content.');
    const result = await loadContext(filePath);
    expect(result).toBe('Hello, this is test context content.');
    expect(result.length).toBeGreaterThan(0);
  });

  it('with nonexistent file throws', async () => {
    await expect(loadContext('/nonexistent/path/file.txt')).rejects.toThrow('Context file not found');
  });

  it('with empty file throws', async () => {
    const filePath = join(tempDir, 'empty.txt');
    await writeFile(filePath, '');
    await expect(loadContext(filePath)).rejects.toThrow('Context file is empty');
  });
});

describe('estimateTokens', () => {
  it('returns positive number', () => {
    const tokens = estimateTokens('Hello world, this is a test string.');
    expect(tokens).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', () => {
    const tokens = estimateTokens('');
    expect(tokens).toBe(0);
  });

  it('uses ~4 chars per token heuristic', () => {
    const tokens = estimateTokens('12345678');
    expect(tokens).toBe(2);
  });
});

describe('warnIfExceedsContext', () => {
  let warnSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    warnSpy = mock(() => {});
    console.warn = warnSpy;
  });

  afterEach(() => {
    console.warn = console.warn;
  });

  it('warns when tokens > 80% limit', () => {
    const result = warnIfExceedsContext(110000, 128000);
    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns false when under limit', () => {
    const result = warnIfExceedsContext(50000, 128000);
    expect(result).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns false at exact 80% boundary', () => {
    const result = warnIfExceedsContext(102400, 128000);
    expect(result).toBe(false);
  });
});
