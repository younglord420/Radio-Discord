import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/database/database.js";
import { StationRepository } from "../src/database/stations.js";
import { GuildRepository } from "../src/database/guilds.js";
import type { Station } from "../src/types.js";

function openTmp() {
  const file = path.join(os.tmpdir(), `radio-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  const db = createDatabase(file);
  return {
    db,
    close: () => {
      db.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        const p = file + suffix;
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
    },
  };
}

function sample(partial: Partial<Station> & Pick<Station, "stationuuid" | "name">): Station {
  const now = Date.now();
  return {
    country: "Indonesia",
    countrycode: "ID",
    language: "indonesian",
    tags: "pop",
    homepage: null,
    favicon: null,
    url: "https://example.com/raw",
    url_resolved: "https://example.com/stream",
    codec: "MP3",
    bitrate: 128,
    votes: 10,
    lastcheckok: 1,
    lastchecked: now,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

describe("database stations", () => {
  const handles: Array<{ close: () => void }> = [];
  afterEach(() => {
    while (handles.length) {
      handles.pop()?.close();
    }
  });

  it("upserts, searches, and lists popular Indonesian stations", () => {
    const handle = openTmp();
    handles.push(handle);
    const stations = new StationRepository(handle.db);

    stations.upsertMany([
      sample({ stationuuid: "1", name: "Prambors FM", votes: 100, bitrate: 128 }),
      sample({ stationuuid: "2", name: "Delta FM", votes: 50, bitrate: 320, tags: "jakarta,pop" }),
      sample({ stationuuid: "3", name: "Broken", lastcheckok: 0 }),
      sample({ stationuuid: "4", name: "BBC", countrycode: "GB", country: "UK", votes: 999 }),
    ]);

    stations.upsertMany([sample({ stationuuid: "1", name: "Prambors FM", votes: 200 })]);
    expect(stations.findByUuid("1")?.votes).toBe(200);

    const search = stations.search("prambors");
    expect(search[0]?.stationuuid).toBe("1");

    const jakarta = stations.search("jakarta");
    expect(jakarta.some((s) => s.stationuuid === "2")).toBe(true);

    const popular = stations.listPopular({ limit: 20, offset: 0 });
    expect(popular.map((s) => s.stationuuid)).toEqual(["1", "2"]);
    expect(stations.countPopular("ID")).toBe(2);
  });
});

describe("guild 24/7 settings", () => {
  it("persists stay_247, channel, last station, and lists resumable guilds", () => {
    const file = path.join(os.tmpdir(), `radio-g-${Date.now()}.db`);
    const db = createDatabase(file);
    try {
      const guilds = new GuildRepository(db);
      const created = guilds.get("g1");
      expect(created.stay_247).toBe(0);
      expect(created.volume).toBe(80);

      guilds.update("g1", {
        stay_247: 1,
        voice_channel_id: "vc1",
        last_stationuuid: "st1",
        volume: 40,
      });
      expect(guilds.list247()).toHaveLength(1);
      expect(guilds.list247()[0]?.last_stationuuid).toBe("st1");

      guilds.update("g1", { stay_247: 0 });
      expect(guilds.list247()).toHaveLength(0);
    } finally {
      db.close();
      fs.unlinkSync(file);
    }
  });
});
