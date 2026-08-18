import type { RadioBrowserStation, Station } from "../types.js";

export function isPlayableStation(station: RadioBrowserStation): boolean {
  return (
    station.lastcheckok === 1 &&
    Boolean(station.url_resolved && station.url_resolved.trim()) &&
    Boolean(station.stationuuid && station.name)
  );
}

export function mapRadioBrowserStation(raw: RadioBrowserStation, now = Date.now()): Station | null {
  if (!raw.stationuuid || !raw.name) {
    return null;
  }

  let lastchecked: number | null = null;
  if (raw.lastchecktime_iso8601) {
    const parsed = Date.parse(raw.lastchecktime_iso8601);
    lastchecked = Number.isNaN(parsed) ? null : parsed;
  }

  return {
    stationuuid: raw.stationuuid,
    name: raw.name.trim(),
    country: raw.country?.trim() || null,
    countrycode: raw.countrycode?.trim() || null,
    language: raw.language?.trim() || null,
    tags: raw.tags?.trim() || null,
    homepage: raw.homepage?.trim() || null,
    favicon: raw.favicon?.trim() || null,
    url: raw.url?.trim() || null,
    url_resolved: raw.url_resolved?.trim() || null,
    codec: raw.codec?.trim() || null,
    bitrate: Number(raw.bitrate ?? 0) || 0,
    votes: Number(raw.votes ?? 0) || 0,
    lastcheckok: Number(raw.lastcheckok ?? 0) || 0,
    lastchecked,
    created_at: now,
    updated_at: now,
  };
}

export function rankStations(stations: Station[], query?: string): Station[] {
  const q = query?.trim().toLowerCase() ?? "";
  const scored = stations.map((station) => ({ station, score: scoreStation(station, q) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.station.votes !== a.station.votes) {
      return b.station.votes - a.station.votes;
    }
    return b.station.bitrate - a.station.bitrate;
  });
  return scored.map((s) => s.station);
}

export function scoreStation(station: Station, query: string): number {
  let score = 0;
  if (station.countrycode === "ID") {
    score += 1000;
  }
  const language = station.language?.toLowerCase() ?? "";
  if (language.includes("indonesian") || language.includes("indonesia")) {
    score += 300;
  }
  if (station.lastcheckok === 1) {
    score += 100;
  }
  if (station.url_resolved) {
    score += 50;
  }
  score += Math.min(station.votes, 500);
  score += Math.min(station.bitrate, 320) / 10;

  if (query) {
    const name = station.name.toLowerCase();
    const tags = station.tags?.toLowerCase() ?? "";
    if (name === query) {
      score += 800;
    } else if (name.startsWith(query)) {
      score += 400;
    } else if (name.includes(query)) {
      score += 200;
    }
    if (tags.includes(query)) {
      score += 80;
    }
  }

  return score;
}

export function filterPlayable(stations: Station[]): Station[] {
  return stations.filter(
    (s) => s.lastcheckok === 1 && Boolean(s.url_resolved && s.url_resolved.trim()),
  );
}

export function uniqueByUuid(stations: Station[]): Station[] {
  const seen = new Set<string>();
  const out: Station[] = [];
  for (const station of stations) {
    if (seen.has(station.stationuuid)) {
      continue;
    }
    seen.add(station.stationuuid);
    out.push(station);
  }
  return out;
}
