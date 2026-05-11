// Load long context from file
export async function loadContext(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Context file not found: ${filePath}`);
  }
  const text = await file.text();
  if (text.length === 0) {
    throw new Error(`Context file is empty: ${filePath}`);
  }
  // Warn if suspiciously large
  if (text.length > 1_000_000) {
    console.warn(`Warning: Context file is ${text.length} chars — this may exceed model context limits`);
  }
  if (text.length > 10_000_000) {
    throw new Error(`Context file too large (${text.length} chars). Maximum is 10MB.`);
  }
  return text;
}

// Simple heuristic token estimation (~4 chars per token for English)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function warnIfExceedsContext(tokens: number, maxContextTokens: number = 128000): boolean {
  if (tokens > maxContextTokens * 0.8) {
    console.warn(`Warning: Context has ~${tokens} tokens (model context limit: ${maxContextTokens}). Consider a smaller context file.`);
    return true;
  }
  return false;
}
