import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { parseConfig } from '../src/config.js';

// parseConfig calls process.exit on failure. We mock it to throw so we can catch.
let exitSpy: ReturnType<typeof mock>;
const origExit = process.exit;

function mockExit() {
  exitSpy = mock(() => {
    throw new Error('process.exit called');
  });
  process.exit = exitSpy as unknown as typeof process.exit;
}

function restoreExit() {
  process.exit = origExit;
}

describe('parseConfig', () => {
  beforeEach(() => {
    delete process.env.LLM_API_KEY;
  });

  it('valid config with minimal args (--mode fresh --api-key test)', () => {
    const cfg = parseConfig(['--mode', 'fresh', '--api-key', 'test']);
    expect(cfg.mode).toBe('fresh');
    expect(cfg.apiKey).toBe('test');
    expect(cfg.baseUrl).toBe('http://localhost:4000/v1');
    expect(cfg.model).toBe('deepseek-v4-flash');
    expect(cfg.threads).toBe(3);
    expect(cfg.maxTokens).toBe(4096);
    expect(cfg.apiType).toBe('anthropic-messages');
    expect(cfg.output).toBe('terminal');
    expect(cfg.timeout).toBe(60000);
    expect(cfg.verbose).toBe(false);
    expect(cfg.rampUp).toBe(0);
    expect(cfg.interval).toBe(1);
    expect(cfg.omit).toBe(0);
    expect(cfg.traceOutput).toBe('off');
    expect(cfg.traceFile).toBeUndefined();
    expect(cfg.traceIncludeContent).toBe(false);
  });

  it('valid config with all args set', () => {
    const cfg = parseConfig([
      '--mode', 'prefill',
      '--api-key', 'my-key',
      '--base-url', 'https://example.com/v1',
      '--model', 'claude-3',
      '--threads', '4',
      '--max-tokens', '2048',
      '--api-type', 'anthropic-messages',
      '--context-file', 'custom.txt',
      '--output', 'json',
      '--output-file', 'out.json',
      '--timeout', '30',
      '--verbose',
      '--ramp-up', '0.5',
      '--interval', '2',
      '--omit', '3',
      '--trace-output', 'file',
      '--trace-file', 'trace.jsonl',
      '--trace-include-content',
    ]);
    expect(cfg.mode).toBe('prefill');
    expect(cfg.apiKey).toBe('my-key');
    expect(cfg.baseUrl).toBe('https://example.com/v1');
    expect(cfg.model).toBe('claude-3');
    expect(cfg.threads).toBe(4);
    expect(cfg.maxTokens).toBe(2048);
    expect(cfg.apiType).toBe('anthropic-messages');
    expect(cfg.contextFile).toBe('custom.txt');
    expect(cfg.output).toBe('json');
    expect(cfg.timeout).toBe(30000);
    expect(cfg.verbose).toBe(true);
    expect(cfg.rampUp).toBe(0.5);
    expect(cfg.interval).toBe(2);
    expect(cfg.omit).toBe(3);
    expect(cfg.traceOutput).toBe('file');
    expect(cfg.traceFile).toBe('trace.jsonl');
    expect(cfg.traceIncludeContent).toBe(true);
  });

  it('invalid mode exits with error', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'invalid', '--api-key', 'k'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('--threads 0 rejects', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--threads', '0'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('--max-tokens 0 rejects', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--max-tokens', '0'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('missing API key when LLM_API_KEY unset', () => {
    delete process.env.LLM_API_KEY;
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('API key from env var LLM_API_KEY', () => {
    process.env.LLM_API_KEY = 'env-key';
    try {
      const cfg = parseConfig(['--mode', 'fresh']);
      expect(cfg.apiKey).toBe('env-key');
    } finally {
      delete process.env.LLM_API_KEY;
    }
  });

  it('--base-url must start with http', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--base-url', 'ftp://bad'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('--interval 0 rejects', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--interval', '0'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('--interval negative rejects', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--interval', '-1'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('--omit negative rejects', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--omit', '-1'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });

  it('--trace-output invalid rejects', () => {
    mockExit();
    try {
      expect(() => parseConfig(['--mode', 'fresh', '--api-key', 'k', '--trace-output', 'stdout'])).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreExit();
    }
  });
});
