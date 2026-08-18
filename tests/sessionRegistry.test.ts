import { describe, expect, it } from "vitest";
import { SessionRegistry } from "../src/radio/SessionRegistry.js";

describe("session registry", () => {
  it("keeps guild sessions isolated", () => {
    const registry = new SessionRegistry<{ id: string; ffmpeg: string }>();
    registry.set("A", { id: "A", ffmpeg: "proc-a" });
    registry.set("B", { id: "B", ffmpeg: "proc-b" });

    expect(registry.get("A")?.ffmpeg).toBe("proc-a");
    expect(registry.get("B")?.ffmpeg).toBe("proc-b");
    expect(registry.size).toBe(2);

    registry.set("A", { id: "A", ffmpeg: "proc-a-replacement" });
    expect(registry.get("A")?.ffmpeg).toBe("proc-a-replacement");
    expect(registry.get("B")?.ffmpeg).toBe("proc-b");

    registry.delete("A");
    expect(registry.get("A")).toBeUndefined();
    expect(registry.get("B")?.id).toBe("B");
  });
});
