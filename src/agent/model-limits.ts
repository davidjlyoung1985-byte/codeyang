/**
 * Model context limits.
 *
 * The `maxTokens` setting in config.ts is the **output** budget passed to
 * `client.stream({ maxTokens })`. It is NOT the context window. Conflating the
 * two caused the agent to discard history at ~8% of the real window, so the
 * mapping lives here as a single source of truth.
 */

/** Conservative fallback when the model is unknown. */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Fraction of the context window reserved for the prompt (rest is output + drift). */
const INPUT_BUDGET_RATIO = 0.8;

/**
 * Ordered (pattern, window) pairs. First match wins, so put specific
 * patterns before broad ones.
 */
const CONTEXT_WINDOW_TABLE: ReadonlyArray<readonly [RegExp, number]> = [
  // Anthropic
  [/^claude/i, 200_000],
  // DeepSeek
  [/^deepseek/i, 128_000],
  // OpenAI
  [/^gpt-5/i, 400_000],
  [/^gpt-4\.1/i, 1_000_000],
  [/^gpt-4o/i, 128_000],
  [/^gpt-4/i, 128_000],
  [/^o[134]/i, 200_000],
  // Local / open weights commonly proxied through OpenAI-compatible endpoints
  [/^(qwen|llama|mistral|mixtral|glm|kimi|moonshot)/i, 128_000],
  [/^gemini/i, 1_000_000],
];

/** Resolve the total context window (input + output) for a model id. */
export function getContextWindow(model: string): number {
  const id = (model ?? '').trim();
  if (!id) return DEFAULT_CONTEXT_WINDOW;

  // Strip provider prefixes such as "anthropic/claude-..." or "openai/gpt-4o".
  const bare = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;

  for (const [pattern, window] of CONTEXT_WINDOW_TABLE) {
    if (pattern.test(bare) || pattern.test(id)) return window;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Token budget available for the prompt (history + system + tools), after
 * reserving `maxOutputTokens` for the completion and a safety margin.
 */
export function getInputBudget(model: string, maxOutputTokens: number): number {
  const window = getContextWindow(model);
  const output = Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 8192;
  // Never let one absurdly large output setting starve the input budget.
  const effectiveOutput = Math.min(output, window * 0.5);
  const budget = Math.floor(window * INPUT_BUDGET_RATIO) - effectiveOutput;
  // Floor so we always keep some room, even on tiny custom models.
  return Math.max(budget, Math.floor(window * 0.25));
}
