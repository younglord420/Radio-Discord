import { describe, expect, it } from "vitest";
import { FALLBACK_RADIO_BROWSER_SERVERS, orderServers } from "../src/radio/radioBrowserServers.js";

describe("Radio Browser server order", () => {
  it("puts the preferred host first and deduplicates fallbacks", () => {
    const ordered = orderServers("https://nl1.api.radio-browser.info/", [
      "https://at1.api.radio-browser.info",
      "https://nl1.api.radio-browser.info",
    ]);
    expect(ordered[0]).toBe("https://nl1.api.radio-browser.info");
    expect(ordered).toContain("https://at1.api.radio-browser.info");
    expect(new Set(ordered).size).toBe(ordered.length);
    for (const fallback of FALLBACK_RADIO_BROWSER_SERVERS) {
      expect(ordered).toContain(fallback);
    }
  });
});
