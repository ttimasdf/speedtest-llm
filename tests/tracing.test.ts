import { describe, it, expect } from 'bun:test';
import { createTraceCollector } from '../src/tracing.js';
import type { SpeedTestConfig } from '../src/types.js';

function makeConfig(overrides: Partial<SpeedTestConfig> = {}): SpeedTestConfig {
  return {
    mode: 'fresh',
    baseUrl: 'http://localhost:4000/v1',
    model: 'gpt-4o',
    maxTokens: 4096,
    threads: 1,
    apiKey: 'test',
    apiType: 'openai-chat',
    contextFile: 'assets/long-context.txt',
    output: 'terminal',
    timeout: 60000,
    verbose: false,
    rampUp: 0,
    interval: 1,
    omit: 0,
    traceOutput: 'memory',
    traceIncludeContent: false,
    ...overrides,
  };
}

describe('TraceCollector', () => {
  it('records OTEL-shaped stream lifecycle events in memory', async () => {
    const collector = createTraceCollector(makeConfig());

    collector.record(0, { event: 'stream_start' });
    collector.record(0, { event: 'stream_first_chunk', content: 'hi' });
    collector.record(0, { event: 'stream_chunk', content: ' there' });
    collector.record(0, { event: 'stream_end', tokens: 3 });
    await collector.flush();

    const records = collector.getRecords();
    expect(records).toHaveLength(4);
    expect(records.map((record) => record.event)).toEqual([
      'stream_start',
      'stream_first_chunk',
      'stream_chunk',
      'stream_end',
    ]);
    expect(records[0].thread).toBe(1);
    expect(records[0].api_type).toBe('openai-chat');
    expect(records[0].trace_id).toBe(records[3].trace_id);
    expect(records[0].span_id).toBe(records[3].span_id);
    expect(records[1].time_to_first_token).toBeGreaterThanOrEqual(0);
    expect(records[2].estimated_tokens_total).toBeGreaterThanOrEqual(2);
    expect(records[3].tokens).toBe(3);
    expect(records[1].content).toBe('hi');
  });

  it('serializes non-text stream blocks without content stats', async () => {
    const collector = createTraceCollector(makeConfig());

    collector.record(0, { event: 'stream_start' });
    collector.record(0, {
      event: 'stream_chunk',
      blockType: 'tool-call',
      block: { type: 'tool-call', toolName: 'lookup', input: { q: 'hi' } },
    });
    await collector.flush();

    const record = collector.getRecords()[1];
    expect(record.block_type).toBe('tool-call');
    expect(record.block_json).toBe('{"type":"tool-call","toolName":"lookup","input":{"q":"hi"}}');
    expect(record.content).toBeUndefined();
    expect(record.content_length).toBe(0);
  });

  it('writes JSONL trace records to a file', async () => {
    const traceFile = `/tmp/speedtest-llm-trace-${crypto.randomUUID()}.jsonl`;
    const collector = createTraceCollector(makeConfig({ traceOutput: 'file', traceFile }));

    collector.record(0, { event: 'stream_start' });
    collector.record(0, { event: 'stream_first_chunk', content: 'hello' });
    collector.record(0, { event: 'stream_end', tokens: 1 });
    await collector.flush();

    const text = await Bun.file(traceFile).text();
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(3);
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed[0].event).toBe('stream_start');
    expect(parsed[1].event).toBe('stream_first_chunk');
    expect(parsed[2].event).toBe('stream_end');
    expect(parsed[2].tokens).toBe(1);

    await Bun.$`rm -f ${traceFile}`;
  });
});
