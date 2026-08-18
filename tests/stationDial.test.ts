import { describe, expect, it } from "vitest";
import { nextInDial, uniqueIds } from "../src/radio/stationDial.js";

describe("station dial", () => {
  it("deduplicates ids", () => {
    expect(uniqueIds(["a", "b", "a", "", "c"])).toEqual(["a", "b", "c"]);
  });

  it("cycles next and prev and wraps around", () => {
    const ids = ["a", "b", "c"];
    expect(nextInDial(ids, "a", 1)).toBe("b");
    expect(nextInDial(ids, "c", 1)).toBe("a");
    expect(nextInDial(ids, "a", -1)).toBe("c");
    expect(nextInDial(ids, "b", -1)).toBe("a");
  });

  it("starts at first/last when current is not in the dial", () => {
    expect(nextInDial(["a", "b"], "zzz", 1)).toBe("a");
    expect(nextInDial(["a", "b"], "zzz", -1)).toBe("b");
  });

  it("returns the only station when the dial has one entry", () => {
    expect(nextInDial(["only"], "only", 1)).toBe("only");
    expect(nextInDial([], "x", 1)).toBeUndefined();
  });
});
