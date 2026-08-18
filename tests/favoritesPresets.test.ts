import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/database/database.js";
import { FavoriteLimitError, FavoriteRepository } from "../src/database/favorites.js";
import { InvalidPresetSlotError, PresetRepository, assertPresetSlot } from "../src/database/presets.js";
import { StationRepository } from "../src/database/stations.js";
import { MAX_FAVORITES } from "../src/types.js";
import type { Station } from "../src/types.js";

function sample(id: string, name: string): Station {
  const now = Date.now();
  return {
    stationuuid: id,
    name,
    country: "Indonesia",
    countrycode: "ID",
    language: "indonesian",
    tags: null,
    homepage: null,
    favicon: null,
    url: "https://example.com/raw",
    url_resolved: "https://example.com/stream",
    codec: "MP3",
    bitrate: 128,
    votes: 1,
    lastcheckok: 1,
    lastchecked: now,
    created_at: now,
    updated_at: now,
  };
}

describe("favorites", () => {
  it("adds unique favorites and enforces the cap of 25", () => {
    const file = path.join(os.tmpdir(), `fav-${Date.now()}.db`);
    const db = createDatabase(file);
    try {
      const stations = new StationRepository(db);
      const favs = new FavoriteRepository(db);
      const rows = Array.from({ length: MAX_FAVORITES }, (_, i) => sample(`u${i}`, `S${i}`));
      stations.upsertMany(rows);

      for (const row of rows) {
        favs.add("user1", row.stationuuid);
      }
      expect(favs.count("user1")).toBe(MAX_FAVORITES);
      favs.add("user1", "u0");
      expect(favs.count("user1")).toBe(MAX_FAVORITES);
      expect(() => favs.add("user1", "overflow")).toThrow(FavoriteLimitError);

      expect(favs.remove("user1", "u0")).toBe(true);
      expect(favs.count("user1")).toBe(MAX_FAVORITES - 1);
      expect(favs.list("user1")[0]?.station?.name).toBeDefined();
    } finally {
      db.close();
      fs.unlinkSync(file);
    }
  });
});

describe("presets", () => {
  it("allows slots 1-5 only and stores per guild", () => {
    expect(() => assertPresetSlot(0)).toThrow(InvalidPresetSlotError);
    expect(() => assertPresetSlot(6)).toThrow(InvalidPresetSlotError);

    const file = path.join(os.tmpdir(), `pre-${Date.now()}.db`);
    const db = createDatabase(file);
    try {
      const stations = new StationRepository(db);
      stations.upsertMany([sample("a", "Prambors FM")]);
      const presets = new PresetRepository(db);
      presets.set("guildA", 1, "a", "Prambors FM");
      presets.set("guildB", 1, "a", "Other");
      expect(presets.list("guildA")).toHaveLength(1);
      expect(presets.get("guildA", 1)?.name_snapshot).toBe("Prambors FM");
      expect(presets.clear("guildA", 1)).toBe(true);
      expect(presets.list("guildA")).toHaveLength(0);
      expect(presets.list("guildB")).toHaveLength(1);
      expect(() => presets.set("guildA", 9, "a", "x")).toThrow(InvalidPresetSlotError);
    } finally {
      db.close();
      fs.unlinkSync(file);
    }
  });
});
