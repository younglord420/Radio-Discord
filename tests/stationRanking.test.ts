import { describe, expect, it } from "vitest";
import type { RadioBrowserStation, Station } from "../src/types.js";
import {
  filterPlayable,
  isPlayableStation,
  mapRadioBrowserStation,
  rankStations,
  scoreStation,
  uniqueByUuid,
} from "../src/radio/stationRanking.js";

function station(partial: Partial<Station> & Pick<Station, "stationuuid" | "name">): Station {
  return {
    country: null,
    countrycode: null,
    language: null,
    tags: null,
    homepage: null,
    favicon: null,
    url: null,
    url_resolved: "https://example.com/stream",
    codec: "MP3",
    bitrate: 128,
    votes: 0,
    lastcheckok: 1,
    lastchecked: null,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("Radio Browser mapping", () => {
  it("maps API rows and drops nameless stations", () => {
    const raw: RadioBrowserStation = {
      stationuuid: "abc",
      name: " Prambors FM ",
      country: "Indonesia",
      countrycode: "ID",
      language: "indonesian",
      tags: "pop,hits",
      url: "http://example.com/x",
      url_resolved: "https://example.com/stream",
      codec: "MP3",
      bitrate: 128,
      votes: 42,
      lastcheckok: 1,
      lastchecktime_iso8601: "2024-01-01T00:00:00Z",
    };
    const mapped = mapRadioBrowserStation(raw, 1);
    expect(mapped?.name).toBe("Prambors FM");
    expect(mapped?.countrycode).toBe("ID");
    expect(mapped?.votes).toBe(42);
    expect(mapRadioBrowserStation({ name: "x" })).toBeNull();
  });

  it("filters broken stations and missing url_resolved", () => {
    expect(isPlayableStation({ stationuuid: "1", name: "A", lastcheckok: 1, url_resolved: "https://x" })).toBe(true);
    expect(isPlayableStation({ stationuuid: "1", name: "A", lastcheckok: 0, url_resolved: "https://x" })).toBe(false);
    expect(isPlayableStation({ stationuuid: "1", name: "A", lastcheckok: 1, url_resolved: "" })).toBe(false);

    const playable = filterPlayable([
      station({ stationuuid: "ok", name: "OK" }),
      station({ stationuuid: "bad", name: "Bad", lastcheckok: 0 }),
      station({ stationuuid: "nourl", name: "No", url_resolved: null }),
    ]);
    expect(playable.map((s) => s.stationuuid)).toEqual(["ok"]);
  });
});

describe("search ranking", () => {
  it("prioritizes Indonesian stations, then votes and bitrate", () => {
    const ranked = rankStations(
      [
        station({ stationuuid: "us", name: "Rock US", countrycode: "US", tags: "rock", votes: 999, bitrate: 320 }),
        station({
          stationuuid: "id",
          name: "Rock Jakarta",
          countrycode: "ID",
          language: "indonesian",
          tags: "rock",
          votes: 10,
          bitrate: 64,
        }),
      ],
      "rock",
    );
    expect(ranked[0].stationuuid).toBe("id");
  });

  it("boosts exact and prefix name matches", () => {
    const ranked = rankStations(
      [
        station({ stationuuid: "a", name: "Prambors Alternative", countrycode: "ID", votes: 50 }),
        station({ stationuuid: "b", name: "Prambors FM", countrycode: "ID", votes: 10 }),
      ],
      "prambors fm",
    );
    expect(ranked[0].stationuuid).toBe("b");
    expect(scoreStation(ranked[0], "prambors fm")).toBeGreaterThan(scoreStation(ranked[1], "prambors fm"));
  });

  it("deduplicates by uuid", () => {
    const a = station({ stationuuid: "1", name: "A" });
    expect(uniqueByUuid([a, { ...a, name: "A2" }])).toHaveLength(1);
  });
});
