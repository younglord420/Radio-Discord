import type Database from "better-sqlite3";
import { MAX_FAVORITES, type Station, type UserFavorite } from "../types.js";

export class FavoriteLimitError extends Error {
  override readonly name = "FavoriteLimitError";
  constructor() {
    super(`Favorite list is full (max ${MAX_FAVORITES})`);
  }
}

export class FavoriteRepository {
  constructor(private readonly db: Database.Database) {}

  list(userId: string): Array<UserFavorite & { station?: Station }> {
    const rows = this.db
      .prepare(
        `SELECT f.user_id, f.stationuuid, f.created_at,
                s.id, s.name, s.country, s.countrycode, s.language, s.tags,
                s.homepage, s.favicon, s.url, s.url_resolved, s.codec, s.bitrate,
                s.votes, s.lastcheckok, s.lastchecked, s.created_at AS station_created_at,
                s.updated_at
         FROM user_favorites f
         LEFT JOIN stations s ON s.stationuuid = f.stationuuid
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC`,
      )
      .all(userId) as Record<string, unknown>[];
    return rows.map((row) => {
        const favorite: UserFavorite = {
          user_id: String(row.user_id),
          stationuuid: String(row.stationuuid),
          created_at: Number(row.created_at),
        };
        if (!row.name) {
          return favorite;
        }
        const station: Station = {
          id: row.id as number | undefined,
          stationuuid: String(row.stationuuid),
          name: String(row.name),
          country: (row.country as string | null) ?? null,
          countrycode: (row.countrycode as string | null) ?? null,
          language: (row.language as string | null) ?? null,
          tags: (row.tags as string | null) ?? null,
          homepage: (row.homepage as string | null) ?? null,
          favicon: (row.favicon as string | null) ?? null,
          url: (row.url as string | null) ?? null,
          url_resolved: (row.url_resolved as string | null) ?? null,
          codec: (row.codec as string | null) ?? null,
          bitrate: Number(row.bitrate ?? 0),
          votes: Number(row.votes ?? 0),
          lastcheckok: Number(row.lastcheckok ?? 0),
          lastchecked: (row.lastchecked as number | null) ?? null,
          created_at: Number(row.station_created_at ?? 0),
          updated_at: Number(row.updated_at ?? 0),
        };
        return { ...favorite, station };
      });
  }

  count(userId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM user_favorites WHERE user_id = ?")
      .get(userId) as { n: number };
    return row.n;
  }

  has(userId: string, stationuuid: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 AS ok FROM user_favorites WHERE user_id = ? AND stationuuid = ?",
      )
      .get(userId, stationuuid) as { ok: number } | undefined;
    return Boolean(row);
  }

  add(userId: string, stationuuid: string): void {
    if (this.has(userId, stationuuid)) {
      return;
    }
    if (this.count(userId) >= MAX_FAVORITES) {
      throw new FavoriteLimitError();
    }
    this.db
      .prepare(
        "INSERT INTO user_favorites (user_id, stationuuid, created_at) VALUES (?, ?, ?)",
      )
      .run(userId, stationuuid, Date.now());
  }

  remove(userId: string, stationuuid: string): boolean {
    const result = this.db
      .prepare("DELETE FROM user_favorites WHERE user_id = ? AND stationuuid = ?")
      .run(userId, stationuuid);
    return result.changes > 0;
  }
}
