import dns from "node:dns";
import { openDatabase, closeDatabase, getDatabase } from "./database/database.js";
import { FavoriteRepository } from "./database/favorites.js";
import { GuildRepository } from "./database/guilds.js";
import { PresetRepository } from "./database/presets.js";
import { StationRepository } from "./database/stations.js";
import { createBotClient, registerBotEvents } from "./bot/client.js";
import { logVoiceDependencies } from "./bot/voiceSetup.js";
import type { BotContext } from "./bot/context.js";
import { MetadataParser } from "./radio/MetadataParser.js";
import { RadioBrowserClient } from "./radio/RadioBrowserClient.js";
import { RadioSessionManager } from "./radio/RadioSessionManager.js";
import { RadioStreamManager } from "./radio/RadioStreamManager.js";
import { StationDialStore } from "./radio/stationDial.js";
import { StationValidator } from "./radio/StationValidator.js";
import { StationSyncService } from "./services/StationSyncService.js";
import { StayAliveService } from "./services/StayAliveService.js";
import { loadConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  dns.setDefaultResultOrder("ipv4first");
  logVoiceDependencies();
  const config = loadConfig();
  openDatabase(config.databaseUrl);
  const db = getDatabase();

  const stations = new StationRepository(db);
  const guilds = new GuildRepository(db);
  const favorites = new FavoriteRepository(db);
  const presets = new PresetRepository(db);

  const radioBrowser = new RadioBrowserClient(config.radioBrowserApi, config.radioBrowserUserAgent);
  const validator = new StationValidator(config.radioBrowserUserAgent);
  const streamManager = new RadioStreamManager(validator, config.radioBrowserUserAgent);
  const metadataParser = new MetadataParser(config.radioBrowserUserAgent);
  const sync = new StationSyncService(radioBrowser, stations);

  const client = createBotClient();
  const sessions = new RadioSessionManager(streamManager, metadataParser, guilds);
  const stayAlive = new StayAliveService(client, guilds, stations, sessions);
  const dials = new StationDialStore();

  const ctx: BotContext = {
    client,
    stations,
    guilds,
    favorites,
    presets,
    radioBrowser,
    sessions,
    sync,
    stayAlive,
    dials,
  };

  registerBotEvents(client, ctx);
  sync.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    sync.stop();
    try {
      await sessions.destroyAll();
    } catch (error) {
      logger.error({ err: error }, "Error while stopping sessions");
    }
    try {
      client.destroy();
    } catch (error) {
      logger.error({ err: error }, "Error while destroying Discord client");
    }
    closeDatabase();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Uncaught exception");
  });

  await client.login(config.discordToken);
}

void main().catch((error: unknown) => {
  logger.error({ err: error }, "Fatal startup error");
  process.exit(1);
});
