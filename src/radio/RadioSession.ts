import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
} from "@discordjs/voice";
import type { ChildProcess } from "node:child_process";
import type { Station } from "../types.js";
import { logger } from "../utils/logger.js";
import { MetadataParser } from "./MetadataParser.js";
import { RadioStreamManager } from "./RadioStreamManager.js";
import { nextBackoffMs, retryPolicy, shouldRetry, type RetryPolicy } from "./retry.js";
import type { StreamSource } from "./StreamSource.js";

export interface RadioSessionOptions {
  guildId: string;
  voiceChannelId: string;
  station: Station;
  connection: VoiceConnection;
  volume: number;
  stay247: boolean;
  streamManager: RadioStreamManager;
  metadataParser: MetadataParser;
  onFatal?: (session: RadioSession) => void;
}

export class RadioSession {
  readonly guildId: string;
  voiceChannelId: string;
  station: Station;
  readonly audioPlayer: AudioPlayer;
  connection: VoiceConnection;
  ffmpegProcess: ChildProcess | null = null;
  volume: number;
  startedAt: number;
  streamTitle: string | null = null;
  stay247: boolean;

  private generation = 0;
  private retryCount = 0;
  private destroyed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private metadataTimer: NodeJS.Timeout | null = null;
  private currentSource: StreamSource | null = null;
  private readonly streamManager: RadioStreamManager;
  private readonly metadataParser: MetadataParser;
  private readonly onFatal?: (session: RadioSession) => void;
  private policy: RetryPolicy;

  constructor(options: RadioSessionOptions) {
    this.guildId = options.guildId;
    this.voiceChannelId = options.voiceChannelId;
    this.station = options.station;
    this.connection = options.connection;
    this.volume = options.volume;
    this.stay247 = options.stay247;
    this.streamManager = options.streamManager;
    this.metadataParser = options.metadataParser;
    this.onFatal = options.onFatal;
    this.startedAt = Date.now();
    this.policy = retryPolicy(options.stay247);

    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.connection.subscribe(this.audioPlayer);

    this.audioPlayer.on("error", (error) => {
      logger.warn({ err: error, guildId: this.guildId }, "Audio player error");
      void this.handleDisconnect("player-error");
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, () => {
      void this.handleVoiceDisconnect();
    });
  }

  async start(): Promise<void> {
    if (this.destroyed) {
      throw new Error("Session already destroyed");
    }
    this.retryCount = 0;
    this.startedAt = Date.now();
    await this.waitForVoice();
    await this.startPipeline();
    this.startMetadataPolling();
  }

  async changeStation(station: Station, voiceChannelId: string): Promise<void> {
    this.station = station;
    this.voiceChannelId = voiceChannelId;
    this.streamTitle = null;
    this.retryCount = 0;
    this.startedAt = Date.now();
    await this.waitForVoice();
    await this.startPipeline();
  }

  setStay247(enabled: boolean): void {
    this.stay247 = enabled;
    this.policy = retryPolicy(enabled);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, Math.round(volume)));
    void this.startPipeline();
  }

  pause(): boolean {
    return this.audioPlayer.pause(true);
  }

  resume(): boolean {
    return this.audioPlayer.unpause();
  }

  async destroy(options?: { leave?: boolean }): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.clearTimers();
    this.generation += 1;
    this.killFfmpeg();
    try {
      this.audioPlayer.stop(true);
    } catch {
      // ignore
    }
    if (options?.leave !== false) {
      try {
        this.connection.destroy();
      } catch {
        // ignore
      }
    }
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  private async waitForVoice(): Promise<void> {
    if (this.connection.state.status === VoiceConnectionStatus.Ready) {
      return;
    }
    logger.info(
      { guildId: this.guildId, status: this.connection.state.status },
      "Waiting for voice connection",
    );
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (error) {
      logger.warn(
        { err: error, guildId: this.guildId, status: this.connection.state.status },
        "Voice connection was not ready in time",
      );
      throw new Error(
        "Could not connect to the voice channel. Leave and rejoin voice, then press Play again.",
      );
    }
  }

  private async startPipeline(): Promise<void> {
    const generation = ++this.generation;
    this.killFfmpeg();

    const source = await this.streamManager.open(this.station);
    if (generation !== this.generation || this.destroyed) {
      return;
    }
    this.currentSource = source;

    const proc = this.streamManager.spawnFfmpeg(source, this.volume);
    this.ffmpegProcess = proc;

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        logger.warn({ guildId: this.guildId, ffmpeg: text.slice(0, 500) }, "FFmpeg stderr");
      }
    });

    proc.once("exit", (code, signal) => {
      logger.warn({ guildId: this.guildId, code, signal, generation }, "FFmpeg exited");
      if (generation !== this.generation || this.destroyed) {
        return;
      }
      void this.handleDisconnect("ffmpeg-exit");
    });

    if (!proc.stdout) {
      throw new Error("FFmpeg stdout is missing");
    }

    const resource = createAudioResource(proc.stdout, {
      inputType: StreamType.Raw,
      metadata: { station: this.station.name },
    });
    this.audioPlayer.play(resource);

    try {
      await entersState(this.audioPlayer, AudioPlayerStatus.Playing, 15_000);
      this.retryCount = 0;
      logger.info(
        { guildId: this.guildId, station: this.station.name },
        "Starting station",
      );
    } catch (error) {
      logger.warn({ err: error, guildId: this.guildId }, "Player did not enter Playing state");
      if (generation !== this.generation || this.destroyed) {
        return;
      }
      void this.handleDisconnect("play-timeout");
    }
  }

  private async handleDisconnect(reason: string): Promise<void> {
    if (this.destroyed) {
      return;
    }
    logger.warn({ guildId: this.guildId, reason }, "Stream disconnected");
    this.generation += 1;
    this.killFfmpeg();

    if (!shouldRetry(this.retryCount, this.policy)) {
      logger.error({ guildId: this.guildId }, "FFmpeg exited");
      this.onFatal?.(this);
      return;
    }

    const delay = nextBackoffMs(this.retryCount, this.policy);
    this.retryCount += 1;
    logger.info({ guildId: this.guildId, delay, attempt: this.retryCount }, "Reconnecting stream");

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.startPipeline().catch((error: unknown) => {
        logger.error({ err: error, guildId: this.guildId }, "Reconnect failed");
        void this.handleDisconnect("reconnect-error");
      });
    }, delay);
  }

  private async handleVoiceDisconnect(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    if (!this.stay247) {
      this.onFatal?.(this);
      return;
    }
    try {
      await Promise.race([
        entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
    } catch {
      logger.warn({ guildId: this.guildId }, "Voice reconnect failed");
      this.onFatal?.(this);
    }
  }

  private startMetadataPolling(): void {
    this.clearMetadataTimer();
    const tick = async () => {
      if (this.destroyed) {
        return;
      }
      const url = this.currentSource?.url ?? this.station.url_resolved ?? this.station.url;
      if (!url) {
        return;
      }
      const title = await this.metadataParser.fetchIcyTitle(url);
      if (title && title !== this.streamTitle) {
        this.streamTitle = title;
        logger.debug({ guildId: this.guildId, title }, "ICY title updated");
      }
    };
    void tick();
    this.metadataTimer = setInterval(() => {
      void tick();
    }, 15_000);
  }

  private killFfmpeg(): void {
    this.streamManager.killProcess(this.ffmpegProcess);
    this.ffmpegProcess = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearMetadataTimer(): void {
    if (this.metadataTimer) {
      clearInterval(this.metadataTimer);
      this.metadataTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearReconnectTimer();
    this.clearMetadataTimer();
  }
}
