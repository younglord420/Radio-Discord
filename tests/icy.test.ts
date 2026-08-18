import { describe, expect, it } from "vitest";
import { parseIcyMetadataBlock } from "../src/radio/MetadataParser.js";

describe("ICY metadata", () => {
  it("extracts StreamTitle", () => {
    expect(parseIcyMetadataBlock("StreamTitle='Artist - Song';StreamUrl='';")).toBe("Artist - Song");
  });

  it("returns null when missing or empty", () => {
    expect(parseIcyMetadataBlock("StreamUrl='http://x';")).toBeNull();
    expect(parseIcyMetadataBlock("StreamTitle='';")).toBeNull();
  });
});
