import type Database from "better-sqlite3";
import type { Station } from "../types.js";

export class StationRepository {
  constructor(private readonly db: Database.Database) {}

  findByUuid(stationuuid: string): Station | undefined {
    return this.db
      .prepare("SELECT * FROM stations WHERE stationuuid = ?")
      .get(stationuuid) as Station | undefined;
  }

  search(query: string, limit = 25): Station[] {
    const like = `%${escapeLike(query)}%`;
    return this.db
      .prepare(
        `SELECT * FROM stations
         WHERE lastcheckok = 1
           AND url_resolved IS NOT NULL
           AND url_resolved != ''
           AND (
             name LIKE ? ESCAPE '\\'
             OR IFNULL(tags, '') LIKE ? ESCAPE '\\'
             OR IFNULL(country, '') LIKE ? ESCAPE '\\'
             OR IFNULL(language, '') LIKE ? ESCAPE '\\'
           )
         ORDER BY
           CASE WHEN countrycode = 'ID' THEN 0 ELSE 1 END,
           CASE WHEN lower(IFNULL(language, '')) LIKE '%indonesian%' THEN 0 ELSE 1 END,
           votes DESC,
           bitrate DESC
         LIMIT ?`,
      )
      .all(like, like, like, like, limit) as Station[];
  }

  listPopular(options: { countrycode?: string; limit: number; offset: number }): Station[] {
    const country = options.countrycode ?? "ID";
    return this.db
      .prepare(
        `SELECT * FROM stations
         WHERE lastcheckok = 1
           AND url_resolved IS NOT NULL
           AND url_resolved != ''
           AND countrycode = ?
         ORDER BY votes DESC, bitrate DESC, lastcheckok DESC
         LIMIT ? OFFSET ?`,
      )
      .all(country, options.limit, options.offset) as Station[];
  }

  countAll(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM stations").get() as { n: number };
    return row.n;
  }

  countPopular(countrycode = "ID"): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM stations
         WHERE lastcheckok = 1
           AND url_resolved IS NOT NULL
           AND url_resolved != ''
           AND countrycode = ?`,
      )
      .get(countrycode) as { n: number };
    return row.n;
  }

  findByName(name: string): Station | undefined {
    return this.db
      .prepare(
        `SELECT * FROM stations
         WHERE lastcheckok = 1
           AND url_resolved IS NOT NULL
           AND lower(name) = lower(?)
         ORDER BY
           CASE WHEN countrycode = 'ID' THEN 0 ELSE 1 END,
           votes DESC
         LIMIT 1`,
      )
      .get(name) as Station | undefined;
  }

  findBestMatch(query: string): Station | undefined {
    const exact = this.findByName(query);
    if (exact) {
      return exact;
    }
    return this.search(query, 1)[0];
  }

  upsertMany(stations: Station[]): number {
    if (stations.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare(
      `INSERT INTO stations (
         stationuuid, name, country, countrycode, language, tags, homepage, favicon,
         url, url_resolved, codec, bitrate, votes, lastcheckok, lastchecked, created_at, updated_at
       ) VALUES (
         @stationuuid, @name, @country, @countrycode, @language, @tags, @homepage, @favicon,
         @url, @url_resolved, @codec, @bitrate, @votes, @lastcheckok, @lastchecked, @created_at, @updated_at
       )
       ON CONFLICT(stationuuid) DO UPDATE SET
         name = excluded.name,
         country = excluded.country,
         countrycode = excluded.countrycode,
         language = excluded.language,
         tags = excluded.tags,
         homepage = excluded.homepage,
         favicon = excluded.favicon,
         url = excluded.url,
         url_resolved = excluded.url_resolved,
         codec = excluded.codec,
         bitrate = excluded.bitrate,
         votes = excluded.votes,
         lastcheckok = excluded.lastcheckok,
         lastchecked = excluded.lastchecked,
         updated_at = excluded.updated_at`,
    );

    const tx = this.db.transaction((rows: Station[]) => {
      for (const row of rows) {
        stmt.run(row);
      }
    });
    tx(stations);
    return stations.length;
  }
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
