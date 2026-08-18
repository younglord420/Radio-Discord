import type { Client } from "discord.js";
import type { FavoriteRepository } from "../database/favorites.js";
import type { GuildRepository } from "../database/guilds.js";
import type { PresetRepository } from "../database/presets.js";
import type { StationRepository } from "../database/stations.js";
import type { RadioBrowserClient } from "../radio/RadioBrowserClient.js";
import type { RadioSessionManager } from "../radio/RadioSessionManager.js";
import type { StationSyncService } from "../services/StationSyncService.js";
import type { StayAliveService } from "../services/StayAliveService.js";
import type { StationDialStore } from "../radio/stationDial.js";

export interface BotContext {
  client: Client;
  stations: StationRepository;
  guilds: GuildRepository;
  favorites: FavoriteRepository;
  presets: PresetRepository;
  radioBrowser: RadioBrowserClient;
  sessions: RadioSessionManager;
  sync: StationSyncService;
  stayAlive: StayAliveService;
  dials: StationDialStore;
}
