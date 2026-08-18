import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { LIST_PAGE_SIZE, MAX_FAVORITES } from "../../types.js";
import { FavoriteLimitError } from "../../database/favorites.js";
import { InvalidPresetSlotError } from "../../database/presets.js";
import { StreamUnavailableError } from "../../radio/StationValidator.js";
import { rankStations, uniqueByUuid } from "../../radio/stationRanking.js";
import { POPULAR_DIAL_LIMIT, nextInDial, type DialDirection } from "../../radio/stationDial.js";
import { logger } from "../../utils/logger.js";
import {
  botCanJoin,
  canControlPlayback,
  canManageGuild,
  getMemberVoiceChannel,
  asGuildMember,
} from "../../utils/permissions.js";
import type { BotContext } from "../context.js";
import {
  errorEmbed,
  favoriteButtons,
  favoritesEmbed,
  listButtons,
  listEmbed,
  menuComponents,
  menuEmbed,
  nowPlayingEmbed,
  nowPlayingComponents,
  searchButtons,
  searchEmbed,
  successEmbed,
} from "../ui.js";

export const radioCommand = new SlashCommandBuilder()
  .setName("radio")
  .setDescription("Play Indonesian internet radio in a voice channel")
  .addSubcommand((s) => s.setName("menu").setDescription("Interactive radio menu"))
  .addSubcommand((s) =>
    s
      .setName("search")
      .setDescription("Search Radio Browser stations")
      .addStringOption((o) =>
        o.setName("query").setDescription("Station name, city, or genre").setRequired(true).setMaxLength(80),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("play")
      .setDescription("Play a station by name")
      .addStringOption((o) =>
        o
          .setName("station")
          .setDescription("Station name")
          .setRequired(true)
          .setAutocomplete(true)
          .setMaxLength(100),
      ),
  )
  .addSubcommand((s) => s.setName("stop").setDescription("Stop playback"))
  .addSubcommand((s) => s.setName("pause").setDescription("Pause playback"))
  .addSubcommand((s) => s.setName("resume").setDescription("Resume playback"))
  .addSubcommand((s) => s.setName("nowplaying").setDescription("Show the current station"))
  .addSubcommand((s) =>
    s
      .setName("volume")
      .setDescription("Set playback volume")
      .addIntegerOption((o) =>
        o.setName("level").setDescription("Volume 0-100").setRequired(true).setMinValue(0).setMaxValue(100),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("Popular Indonesian stations")
      .addIntegerOption((o) =>
        o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false),
      ),
  )
  .addSubcommand((s) => s.setName("disconnect").setDescription("Disconnect the bot from the voice channel"))
  .addSubcommand((s) => s.setName("next").setDescription("Play the next station (presets, search, or popular)"))
  .addSubcommand((s) => s.setName("prev").setDescription("Play the previous station (presets, search, or popular)"))
  .addSubcommandGroup((g) =>
    g
      .setName("fav")
      .setDescription("Personal favorite stations")
      .addSubcommand((s) => s.setName("list").setDescription("Show your favorite stations"))
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Add the current station (or search by name)")
          .addStringOption((o) =>
            o.setName("station").setDescription("Station name if nothing is playing").setAutocomplete(true),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Remove a favorite")
          .addStringOption((o) =>
            o.setName("station").setDescription("Station name").setRequired(true).setAutocomplete(true),
          ),
      ),
  )
  .addSubcommandGroup((g) =>
    g
      .setName("preset")
      .setDescription("Server radio presets")
      .addSubcommand((s) => s.setName("list").setDescription("Show this server's presets"))
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Assign a preset slot (Manage Server)")
          .addIntegerOption((o) =>
            o.setName("slot").setDescription("Slot 1-5").setRequired(true).setMinValue(1).setMaxValue(5),
          )
          .addStringOption((o) =>
            o
              .setName("station")
              .setDescription("Station name")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("clear")
          .setDescription("Clear a preset slot (Manage Server)")
          .addIntegerOption((o) =>
            o.setName("slot").setDescription("Slot 1-5").setRequired(true).setMinValue(1).setMaxValue(5),
          ),
      ),
  )
  .addSubcommandGroup((g) =>
    g
      .setName("247")
      .setDescription("24/7 stay-in-channel mode")
      .addSubcommand((s) => s.setName("on").setDescription("Keep the bot in the voice channel (Manage Server)"))
      .addSubcommand((s) => s.setName("off").setDescription("Disable 24/7 mode (Manage Server)")),
  );

export async function handleRadioAutocomplete(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "station" && focused.name !== "query") {
    await interaction.respond([]);
    return;
  }
  const query = focused.value.trim();
  if (query.length < 2) {
    const popular = ctx.stations.listPopular({ limit: 15, offset: 0 });
    await interaction.respond(
      popular.slice(0, 25).map((s) => ({ name: truncateChoice(s.name), value: s.name.slice(0, 100) })),
    );
    return;
  }
  const results = ctx.stations.search(query, 25);
  await interaction.respond(
    results.slice(0, 25).map((s) => ({ name: truncateChoice(s.name), value: s.name.slice(0, 100) })),
  );
}

