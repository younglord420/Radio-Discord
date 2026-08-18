import type Database from "better-sqlite3";
import type { GuildSettings } from "../types.js";

const DEFAULT_VOLUME = 80;

export class GuildRepository {
  constructor(private readonly db: Database.Database) {}

  get(guildId: string): GuildSettings {
    const row = this.db
      .prepare("SELECT * FROM guild_settings WHERE guild_id = ?")
      .get(guildId) as GuildSettings | undefined;
    if (row) {
      return row;
    }
    const created: GuildSettings = {
      guild_id: guildId,
      stay_247: 0,
      voice_channel_id: null,
      last_stationuuid: null,
      volume: DEFAULT_VOLUME,
    };
    this.db
      .prepare(
        `INSERT INTO guild_settings (guild_id, stay_247, voice_channel_id, last_stationuuid, volume)
         VALUES (@guild_id, @stay_247, @voice_channel_id, @last_stationuuid, @volume)`,
      )
      .run(created);
    return created;
  }

  update(guildId: string, patch: Partial<Omit<GuildSettings, "guild_id">>): GuildSettings {
    const current = this.get(guildId);
    const next: GuildSettings = {
      ...current,
      ...patch,
      guild_id: guildId,
    };
    this.db
      .prepare(
        `UPDATE guild_settings
         SET stay_247 = @stay_247,
             voice_channel_id = @voice_channel_id,
             last_stationuuid = @last_stationuuid,
             volume = @volume
         WHERE guild_id = @guild_id`,
      )
      .run(next);
    return next;
  }

  list247(): GuildSettings[] {
    return this.db
      .prepare(
        `SELECT * FROM guild_settings
         WHERE stay_247 = 1
           AND voice_channel_id IS NOT NULL
           AND last_stationuuid IS NOT NULL`,
      )
      .all() as GuildSettings[];
  }

  setPlayback(guildId: string, voiceChannelId: string, stationuuid: string): void {
    this.get(guildId);
    this.update(guildId, {
      voice_channel_id: voiceChannelId,
      last_stationuuid: stationuuid,
    });
  }
}
