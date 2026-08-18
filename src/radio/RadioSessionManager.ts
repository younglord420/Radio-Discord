import {
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { GuildRepository } from "../database/guilds.js";
import { logger } from "../utils/logger.js";
import type { Station } from "../types.js";
import { MetadataParser } from "./MetadataParser.js";
import { RadioSession } from "./RadioSession.js";
import { RadioStreamManager } from "./RadioStreamManager.js";
import { SessionRegistry } from "./SessionRegistry.js";

const PLAY_DEBOUNCE_MS = 1000;

export interface PlayRequest {
  guildId: string;
  channel: VoiceBasedChannel;
  station: Station;
  stay247?: boolean;
  volume?: number;
}

export class RadioSessionManager {
  private readonly registry = new SessionRegistry<RadioSession>();
  private readonly lastPlay = new Map<string, number>();

  constructor(
    private readonly streamManager: RadioStreamManager,
    private readonly metadataParser: MetadataParser,
    private readonly guilds: GuildRepository,
  ) {}

  get(guildId: string): RadioSession | undefined {
    return this.registry.get(guildId);
  }

  canPlayNow(guildId: string): boolean {
    const last = this.lastPlay.get(guildId) ?? 0;
    return Date.now() - last >= PLAY_DEBOUNCE_MS;
  }

  async play(request: PlayRequest): Promise<RadioSession> {
    if (!this.canPlayNow(request.guildId)) {
      throw new Error("Please wait a moment before changing stations.");
    }
    this.lastPlay.set(request.guildId, Date.now());

    const existing = this.registry.get(request.guildId);
    const settings = this.guilds.get(request.guildId);
    const volume = request.volume ?? settings.volume;
    const stay247 = request.stay247 ?? settings.stay_247 === 1;

    if (existing && !existing.isDestroyed() && existing.connection.state.status === VoiceConnectionStatus.Ready) {
      existing.setStay247(stay247);
      existing.volume = volume;
      await existing.changeStation(request.station, request.channel.id);
      this.guilds.setPlayback(request.guildId, request.channel.id, request.station.stationuuid);
      return existing;
    }

    if (existing) {
      await existing.destroy({ leave: true }).catch(() => undefined);
      this.registry.delete(request.guildId);
    }

    const connection = this.join(request.channel);
    const session = new RadioSession({
      guildId: request.guildId,
      voiceChannelId: request.channel.id,
      station: request.station,
      connection,
      volume,
      stay247,
      streamManager: this.streamManager,
      metadataParser: this.metadataParser,
      onFatal: (s) => {
        void this.handleFatal(s);
      },
    });

    this.registry.set(request.guildId, session);
    try {
      await session.start();
    } catch (error) {
      await session.destroy({ leave: true }).catch(() => undefined);
      this.registry.delete(request.guildId);
      throw error;
    }
    this.guilds.setPlayback(request.guildId, request.channel.id, request.station.stationuuid);
    logger.info({ guildId: request.guildId, channelId: request.channel.id }, "Guild connected");
    return session;
  }

  async stop(guildId: string, options?: { leave?: boolean }): Promise<boolean> {
    const session = this.registry.get(guildId);
    if (!session) {
      return false;
    }
    const settings = this.guilds.get(guildId);
    const leave = options?.leave ?? settings.stay_247 !== 1;
    await session.destroy({ leave });
    if (leave) {
      this.registry.delete(guildId);
    }
    return true;
  }

  async disconnect(guildId: string): Promise<boolean> {
    const session = this.registry.get(guildId);
    if (!session) {
      return false;
    }
    await session.destroy({ leave: true });
    this.registry.delete(guildId);
    return true;
  }

  async destroyAll(): Promise<void> {
    const sessions = [...this.registry.values()];
    this.registry.clear();
    await Promise.all(sessions.map((s) => s.destroy({ leave: true })));
  }

  private join(channel: VoiceBasedChannel): VoiceConnection {
    const stale = getVoiceConnection(channel.guild.id);
    if (stale) {
      try {
        stale.destroy();
      } catch {
        // ignore
      }
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on("stateChange", (oldState, newState) => {
      if (oldState.status !== newState.status) {
        logger.info(
          { guildId: channel.guild.id, from: oldState.status, to: newState.status },
          "Voice connection state",
        );
      }
    });
    connection.on("error", (error) => {
      logger.warn({ err: error, guildId: channel.guild.id }, "Voice connection error");
    });
    return connection;
  }

  private async handleFatal(session: RadioSession): Promise<void> {
    logger.error({ guildId: session.guildId }, "Session ended");
    const settings = this.guilds.get(session.guildId);
    if (settings.stay_247 === 1) {
      return;
    }
    await session.destroy({ leave: true });
    this.registry.delete(session.guildId);
  }
}