export async function handleRadioCommand(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === "fav") {
    await handleFav(interaction, ctx, sub);
    return;
  }
  if (group === "preset") {
    await handlePreset(interaction, ctx, sub);
    return;
  }
  if (group === "247") {
    await handle247(interaction, ctx, sub);
    return;
  }

  switch (sub) {
    case "menu":
      await handleMenu(interaction, ctx);
      break;
    case "search":
      await handleSearch(interaction, ctx);
      break;
    case "play":
      await handlePlayName(interaction, ctx);
      break;
    case "stop":
      await handleStop(interaction, ctx);
      break;
    case "pause":
      await handlePause(interaction, ctx, true);
      break;
    case "resume":
      await handlePause(interaction, ctx, false);
      break;
    case "nowplaying":
      await handleNowPlaying(interaction, ctx);
      break;
    case "volume":
      await handleVolume(interaction, ctx);
      break;
    case "list":
      await handleList(interaction, ctx, (interaction.options.getInteger("page") ?? 1) - 1);
      break;
    case "disconnect":
      await handleDisconnect(interaction, ctx);
      break;
    case "next":
      await handleSkip(interaction, ctx, 1);
      break;
    case "prev":
      await handleSkip(interaction, ctx, -1);
      break;
    default:
      await interaction.reply({ embeds: [errorEmbed("Unknown subcommand.")], ephemeral: true });
  }
}

export async function playStationUuid(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction | import("discord.js").StringSelectMenuInteraction,
  ctx: BotContext,
  stationuuid: string,
): Promise<void> {
  const guild = interaction.guild;
  const member = asGuildMember(interaction.member);
  if (!guild || !member) {
    await reply(interaction, "This command can only be used in a server.", true);
    return;
  }

  const voice = getMemberVoiceChannel(member);
  if (!voice) {
    await reply(interaction, "Join a voice channel first.", true);
    return;
  }
  if (!botCanJoin(voice)) {
    await reply(interaction, "I need permission to view, connect, and speak in that voice channel.", true);
    return;
  }
  if (!ctx.sessions.canPlayNow(guild.id)) {
    await reply(interaction, "Please wait a moment before changing stations.", true);
    return;
  }

  let station = ctx.stations.findByUuid(stationuuid);
  if (!station) {
    station = await ctx.radioBrowser.byUuid(stationuuid);
    if (station) {
      ctx.stations.upsertMany([station]);
    }
  }
  if (!station) {
    await reply(interaction, "Station not found.", true);
    return;
  }

  await defer(interaction);
  try {
    const session = await ctx.sessions.play({
      guildId: guild.id,
      channel: voice,
      station,
    });
    await edit(interaction, {
      embeds: [
        nowPlayingEmbed(station, {
          startedAt: session.startedAt,
          streamTitle: session.streamTitle,
          volume: session.volume,
          stay247: session.stay247,
        }),
      ],
      components: nowPlayingComponents(),
    });
  } catch (error) {
    logger.warn({ err: error, guildId: guild.id }, "Play failed");
    const message =
      error instanceof StreamUnavailableError
        ? "Stream unavailable\n\nTry another station."
        : error instanceof Error && /aborted/i.test(error.message)
          ? "Could not connect to the voice channel. Leave and rejoin voice, then press Play again."
          : error instanceof Error
            ? error.message
            : "Could not start playback.";
    await edit(interaction, { embeds: [errorEmbed(message)] });
  }
}

async function handleMenu(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  const presets = interaction.guildId ? ctx.presets.list(interaction.guildId) : [];
  if (interaction.guildId) {
    ctx.dials.set(
      interaction.guildId,
      presets.map((p) => p.stationuuid),
    );
  }
  await interaction.reply({
    embeds: [menuEmbed(presets)],
    components: menuComponents(presets),
    ephemeral: true,
  });
}

