import { describe, expect, it } from "vitest";
import { RadioStreamManager } from "../src/radio/RadioStreamManager.js";
import { StationValidator } from "../src/radio/StationValidator.js";
import { buildFfmpegArgs } from "../src/radio/ffmpegArgs.js";

describe("stream manager abstraction", () => {
  it("builds a spawnable source without using a shell", () => {
    const manager = new RadioStreamManager(new StationValidator("test-agent"));
    const args = buildFfmpegArgs("https://example.com/live", 80);
    expect(args[0]).toBe("-hide_banner");
    expect(typeof manager.killProcess).toBe("function");
  });
});
