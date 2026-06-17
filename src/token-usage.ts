export interface NormalizedTokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly noCacheTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly textTokens?: number;
  readonly reasoningTokens?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function numberAt(value: unknown, path: readonly string[]): number | undefined {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return typeof current === 'number' ? current : undefined;
}

export function outputTokensFromUsage(usage: unknown): number {
  return (
    numberAt(usage, ['outputTokens']) ??
    numberAt(usage, ['outputTokens', 'total']) ??
    numberAt(usage, ['completionTokens']) ??
    numberAt(usage, ['completion_tokens']) ??
    numberAt(usage, ['raw', 'completion_tokens']) ??
    numberAt(usage, ['raw', 'output_tokens']) ??
    0
  );
}

export function normalizeTokenUsage(usage: unknown): NormalizedTokenUsage {
  const inputTokens =
    numberAt(usage, ['inputTokens']) ??
    numberAt(usage, ['promptTokens']) ??
    numberAt(usage, ['prompt_tokens']) ??
    numberAt(usage, ['raw', 'prompt_tokens']) ??
    numberAt(usage, ['raw', 'input_tokens']);
  const outputTokens = outputTokensFromUsage(usage) || undefined;
  const totalTokens =
    numberAt(usage, ['totalTokens']) ??
    numberAt(usage, ['total_tokens']) ??
    numberAt(usage, ['raw', 'total_tokens']);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    noCacheTokens: numberAt(usage, ['inputTokenDetails', 'noCacheTokens']),
    cacheReadTokens:
      numberAt(usage, ['inputTokenDetails', 'cacheReadTokens']) ??
      numberAt(usage, ['cachedInputTokens']) ??
      numberAt(usage, ['raw', 'prompt_tokens_details', 'cached_tokens']) ??
      numberAt(usage, ['raw', 'cache_read_input_tokens']),
    cacheWriteTokens:
      numberAt(usage, ['inputTokenDetails', 'cacheWriteTokens']) ??
      numberAt(usage, ['raw', 'cache_creation_input_tokens']) ??
      numberAt(usage, ['raw', 'cache_write_input_tokens']),
    textTokens: numberAt(usage, ['outputTokenDetails', 'textTokens']),
    reasoningTokens:
      numberAt(usage, ['outputTokenDetails', 'reasoningTokens']) ??
      numberAt(usage, ['reasoningTokens']) ??
      numberAt(usage, ['raw', 'completion_tokens_details', 'reasoning_tokens']),
  };
}

export function formatTokenUsage(usage: unknown): string {
  const normalized = normalizeTokenUsage(usage);
  const value = (n: number | undefined) => n === undefined ? 'n/a' : String(n);

  return [
    `input=${value(normalized.inputTokens)}`,
    `output=${value(normalized.outputTokens)}`,
    `total=${value(normalized.totalTokens)}`,
    `noCache=${value(normalized.noCacheTokens)}`,
    `cacheRead=${value(normalized.cacheReadTokens)}`,
    `cacheWrite=${value(normalized.cacheWriteTokens)}`,
    `text=${value(normalized.textTokens)}`,
    `reasoning=${value(normalized.reasoningTokens)}`,
    `raw=${JSON.stringify(usage)}`,
  ].join(' ');
}
