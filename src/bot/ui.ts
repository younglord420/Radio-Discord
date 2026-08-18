import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { GuildPreset, Station } from "../types.js";
import { LIST_PAGE_SIZE } from "../types.js";

export const EMBED_COLOR = 0xe63946;

export function stationLocation(station: Station): string {
  const parts = [station.country].filter(Boolean);
  if (station.countrycode === "ID" && !station.country) {
    parts.push("Indonesia");
  }
  return parts.join(", ") || "Unknown";
}

export function stationGenre(station: Station): string {
  const tags = station.tags
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);
  return tags && tags.length > 0 ? tags.join(", ") : "N/A";
}

export function formatBitrate(station: Station): string {
  return station.bitrate > 0 ? `${station.bitrate} kbps` : "N/A";
}

export function relativeStarted(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function searchEmbed(query: string, stations: Station[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Radio Search")
    .setDescription(stations.length === 0 ? `No stations found for **${query}**.` : `Results for **${query}**:`)
    .setFooter({ text: "Station data from Radio Browser" });

  stations.slice(0, 10).forEach((station, index) => {
    embed.addFields({
      name: `${index + 1}. ${station.name}`,
      value: [
        `${stationLocation(station)} • ${stationGenre(station)}`,
        `${formatBitrate(station)} • ${station.codec || "N/A"}`,
      ].join("\n"),
      inline: false,
    });
  });
  return embed;
}

export function searchButtons(stations: Station[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const slice = stations.slice(0, 10);
  for (let i = 0; i < slice.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const [offset, station] of slice.slice(i, i + 5).entries()) {
      const n = i + offset + 1;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`radio:play:${station.stationuuid}`)
          .setLabel(`Play ${n}`)
          .setStyle(ButtonStyle.Primary),
      );
    }
    rows.push(row);
  }
  return rows;
}

export function menuEmbed(presets: Array<GuildPreset & { station?: Station }>): EmbedBuilder {
  const lines =
    presets.length === 0
      ? "_No server presets yet. Admins can use `/radio preset set`._"
      : presets
          .map((p) => {
            const name = p.station?.name ?? p.name_snapshot ?? p.stationuuid;
            return `**${p.slot}.** ${name}`;
          })
          .join("\n");

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Indonesian Radio")
    .setDescription("Search Radio Browser stations and play them in your voice channel.")
    .addFields({ name: "Server presets", value: lines })
    .setFooter({ text: "Metadata from Radio Browser • Live streams from each broadcaster" });
}

