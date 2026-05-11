import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { SpeedTestConfig } from '../types.js';

export function createProvider(config: SpeedTestConfig): LanguageModel {
  if (!config.apiKey) {
    throw new Error(
      'API key is required. Set LLM_API_KEY environment variable or use --api-key.',
    );
  }

  const provider = createOpenAICompatible({
    name: 'speedtest-provider',
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return provider.chatModel(config.model);
}