async function handleSearch(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  const query = interaction.options.getString("query", true);
  await interaction.deferReply({ ephemeral: true });

  const local = ctx.stations.search(query, 25);
  let remote: typeof local = [];
  try {
    remote = await ctx.radioBrowser.search(query, 25);
    if (remote.length > 0) {
      ctx.stations.upsertMany(remote);
    }
  } catch (error) {
    logger.warn({ err: error }, "Radio Browser search failed");
  }

  const merged = rankStations(uniqueByUuid([...local, ...remote]), query).slice(0, 10);
  if (interaction.guildId) {
    ctx.dials.set(
      interaction.guildId,
      merged.map((s) => s.stationuuid),
    );
  }
  await interaction.editReply({
    embeds: [searchEmbed(query, merged)],
    components: searchButtons(merged),
  });
}

async function handlePlayName(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  const name = interaction.options.getString("station", true);
  let station = ctx.stations.findBestMatch(name);
  if (!station) {
    const remote = await ctx.radioBrowser.search(name, 5);
    if (remote[0]) {
      ctx.stations.upsertMany(remote);
      station = remote[0];
    }
  }
  if (!station) {
    await interaction.reply({ embeds: [errorEmbed("Station not found.")], ephemeral: true });
    return;
  }
  await playStationUuid(interaction, ctx, station.stationuuid);
}

async function handleStop(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  if (!requireSameChannel(interaction, ctx, true)) {
    return;
  }
  const guildId = interaction.guildId!;
  const stopped = await ctx.sessions.stop(guildId);
  await interaction.reply({
    embeds: [successEmbed(stopped ? "Stopped playback." : "Nothing is playing.")],
    ephemeral: true,
  });
}

async function handlePause(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  pause: boolean,
): Promise<void> {
  if (!requireSameChannel(interaction, ctx, true)) {
    return;
  }
  const session = ctx.sessions.get(interaction.guildId!);
  if (!session) {
    await interaction.reply({ embeds: [errorEmbed("Nothing is playing.")], ephemeral: true });
    return;
  }
  const ok = pause ? session.pause() : session.resume();
  await interaction.reply({
    embeds: [
      successEmbed(
        ok
          ? pause
            ? "Paused. Live radio will continue from the current broadcast when you resume."
            : "Resumed."
          : "Could not change playback state.",
      ),
    ],
    ephemeral: true,
  });
}

async function handleNowPlaying(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  const session = interaction.guildId ? ctx.sessions.get(interaction.guildId) : undefined;
  if (!session) {
    await interaction.reply({ embeds: [errorEmbed("Nothing is playing.")], ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: [
      nowPlayingEmbed(session.station, {
        startedAt: session.startedAt,
        streamTitle: session.streamTitle,
        volume: session.volume,
        stay247: session.stay247,
      }),
    ],
    components: nowPlayingComponents(),
  });
}

async function handleVolume(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  if (!requireSameChannel(interaction, ctx, true)) {
    return;
  }
  const level = interaction.options.getInteger("level", true);
  const guildId = interaction.guildId!;
  ctx.guilds.update(guildId, { volume: level });
  const session = ctx.sessions.get(guildId);
  if (session) {
    session.setVolume(level);
  }
  await interaction.reply({ embeds: [successEmbed(`Volume set to ${level}%.`)], ephemeral: true });
}

export async function handleSkip(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction,
  ctx: BotContext,
  direction: DialDirection,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await reply(interaction, "Use this in a server.", true);
    return;
  }

  const session = ctx.sessions.get(guildId);
  if (session) {
    if (interaction.isChatInputCommand() && !requireSameChannel(interaction, ctx, true)) {
      return;
    }
    if (interaction.isButton()) {
      const member = asGuildMember(interaction.member);
      if (!member || !canControlPlayback(member, session.voiceChannelId)) {
        await interaction.reply({
          embeds: [errorEmbed("Join the same voice channel as the bot to control playback.")],
          ephemeral: true,
        });
        return;
      }
    }
  }

  const currentUuid = session?.station.stationuuid;
  const ids = resolveDialIds(ctx, guildId, currentUuid);
  const nextId = nextInDial(ids, currentUuid, direction);

  if (!nextId || ids.length < 2) {
    const payload = {
      embeds: [
        errorEmbed(
          "No other stations to switch to. Search, open `/radio list`, or set at least two `/radio preset` slots first.",
        ),
      ],
      ephemeral: true as const,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
      return;
    }
    await interaction.reply(payload);
    return;
  }

  if (nextId === currentUuid) {
    await reply(interaction, "Already on that station.", true);
    return;
  }

  await playStationUuid(interaction, ctx, nextId);
}

