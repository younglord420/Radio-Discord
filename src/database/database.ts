import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

let db: Database.Database | undefined;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stationuuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  countrycode TEXT,
  language TEXT,
  tags TEXT,
  homepage TEXT,
  favicon TEXT,
  url TEXT,
  url_resolved TEXT,
  codec TEXT,
  bitrate INTEGER NOT NULL DEFAULT 0,
  votes INTEGER NOT NULL DEFAULT 0,
  lastcheckok INTEGER NOT NULL DEFAULT 0,
  lastchecked INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stations_name ON stations(name);
CREATE INDEX IF NOT EXISTS idx_stations_votes ON stations(votes DESC);
CREATE INDEX IF NOT EXISTS idx_stations_countrycode ON stations(countrycode);
CREATE INDEX IF NOT EXISTS idx_stations_lastcheckok ON stations(lastcheckok);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  stay_247 INTEGER NOT NULL DEFAULT 0,
  voice_channel_id TEXT,
  last_stationuuid TEXT,
  volume INTEGER NOT NULL DEFAULT 80
);

CREATE TABLE IF NOT EXISTS guild_presets (
  guild_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  stationuuid TEXT NOT NULL,
  name_snapshot TEXT,
  PRIMARY KEY (guild_id, slot)
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id TEXT NOT NULL,
  stationuuid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, stationuuid)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDatabase(databaseUrl: string): Database.Database {
  if (db) {
    return db;
  }

  const dir = path.dirname(databaseUrl);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(databaseUrl);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  logger.info({ databaseUrl }, "Database opened");
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database has not been opened");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = undefined;
    logger.info("Database closed");
  }
}

export function getMeta(key: string): string | undefined {
  const row = getDatabase()
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(key: string, value: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

/** Open a standalone DB for tests without touching the process singleton. */
export function createDatabase(databaseUrl: string): Database.Database {
  const dir = path.dirname(databaseUrl);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const instance = new Database(databaseUrl);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA);
  return instance;
}