export function menuComponents(
  presets: Array<GuildPreset & { station?: Station }>,
): Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> {
  const rows: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> = [];

  if (presets.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("radio:preset-select")
      .setPlaceholder("Play a server preset")
      .addOptions(
        presets.map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${p.slot}. ${truncate(p.station?.name ?? p.name_snapshot ?? "Station", 80)}`)
            .setValue(String(p.slot))
            .setDescription(truncate(p.station ? stationGenre(p.station) : "Preset", 100)),
        ),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("radio:list:0").setLabel("Popular").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("radio:now").setLabel("Now playing").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("radio:stop").setLabel("Stop").setStyle(ButtonStyle.Danger),
    ),
  );
  return rows;
}

export function listEmbed(stations: Station[], page: number, total: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Popular Indonesian stations")
    .setFooter({
      text: `Page ${page + 1} • ${total} stations • Sorted by votes, bitrate`,
    });

  if (stations.length === 0) {
    embed.setDescription("No stations cached yet. Try again after the first sync.");
    return embed;
  }

  stations.forEach((station, index) => {
    const n = page * LIST_PAGE_SIZE + index + 1;
    embed.addFields({
      name: `${n}. ${station.name}`,
      value: `${stationGenre(station)} • ${formatBitrate(station)} • ${station.votes} votes`,
    });
  });
  return embed;
}

export function listButtons(page: number, totalPages: number, stations: Station[]): ActionRowBuilder<ButtonBuilder>[] {
  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`radio:list:p:${Math.max(0, page - 1)}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`radio:list:n:${Math.min(Math.max(totalPages - 1, 0), page + 1)}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1 || totalPages <= 1),
  );

  const play = new ActionRowBuilder<ButtonBuilder>();
  for (const [i, station] of stations.slice(0, 5).entries()) {
    play.addComponents(
      new ButtonBuilder()
        .setCustomId(`radio:play:${station.stationuuid}`)
        .setLabel(`Play ${page * LIST_PAGE_SIZE + i + 1}`)
        .setStyle(ButtonStyle.Primary),
    );
  }

  const extra = new ActionRowBuilder<ButtonBuilder>();
  for (const [i, station] of stations.slice(5, 10).entries()) {
    extra.addComponents(
      new ButtonBuilder()
        .setCustomId(`radio:play:${station.stationuuid}`)
        .setLabel(`Play ${page * LIST_PAGE_SIZE + 5 + i + 1}`)
        .setStyle(ButtonStyle.Primary),
    );
  }

  const rows = [nav];
  if (play.components.length > 0) {
    rows.push(play);
  }
  if (extra.components.length > 0) {
    rows.push(extra);
  }
  return rows;
}

export function nowPlayingEmbed(
  station: Station,
  options: { startedAt: number; streamTitle: string | null; volume: number; stay247: boolean },
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Now Playing")
    .addFields(
      { name: "Station", value: station.name, inline: false },
      { name: "Location", value: stationLocation(station), inline: true },
      { name: "Genre", value: stationGenre(station), inline: true },
      { name: "Codec", value: station.codec || "N/A", inline: true },
      { name: "Bitrate", value: formatBitrate(station), inline: true },
      { name: "Listeners", value: "N/A", inline: true },
      { name: "Volume", value: `${options.volume}%`, inline: true },
      { name: "Started", value: relativeStarted(options.startedAt), inline: true },
      { name: "24/7", value: options.stay247 ? "On" : "Off", inline: true },
    )
    .setFooter({ text: "Source: Radio Browser metadata • Stream from the broadcaster" });

  if (station.favicon && /^https?:\/\//i.test(station.favicon)) {
    embed.setThumbnail(station.favicon);
  }

  if (options.streamTitle) {
    embed.setDescription(`Now playing:\n**${options.streamTitle}**`);
  }

  return embed;
}

export function nowPlayingComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("radio:prev").setLabel("Prev").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("radio:stop").setLabel("Stop").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("radio:next").setLabel("Next").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function aboutEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("About this radio bot")
    .setDescription(
      [
        "This bot plays **live internet radio** in Discord voice channels.",
        "",
        "Station metadata (names, tags, stream URLs) comes from the public **[Radio Browser](https://www.radio-browser.info/)** API.",
        "Audio is streamed live from each broadcaster's own URL. The bot does **not** download or redistribute copyrighted audio.",
        "",
        "Not affiliated with RadioIndonesia.org or TuneIn.",
      ].join("\n"),
    )
    .addFields({
      name: "Commands",
      value: "`/radio menu` • `/radio search` • `/radio list` • `/radio next` • `/radio prev` • `/radio fav` • `/radio preset` • `/radio 247`",
    });
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x99aab5).setDescription(message);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(EMBED_COLOR).setDescription(message);
}

export function favoritesEmbed(
  items: Array<{ stationuuid: string; station?: Station; name_snapshot?: string }>,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle("Your favorite stations");
  if (items.length === 0) {
    embed.setDescription("No favorites yet. Use `/radio fav add` while a station is playing.");
    return embed;
  }
  items.forEach((item, index) => {
    embed.addFields({
      name: `${index + 1}. ${item.station?.name ?? item.stationuuid}`,
      value: item.station ? `${stationGenre(item.station)} • ${formatBitrate(item.station)}` : "Station metadata missing",
    });
  });
  return embed;
}

export function favoriteButtons(
  items: Array<{ stationuuid: string }>,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(items.length, 10); i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const [offset, item] of items.slice(i, i + 5).entries()) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`radio:play:${item.stationuuid}`)
          .setLabel(`Play ${i + offset + 1}`)
          .setStyle(ButtonStyle.Primary),
      );
    }
    rows.push(row);
  }
  return rows;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}
