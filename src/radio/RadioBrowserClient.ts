import { logger } from "../utils/logger.js";
import type { RadioBrowserStation, Station } from "../types.js";
import {
  discoverRadioBrowserServers,
  orderServers,
  stripTrailingSlash,
} from "./radioBrowserServers.js";
import {
  filterPlayable,
  isPlayableStation,
  mapRadioBrowserStation,
  rankStations,
  uniqueByUuid,
} from "./stationRanking.js";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const REQUEST_TIMEOUT_MS = 8_000;

export class RadioBrowserClient {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private servers: string[];
  private serversReady: Promise<void> | null = null;
  private workingBase: string | undefined;

  constructor(
    preferredBase: string,
    private readonly userAgent: string,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {
    this.servers = orderServers(stripTrailingSlash(preferredBase), []);
    this.workingBase = this.servers[0];
  }

  async search(query: string, limit = 25): Promise<Station[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const cacheKey = `search:${trimmed.toLowerCase()}:${limit}`;
    const cached = this.getCache<Station[]>(cacheKey);
    if (cached) {
      return cached;
    }

    logger.info({ query: trimmed }, "Searching Radio Browser");

    const indonesia = await this.searchStations({
      name: trimmed,
      countrycode: "ID",
      hidebroken: true,
      limit,
    });

    let merged = indonesia;
    if (merged.length < 5) {
      const worldwide = await this.searchStations({
        name: trimmed,
        hidebroken: true,
        limit,
      });
      merged = uniqueByUuid([...merged, ...worldwide]);
    }

    if (merged.length < 8) {
      const tagged = await this.searchStations({
        tag: trimmed,
        hidebroken: true,
        limit,
      });
      merged = uniqueByUuid([...merged, ...tagged]);
    }

    const ranked = rankStations(filterPlayable(merged), trimmed).slice(0, limit);
    if (ranked.length > 0) {
      this.setCache(cacheKey, ranked);
    }
    return ranked;
  }

  async listIndonesia(limit = 500): Promise<Station[]> {
    const cacheKey = `id:${limit}`;
    const cached = this.getCache<Station[]>(cacheKey);
    if (cached) {
      return cached;
    }

    logger.info({ limit }, "Fetching Indonesian stations from Radio Browser");
    const stations = await this.searchStations({
      countrycode: "ID",
      hidebroken: true,
      limit,
      order: "votes",
      reverse: true,
    });
    const playable = filterPlayable(stations);
    if (playable.length > 0) {
      this.setCache(cacheKey, playable, 30 * 60 * 1000);
    }
    return playable;
  }

  async byUuid(stationuuid: string): Promise<Station | undefined> {
    const cacheKey = `uuid:${stationuuid}`;
    const cached = this.getCache<Station | undefined>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const raw = await this.getJson<RadioBrowserStation[]>(
      `/json/stations/byuuid/${encodeURIComponent(stationuuid)}`,
    );
    const mapped = (raw ?? [])
      .map((row) => mapRadioBrowserStation(row))
      .find((row): row is Station => Boolean(row));
    if (mapped) {
      this.setCache(cacheKey, mapped, 10 * 60 * 1000);
    }
    return mapped;
  }

  private async searchStations(params: Record<string, string | number | boolean>): Promise<Station[]> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      qs.set(key, String(value));
    }
    const raw = await this.getJson<RadioBrowserStation[]>(`/json/stations/search?${qs.toString()}`);
    return (raw ?? [])
      .filter(isPlayableStation)
      .map((row) => mapRadioBrowserStation(row))
      .filter((row): row is Station => row !== null);
  }

  private async ensureServers(): Promise<void> {
    if (!this.serversReady) {
      this.serversReady = this.refreshServers();
    }
    await this.serversReady;
  }

  private async refreshServers(): Promise<void> {
    const preferred = this.servers[0];
    const discovered = await discoverRadioBrowserServers();
    this.servers = orderServers(this.workingBase ?? preferred, discovered);
    logger.info({ servers: this.servers }, "Radio Browser server list ready");
    await this.probeServers();
  }

  private async probeServers(): Promise<void> {
    for (const base of this.servers) {
      const ok = await this.ping(base);
      if (ok) {
        this.workingBase = base;
        logger.info({ base }, "Radio Browser mirror reachable");
        return;
      }
    }
    logger.error("No Radio Browser mirror reachable");
  }

  private async ping(base: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${base}/json/stats`, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getJson<T>(pathAndQuery: string): Promise<T | null> {
    await this.ensureServers();
    const bases = this.workingBase
      ? orderServers(this.workingBase, this.servers)
      : this.servers;

    for (const base of bases) {
      const url = `${base}${pathAndQuery}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          logger.warn({ url, status: res.status }, "Radio Browser request failed");
          continue;
        }
        const data = (await res.json()) as T;
        if (this.workingBase !== base) {
          logger.info({ base }, "Using Radio Browser mirror");
        }
        this.workingBase = base;
        return data;
      } catch (error) {
        logger.warn({ err: error, url }, "Radio Browser request error");
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  private getCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private setCache(key: string, value: unknown, ttlMs = this.ttlMs): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
