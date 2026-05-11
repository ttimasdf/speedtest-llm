import type { SpeedTestConfig, RunMetrics } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';
import { streamText } from 'ai';

export const prefillRunner: ModeRunner = {
  name: 'prefill',
  description:
    'Measures prefill speed (TTFT) under long context load and verifies instruction following',

  async run(
    _config: SpeedTestConfig,
    model: LanguageModel,
    metricsFactory: () => MetricsCollector,
    context: string,
  ): Promise<RunMetrics> {
    const prompt =
      context +
      '\n\nINSTRUCTION: Reply with exactly the word "OK" and nothing else. No explanation, no prefix, no suffix — just "OK".';
    const messages = [{ role: 'user' as const, content: prompt }];

    const collector = metricsFactory();
    const runId = collector.startRun();

    let fullResponse = '';
    let firstChunk = true;

    const result = streamText({
      model,
      messages,
      maxOutputTokens: 10,
      maxRetries: 0,
      onChunk({ chunk }) {
        if (firstChunk) {
          collector.recordFirstToken(runId);
          firstChunk = false;
        }
        if (chunk.type === 'text-delta') {
          fullResponse += chunk.text;
        }
      },
      onFinish({ usage }) {
        collector.recordChunk(runId, usage.outputTokens ?? 0);
      },
    });

    // Drain the stream to ensure onFinish fires
    for await (const _ of result.textStream) {
    }

    const runMetrics = collector.finishRun(runId);
    const instructionFollowed = fullResponse.trim() === 'OK';

    return { ...runMetrics, instructionFollowed };
  },
};
