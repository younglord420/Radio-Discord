export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_BASE_MS = 3000;
export const DEFAULT_CAP_MS = 24_000;
export const STAY_247_CAP_MS = 60_000;

export interface RetryPolicy {
  maxRetries: number;
  baseMs: number;
  capMs: number;
  unlimited: boolean;
}

export function retryPolicy(stay247: boolean): RetryPolicy {
  if (stay247) {
    return {
      maxRetries: Number.POSITIVE_INFINITY,
      baseMs: DEFAULT_BASE_MS,
      capMs: STAY_247_CAP_MS,
      unlimited: true,
    };
  }
  return {
    maxRetries: DEFAULT_MAX_RETRIES,
    baseMs: DEFAULT_BASE_MS,
    capMs: DEFAULT_CAP_MS,
    unlimited: false,
  };
}

export function nextBackoffMs(attempt: number, policy: RetryPolicy): number {
  const exp = Math.max(0, attempt);
  return Math.min(policy.baseMs * 2 ** exp, policy.capMs);
}

export function shouldRetry(attempt: number, policy: RetryPolicy): boolean {
  if (policy.unlimited) {
    return true;
  }
  return attempt < policy.maxRetries;
}
