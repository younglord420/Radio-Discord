import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
  radioBrowserApi: string;
  radioBrowserUserAgent: string;
  databaseUrl: string;
  logLevel: string;
}

let cached: AppConfig | undefined;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function loadConfig(options?: { requireToken?: boolean }): AppConfig {
  if (cached && options?.requireToken !== false) {
    return cached;
  }

  loadDotenv();

  const requireToken = options?.requireToken !== false;
  const discordToken = process.env.DISCORD_TOKEN?.trim() ?? "";
  const discordClientId = process.env.DISCORD_CLIENT_ID?.trim() ?? "";

  if (requireToken && !discordToken) {
    throw new Error("DISCORD_TOKEN is required");
  }
  if (requireToken && !discordClientId) {
    throw new Error("DISCORD_CLIENT_ID is required");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() || "./data/radio.db";
  const resolvedDb = path.isAbsolute(databaseUrl)
    ? databaseUrl
    : path.resolve(process.cwd(), databaseUrl);

  const dir = path.dirname(resolvedDb);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const cfg: AppConfig = {
    discordToken,
    discordClientId,
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    radioBrowserApi: stripTrailingSlash(
      process.env.RADIO_BROWSER_API?.trim() || "https://de1.api.radio-browser.info",
    ),
    radioBrowserUserAgent:
      process.env.RADIO_BROWSER_USER_AGENT?.trim() ||
      "DiscordRadioBot/1.0 (https://github.com/discord-radio)",
    databaseUrl: resolvedDb,
    logLevel: process.env.LOG_LEVEL?.trim() || "info",
  };

  if (requireToken) {
    cached = cfg;
  }
  return cfg;
}

export function resetConfigCache(): void {
  cached = undefined;
}
