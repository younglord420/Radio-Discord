import { spawn, type ChildProcess } from "node:child_process";
import type { Station } from "../types.js";
import { buildFfmpegArgs } from "./ffmpegArgs.js";
import { StationValidator, StreamUnavailableError } from "./StationValidator.js";
import type { StreamSource } from "./StreamSource.js";
import { logger } from "../utils/logger.js";

export class RadioStreamManager {
  constructor(
    private readonly validator: StationValidator,
    private readonly userAgent?: string,
  ) {}

  async open(station: Station): Promise<StreamSource> {
    const raw = station.url_resolved || station.url;
    if (!raw) {
      throw new StreamUnavailableError("Station has no stream URL");
    }
    const url = await this.validator.resolvePlaybackUrl(raw);
    return { url };
  }

  spawnFfmpeg(source: StreamSource, volume: number): ChildProcess {
    const args = buildFfmpegArgs(source.url, volume, this.userAgent);
    logger.debug({ args: args.map((a, i) => (i > 0 && args[i - 1] === "-i" ? "[url]" : a)) }, "Spawning FFmpeg");
    return spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  killProcess(proc: ChildProcess | null, signal: NodeJS.Signals = "SIGKILL"): void {
    if (!proc || proc.killed) {
      return;
    }
    try {
      proc.kill(signal);
    } catch (error) {
      logger.warn({ err: error }, "Failed to kill FFmpeg process");
    }
    if (proc.stdout) {
      proc.stdout.destroy();
    }
    if (proc.stderr) {
      proc.stderr.destroy();
    }
  }
}
