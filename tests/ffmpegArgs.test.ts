import { describe, expect, it } from "vitest";
import { buildFfmpegArgs } from "../src/radio/ffmpegArgs.js";

describe("FFmpeg command construction", () => {
  it("passes the URL as a single argv entry and never uses a shell string", () => {
    const url = "https://example.com/live?x=1&y=2";
    const args = buildFfmpegArgs(url, 80);
    expect(args.includes(url)).toBe(true);
    expect(args[args.indexOf("-i") + 1]).toBe(url);
    expect(args.every((part) => !part.includes("&&") && !part.includes("|"))).toBe(true);
    expect(args.includes("s16le")).toBe(true);
    expect(args.includes("pcm_s16le")).toBe(true);
    expect(args.includes("ogg")).toBe(false);
    expect(args.at(-1)).toBe("pipe:1");
  });

  it("clamps volume to 0-1 for the audio filter", () => {
    expect(buildFfmpegArgs("https://x", 150).includes("volume=1.00")).toBe(true);
    expect(buildFfmpegArgs("https://x", -5).includes("volume=0.00")).toBe(true);
    expect(buildFfmpegArgs("https://x", 50).includes("volume=0.50")).toBe(true);
  });
});
