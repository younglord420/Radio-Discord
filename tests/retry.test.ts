import { describe, expect, it } from "vitest";
import { nextBackoffMs, retryPolicy, shouldRetry } from "../src/radio/retry.js";

describe("retry logic", () => {
  it("uses 3s exponential backoff capped at 24s by default", () => {
    const policy = retryPolicy(false);
    expect(nextBackoffMs(0, policy)).toBe(3000);
    expect(nextBackoffMs(1, policy)).toBe(6000);
    expect(nextBackoffMs(2, policy)).toBe(12000);
    expect(nextBackoffMs(3, policy)).toBe(24000);
    expect(nextBackoffMs(8, policy)).toBe(24000);
  });

  it("stops after max retries unless 24/7", () => {
    const normal = retryPolicy(false);
    expect(shouldRetry(0, normal)).toBe(true);
    expect(shouldRetry(4, normal)).toBe(true);
    expect(shouldRetry(5, normal)).toBe(false);

    const stay = retryPolicy(true);
    expect(stay.unlimited).toBe(true);
    expect(shouldRetry(99, stay)).toBe(true);
    expect(nextBackoffMs(10, stay)).toBe(60_000);
  });
});
