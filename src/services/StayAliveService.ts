import type { Client } from "discord.js";
import type { GuildRepository } from "../database/guilds.js";
import type { StationRepository } from "../database/stations.js";
import { logger } from "../utils/logger.js";
import type { RadioSessionManager } from "../radio/RadioSessionManager.js";

const STAGGER_MS = 1500;

export class StayAliveService {
  constructor(
    private readonly discord: Client,
    private readonly guilds: GuildRepository,
    private readonly stations: StationRepository,
    private readonly sessions: RadioSessionManager,
  ) {}

  async resumeAll(): Promise<void> {
    const rows = this.guilds.list247();
    logger.info({ count: rows.length }, "Resuming 24/7 radio sessions");

    for (const [index, settings] of rows.entries()) {
      await delay(index * STAGGER_MS);
      try {
        await this.resumeGuild(settings.guild_id);
      } catch (error) {
        logger.error({ err: error, guildId: settings.guild_id }, "Failed to resume 24/7 session");
      }
    }
  }

  async resumeGuild(guildId: string): Promise<boolean> {
    const settings = this.guilds.get(guildId);
    if (settings.stay_247 !== 1 || !settings.voice_channel_id || !settings.last_stationuuid) {
      return false;
    }

    const station = this.stations.findByUuid(settings.last_stationuuid);
    if (!station?.url_resolved) {
      logger.warn({ guildId }, "24/7 resume skipped: station missing");
      return false;
    }

    const guild = await this.discord.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return false;
    }

    const channel = await guild.channels.fetch(settings.voice_channel_id).catch(() => null);
    if (!channel || !channel.isVoiceBased()) {
      logger.warn({ guildId }, "24/7 resume skipped: voice channel missing");
      return false;
    }

    await this.sessions.play({
      guildId,
      channel,
      station,
      stay247: true,
      volume: settings.volume,
    });
    return true;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
