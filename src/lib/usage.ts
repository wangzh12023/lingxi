import type { ModelCall } from "./types"

/**
 * One logical call that took two attempts (e.g. JSON mode rejected, retried without it): every
 * count is the sum of both attempts — total, input, output and cached alike — so that billing by
 * category and the total shown in the console always agree. `ok` follows the final attempt.
 */
export function combineCalls(first: ModelCall, second: ModelCall): ModelCall {
  const add = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0))
  return {
    ...second,
    attempts: (first.attempts ?? 1) + (second.attempts ?? 1),
    ms: first.ms + second.ms,
    tokens: first.tokens + second.tokens,
    promptTokens: add(first.promptTokens, second.promptTokens),
    completionTokens: add(first.completionTokens, second.completionTokens),
    cachedTokens: add(first.cachedTokens, second.cachedTokens),
  }
}

/** Price one call (元) from its token split; cached input is billed at the cached rate when the provider reports it. */
export function costOf(call: ModelCall, price: { input: number; output: number; cached?: number }) {
  const cached = call.cachedTokens ?? 0
  const input = (call.promptTokens ?? call.tokens) - cached
  const output = call.completionTokens ?? 0
  return (input * price.input + cached * (price.cached ?? price.input) + output * price.output) / 1e6
}
