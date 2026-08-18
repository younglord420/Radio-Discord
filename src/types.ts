export interface Station {
  id?: number;
  stationuuid: string;
  name: string;
  country: string | null;
  countrycode: string | null;
  language: string | null;
  tags: string | null;
  homepage: string | null;
  favicon: string | null;
  url: string | null;
  url_resolved: string | null;
  codec: string | null;
  bitrate: number;
  votes: number;
  lastcheckok: number;
  lastchecked: number | null;
  created_at: number;
  updated_at: number;
}

export interface RadioBrowserStation {
  stationuuid?: string;
  name?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  tags?: string;
  homepage?: string;
  favicon?: string;
  url?: string;
  url_resolved?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
  lastcheckok?: number;
  lastchecktime?: string;
  lastchecktime_iso8601?: string;
}

export interface GuildSettings {
  guild_id: string;
  stay_247: number;
  voice_channel_id: string | null;
  last_stationuuid: string | null;
  volume: number;
}

export interface GuildPreset {
  guild_id: string;
  slot: number;
  stationuuid: string;
  name_snapshot: string | null;
}

export interface UserFavorite {
  user_id: string;
  stationuuid: string;
  created_at: number;
}

export const MAX_FAVORITES = 25;
export const PRESET_SLOTS = [1, 2, 3, 4, 5] as const;
export const LIST_PAGE_SIZE = 12;
