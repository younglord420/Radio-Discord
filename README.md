# Discord Indonesian Radio Bot

Live Indonesian internet radio in Discord voice channels. Station metadata comes from the [Radio Browser](https://www.radio-browser.info/) public API. The bot plays each broadcaster's live stream URL; it does not download or archive audio.

This is a **radio tuner**, not a music queue bot. There is no skip, shuffle, or lyrics. Favorites and presets are station bookmarks. 24/7 mode keeps the bot in a voice channel and resumes the last station after a restart.

## Features

- Search Indonesian (and worldwide) stations via Radio Browser
- Play HTTP/HTTPS Icecast/Shoutcast streams (MP3, AAC, playlists when possible)
- One isolated playback session per Discord server
- Interactive buttons, server presets, and Prev/Next station switching
- Personal favorites (up to 25), usable across servers
- Now playing embed, optional ICY `StreamTitle`
- Volume, pause/resume, stop, disconnect
- 24/7 stay-in-channel with persisted last station
- Local SQLite cache with periodic Indonesian station sync (every 6 hours)
- Structured logging (pino), graceful shutdown, Docker and PM2

## Requirements

- Node.js 22+
- FFmpeg (`ffmpeg` on `PATH`)
- A Discord application with a bot user
- Optional: Docker 24+, PM2, Ubuntu 22.04/24.04 VPS (1 vCPU / 1 GB RAM is enough)

## Installation

```bash
git clone https://github.com/younglord420/Radio-Discord.git
cd Radio-Discord
cp .env.example .env
# edit .env
npm install
npm run build
```

## Discord application setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Open **Bot** and create a bot. Copy the token into `DISCORD_TOKEN`.
3. Copy the **Application ID** into `DISCORD_CLIENT_ID`.
4. Disable unused privileged intents. This bot only needs:
   - Server Members Intent: **off**
   - Message Content Intent: **off**
   - Presence Intent: **off**
5. Enable **Privileged Gateway Intents** only if you later add extra features. Voice playback uses **Guilds** and **Guild Voice States** (not privileged).
6. OAuth2 URL generator: scopes `bot` and `applications.commands`.

Optional: set `DISCORD_GUILD_ID` to a test server so slash commands deploy instantly to that guild.

## Bot permissions

Invite with at least:

- View Channels
- Connect
- Speak
- Send Messages
- Embed Links
- Use Application Commands

Users must be in a voice channel to start playback. Pause/stop/volume require the same voice channel as the bot (Manage Server can override). Preset and 24/7 settings require **Manage Server**.

## FFmpeg installation

Ubuntu 22.04 / 24.04:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
ffmpeg -version
```

The Docker image already includes FFmpeg.

## Environment variables

See [`.env.example`](.env.example).

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token (never commit this) |
| `DISCORD_CLIENT_ID` | yes | Application ID |
| `DISCORD_GUILD_ID` | no | Deploy slash commands to one guild |
| `RADIO_BROWSER_API` | no | Default `https://de1.api.radio-browser.info` |
| `RADIO_BROWSER_USER_AGENT` | no | Radio Browser requires a User-Agent |
| `DATABASE_URL` | no | SQLite path, default `./data/radio.db` |
| `LOG_LEVEL` | no | `info`, `debug`, `warn`, `error` |
| `LOG_PRETTY` | no | Set `0` to disable pretty logs in production |

Do not hardcode secrets. Tokens are never written to logs.

## Database setup

SQLite is created automatically on first start (`./data/radio.db`). No migration step is required.

The schema is wrapped behind repository classes so PostgreSQL can replace SQLite later (`DATABASE_URL=postgres://...` would need a new driver implementation; the bot does not use Postgres yet).

Indonesian stations are synced from Radio Browser about every 6 hours. Restarts within 3 hours skip a sync so the API is not hammered.

## Slash command deployment

```bash
npm run deploy
```

With `DISCORD_GUILD_ID` set, commands appear in that server immediately. Without it, global commands can take up to an hour.

Commands:

- `/radio menu` — interactive menu and server presets
- `/radio search <query>` — name, city, or genre (`prambors`, `jakarta`, `dangdut`)
- `/radio play <station>`
- `/radio list` — popular Indonesian stations (paginated)
- `/radio nowplaying` / `pause` / `resume` / `volume` / `stop` / `disconnect`
- `/radio next` / `/radio prev` — switch stations (search results, favorites, presets, or popular list)
- `/radio fav list|add|remove`
- `/radio preset list|set|clear` (set/clear: Manage Server)
- `/radio 247 on|off` (Manage Server)
- `/about` — Radio Browser attribution and legal note

Discord does not allow invoking `/radio` with no subcommand when subcommands exist, so the menu is `/radio menu`.

## Running locally

```bash
# 1. Install FFmpeg
# 2. Fill .env
npm install
npm run build
npm test
npm run deploy
npm start
```

Development:

```bash
npm run dev
```

## Running with Docker

```bash
cp .env.example .env
# fill DISCORD_TOKEN and DISCORD_CLIENT_ID
docker compose up -d --build
```

Slash commands still need a one-time deploy from a host with Node:

```bash
npm install
npm run deploy
```

Data is stored in the `radio-data` volume.

## Running with PM2 (Ubuntu VPS)

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg nodejs npm
# or install Node 22 from NodeSource

git clone <this-repo> && cd discord
cp .env.example .env
nano .env

npm install
npm run build
npm test
npm run deploy

npm install -g pm2
pm2 start dist/index.js --name discord-radio
# or: pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## Troubleshooting

| Problem | What to check |
|---|---|
| Commands missing | Run `npm run deploy`. For global commands wait up to 1 hour, or set `DISCORD_GUILD_ID`. |
| Join a voice channel first | You must be in a VC before `/radio play`. |
| Stream unavailable | Station is down or the URL is a bad playlist. Try another result. |
| No audio | FFmpeg installed? Bot Speak permission? Not server-muted? |
| Radio Browser empty | The bot discovers mirrors (`all.api.radio-browser.info`) and fails over if `de1` times out. Check logs for "Radio Browser mirror reachable". |
| Bot leaves after restart | Enable `/radio 247 on` after joining a channel. |
| High CPU | One FFmpeg process per active guild is expected. Disable unused 24/7 servers. |

Without `DISCORD_TOKEN`, live Discord gateway and voice UDP cannot be tested. `npm run build` and `npm test` still run.

## Radio Browser API

The bot prefers `RADIO_BROWSER_API` when set, then discovers other public mirrors via DNS (`all.api.radio-browser.info`) and fails over on timeout. Used endpoints:

- `/json/stations/search`
- Stations are filtered with `lastcheckok = 1` and a non-empty `url_resolved`
- Playback uses `url_resolved`

Other public mirrors can be set via `RADIO_BROWSER_API`. Always send a User-Agent. This project does not scrape RadioIndonesia.org and does not use TuneIn.

## Legal considerations

- Station names, tags, and homepage/stream URLs are retrieved from Radio Browser's public API.
- The bot only opens the broadcaster's live stream. It does not store or redistribute the audio.
- Respect each station's terms and your local law.
- `/about` displays this attribution in Discord.

## License

MIT
