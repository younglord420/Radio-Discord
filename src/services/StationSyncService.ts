import type { StationRepository } from "../database/stations.js";
import { getMeta, setMeta } from "../database/database.js";
import { logger } from "../utils/logger.js";
import type { RadioBrowserClient } from "../radio/RadioBrowserClient.js";

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MIN_SYNC_GAP_MS = 3 * 60 * 60 * 1000;

export class StationSyncService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: RadioBrowserClient,
    private readonly stations: StationRepository,
  ) {}

  start(): void {
    void this.syncIfDue();
    this.timer = setInterval(() => {
      void this.syncIfDue();
    }, SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncIfDue(force = false): Promise<number> {
    if (!force && this.stations.countAll() === 0) {
      force = true;
    }
    const last = Number(getMeta("stations_last_synced_at") ?? 0);
    if (!force && last && Date.now() - last < MIN_SYNC_GAP_MS) {
      logger.debug("Skipping station sync; recently synced");
      return 0;
    }
    return this.sync();
  }

  async sync(): Promise<number> {
    try {
      const stations = await this.client.listIndonesia(800);
      if (stations.length === 0) {
        logger.warn("Station sync returned 0 stations; will retry later");
        return 0;
      }
      const count = this.stations.upsertMany(stations);
      setMeta("stations_last_synced_at", String(Date.now()));
      logger.info({ count }, "Station catalog synced");
      return count;
    } catch (error) {
      logger.error({ err: error }, "Station sync failed");
      return 0;
    }
  }
}