function resolveDialIds(ctx: BotContext, guildId: string, currentUuid: string | undefined): string[] {
  const remembered = ctx.dials.get(guildId);
  if (remembered && remembered.length >= 2) {
    return remembered;
  }

  const presets = ctx.presets.list(guildId).map((p) => p.stationuuid);
  if (presets.length >= 2) {
    return presets;
  }

  const popular = ctx.stations
    .listPopular({ countrycode: "ID", limit: POPULAR_DIAL_LIMIT, offset: 0 })
    .map((s) => s.stationuuid);
  if (currentUuid && !popular.includes(currentUuid)) {
    return [currentUuid, ...popular];
  }
  return popular;
}

export async function handleList(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction,
  ctx: BotContext,
  page: number,
): Promise<void> {
  const safePage = Math.max(0, page);
  const total = ctx.stations.countPopular("ID");
  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const current = Math.min(safePage, totalPages - 1);
  const stations = ctx.stations.listPopular({
    countrycode: "ID",
    limit: LIST_PAGE_SIZE,
    offset: current * LIST_PAGE_SIZE,
  });
  if (interaction.guildId) {
    ctx.dials.set(
      interaction.guildId,
      ctx.stations.listPopular({ countrycode: "ID", limit: POPULAR_DIAL_LIMIT, offset: 0 }).map((s) => s.stationuuid),
    );
  }

  const payload = {
    embeds: [listEmbed(stations, current, total)],
    components: listButtons(current, totalPages, stations),
    ephemeral: true as const,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else if (interaction.isButton()) {
    await interaction.update(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function handleDisconnect(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  if (!requireSameChannel(interaction, ctx, true)) {
    return;
  }
  const left = await ctx.sessions.disconnect(interaction.guildId!);
  await interaction.reply({
    embeds: [
      successEmbed(
        left
          ? "Disconnected. If 24/7 is still on, I will rejoin after a restart."
          : "I am not connected.",
      ),
    ],
    ephemeral: true,
  });
}

async function handleFav(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  sub: string,
): Promise<void> {
  const userId = interaction.user.id;

  if (sub === "list") {
    const items = ctx.favorites.list(userId);
    if (interaction.guildId) {
      ctx.dials.set(
        interaction.guildId,
        items.map((item) => item.stationuuid),
      );
    }
    await interaction.reply({
      embeds: [favoritesEmbed(items)],
      components: favoriteButtons(items),
      ephemeral: true,
    });
    return;
  }

  if (sub === "add") {
    const name = interaction.options.getString("station");
    const session = interaction.guildId ? ctx.sessions.get(interaction.guildId) : undefined;
    const station = name
      ? ctx.stations.findBestMatch(name)
      : session?.station;
    if (!station) {
      await interaction.reply({
        embeds: [errorEmbed("Play a station first, or pass a station name.")],
        ephemeral: true,
      });
      return;
    }
    try {
      ctx.favorites.add(userId, station.stationuuid);
      await interaction.reply({
        embeds: [successEmbed(`Added **${station.name}** to your favorites (${ctx.favorites.count(userId)}/${MAX_FAVORITES}).`)],
        ephemeral: true,
      });
    } catch (error) {
      const message = error instanceof FavoriteLimitError ? error.message : "Could not add favorite.";
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
    return;
  }

  if (sub === "remove") {
    const name = interaction.options.getString("station", true);
    const station = ctx.stations.findBestMatch(name);
    if (!station || !ctx.favorites.has(userId, station.stationuuid)) {
      await interaction.reply({ embeds: [errorEmbed("That station is not in your favorites.")], ephemeral: true });
      return;
    }
    ctx.favorites.remove(userId, station.stationuuid);
    await interaction.reply({
      embeds: [successEmbed(`Removed **${station.name}** from your favorites.`)],
      ephemeral: true,
    });
  }
}

async function handlePreset(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  sub: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [errorEmbed("Use this in a server.")], ephemeral: true });
    return;
  }

  if (sub === "list") {
    const presets = ctx.presets.list(interaction.guildId);
    ctx.dials.set(
      interaction.guildId,
      presets.map((p) => p.stationuuid),
    );
    await interaction.reply({
      embeds: [menuEmbed(presets)],
      components: menuComponents(presets),
      ephemeral: true,
    });
    return;
  }

  if (!canManageGuild(asGuildMember(interaction.member))) {
    await interaction.reply({
      embeds: [errorEmbed("You need the **Manage Server** permission to change presets.")],
      ephemeral: true,
    });
    return;
  }

  const slot = interaction.options.getInteger("slot", true);
  try {
    if (sub === "set") {
      const name = interaction.options.getString("station", true);
      const station = ctx.stations.findBestMatch(name);
      if (!station) {
        await interaction.reply({ embeds: [errorEmbed("Station not found.")], ephemeral: true });
        return;
      }
      ctx.presets.set(interaction.guildId, slot, station.stationuuid, station.name);
      await interaction.reply({
        embeds: [successEmbed(`Preset **${slot}** is now **${station.name}**.`)],
      });
      return;
    }
    if (sub === "clear") {
      const cleared = ctx.presets.clear(interaction.guildId, slot);
      await interaction.reply({
        embeds: [successEmbed(cleared ? `Cleared preset **${slot}**.` : `Preset **${slot}** was already empty.`)],
      });
    }
  } catch (error) {
    const message = error instanceof InvalidPresetSlotError ? error.message : "Could not update preset.";
    await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
  }
}

async function handle247(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  sub: string,
): Promise<void> {
  const member = asGuildMember(interaction.member);
  if (!interaction.guildId || !member) {
    await interaction.reply({ embeds: [errorEmbed("Use this in a server.")], ephemeral: true });
    return;
  }
  if (!canManageGuild(member)) {
    await interaction.reply({
      embeds: [errorEmbed("You need the **Manage Server** permission to change 24/7 mode.")],
      ephemeral: true,
    });
    return;
  }

  if (sub === "off") {
    ctx.guilds.update(interaction.guildId, { stay_247: 0 });
    const session = ctx.sessions.get(interaction.guildId);
    session?.setStay247(false);
    await interaction.reply({ embeds: [successEmbed("24/7 mode disabled.")] });
    return;
  }

  const session = ctx.sessions.get(interaction.guildId);
  const voice = getMemberVoiceChannel(member) ?? null;
  const channelId = session?.voiceChannelId ?? voice?.id;
  if (!channelId) {
    await interaction.reply({
      embeds: [errorEmbed("Join a voice channel (or start playback) before enabling 24/7.")],
      ephemeral: true,
    });
    return;
  }

  const stationuuid = session?.station.stationuuid ?? ctx.guilds.get(interaction.guildId).last_stationuuid;
  ctx.guilds.update(interaction.guildId, {
    stay_247: 1,
    voice_channel_id: channelId,
    last_stationuuid: stationuuid,
  });
  session?.setStay247(true);
  await interaction.reply({
    embeds: [
      successEmbed(
        "24/7 mode enabled. I will stay in the voice channel and resume the last station after a restart.",
      ),
    ],
  });
}

function requireSameChannel(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  ephemeral: boolean,
): boolean {
  const member = asGuildMember(interaction.member);
  if (!interaction.guildId || !member) {
    void interaction.reply({ embeds: [errorEmbed("Use this in a server.")], ephemeral });
    return false;
  }
  const session = ctx.sessions.get(interaction.guildId);
  if (!canControlPlayback(member, session?.voiceChannelId)) {
    void interaction.reply({
      embeds: [errorEmbed("Join the same voice channel as the bot to control playback.")],
      ephemeral,
    });
    return false;
  }
  return true;
}

function truncateChoice(name: string): string {
  return name.length <= 100 ? name : `${name.slice(0, 99)}…`;
}

async function reply(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction | import("discord.js").StringSelectMenuInteraction,
  message: string,
  ephemeral: boolean,
): Promise<void> {
  const payload = { embeds: [errorEmbed(message)], ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.reply(payload);
}

async function defer(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction | import("discord.js").StringSelectMenuInteraction,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    return;
  }
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    return;
  }
  await interaction.deferReply();
}

async function edit(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction | import("discord.js").StringSelectMenuInteraction,
  payload: {
    embeds: ReturnType<typeof nowPlayingEmbed>[] | ReturnType<typeof errorEmbed>[];
    components?: ReturnType<typeof nowPlayingComponents>;
  },
): Promise<void> {
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return;
    }
    await interaction.update(payload);
    return;
  }
  await interaction.editReply(payload);
}
