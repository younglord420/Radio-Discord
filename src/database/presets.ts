import type Database from "better-sqlite3";
import type { GuildPreset, Station } from "../types.js";
import { PRESET_SLOTS } from "../types.js";

export class InvalidPresetSlotError extends Error {
  override readonly name = "InvalidPresetSlotError";
  constructor(slot: number) {
    super(`Preset slot must be 1-5 (got ${slot})`);
  }
}

export function assertPresetSlot(slot: number): void {
  if (!PRESET_SLOTS.includes(slot as (typeof PRESET_SLOTS)[number])) {
    throw new InvalidPresetSlotError(slot);
  }
}

export class PresetRepository {
  constructor(private readonly db: Database.Database) {}

  list(guildId: string): Array<GuildPreset & { station?: Station }> {
    const rows = this.db
      .prepare(
        `SELECT p.guild_id, p.slot, p.stationuuid, p.name_snapshot,
                s.name, s.country, s.countrycode, s.language, s.tags, s.homepage,
                s.favicon, s.url, s.url_resolved, s.codec, s.bitrate, s.votes,
                s.lastcheckok, s.lastchecked, s.created_at, s.updated_at, s.id
         FROM guild_presets p
         LEFT JOIN stations s ON s.stationuuid = p.stationuuid
         WHERE p.guild_id = ?
         ORDER BY p.slot ASC`,
      )
      .all(guildId) as Record<string, unknown>[];
    return rows.map((row) => {
        const preset: GuildPreset = {
          guild_id: String(row.guild_id),
          slot: Number(row.slot),
          stationuuid: String(row.stationuuid),
          name_snapshot: (row.name_snapshot as string | null) ?? null,
        };
        if (!row.name) {
          return preset;
        }
        return {
          ...preset,
          station: {
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
            created_at: Number(row.created_at ?? 0),
            updated_at: Number(row.updated_at ?? 0),
          } satisfies Station,
        };
      });
  }

  get(guildId: string, slot: number): (GuildPreset & { station?: Station }) | undefined {
    assertPresetSlot(slot);
    return this.list(guildId).find((p) => p.slot === slot);
  }

  set(guildId: string, slot: number, stationuuid: string, nameSnapshot: string): void {
    assertPresetSlot(slot);
    this.db
      .prepare(
        `INSERT INTO guild_presets (guild_id, slot, stationuuid, name_snapshot)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, slot) DO UPDATE SET
           stationuuid = excluded.stationuuid,
           name_snapshot = excluded.name_snapshot`,
      )
      .run(guildId, slot, stationuuid, nameSnapshot);
  }

  clear(guildId: string, slot: number): boolean {
    assertPresetSlot(slot);
    const result = this.db
      .prepare("DELETE FROM guild_presets WHERE guild_id = ? AND slot = ?")
      .run(guildId, slot);
    return result.changes > 0;
  }
}
