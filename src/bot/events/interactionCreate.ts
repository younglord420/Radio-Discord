import { Events, type Client, type Interaction } from "discord.js";
import { logger } from "../../utils/logger.js";
import type { BotContext } from "../context.js";
import { handleAutocomplete, handleChatInput } from "../commands/index.js";
import { handleList, handleSkip, playStationUuid } from "../commands/radio.js";
import { errorEmbed, nowPlayingEmbed, nowPlayingComponents, successEmbed } from "../ui.js";
import { asGuildMember, canControlPlayback } from "../../utils/permissions.js";

export function registerInteractionHandler(client: Client, ctx: BotContext): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    void handleInteraction(interaction, ctx).catch((error: unknown) => {
      logger.error({ err: error }, "Unhandled interaction error");
    });
  });
}

async function handleInteraction(interaction: Interaction, ctx: BotContext): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction, ctx);
      return;
    }
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, ctx);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, ctx);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction, ctx);
    }
  } catch (error) {
    logger.error({ err: error }, "Interaction failed");
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [errorEmbed("Something went wrong. Please try again.")],
        ephemeral: true,
      });
    }
  }
}

async function handleButton(
  interaction: import("discord.js").ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  const [ns, action, arg] = interaction.customId.split(":");
  if (ns !== "radio") {
    return;
  }

  if (action === "play" && arg) {
    await playStationUuid(interaction, ctx, arg);
    return;
  }
  if (action === "list") {
    const parts = interaction.customId.split(":");
    const page = Number(parts[3] ?? parts[2] ?? 0) || 0;
    await handleList(interaction, ctx, page);
    return;
  }
  if (action === "now") {
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
      ephemeral: true,
    });
    return;
  }
  if (action === "next" || action === "prev") {
    await handleSkip(interaction, ctx, action === "next" ? 1 : -1);
    return;
  }
  if (action === "stop") {
    const member = asGuildMember(interaction.member);
    if (!interaction.guildId || !member) {
      await interaction.reply({ embeds: [errorEmbed("Use this in a server.")], ephemeral: true });
      return;
    }
    const session = ctx.sessions.get(interaction.guildId);
    if (!canControlPlayback(member, session?.voiceChannelId)) {
      await interaction.reply({
        embeds: [errorEmbed("Join the same voice channel as the bot to control playback.")],
        ephemeral: true,
      });
      return;
    }
    const stopped = await ctx.sessions.stop(interaction.guildId);
    await interaction.reply({
      embeds: [successEmbed(stopped ? "Stopped playback." : "Nothing is playing.")],
      ephemeral: true,
    });
  }
}

async function handleSelect(
  interaction: import("discord.js").StringSelectMenuInteraction,
  ctx: BotContext,
): Promise<void> {
  if (interaction.customId !== "radio:preset-select" || !interaction.guildId) {
    return;
  }
  const slot = Number(interaction.values[0]);
  if (!Number.isInteger(slot)) {
    await interaction.reply({ embeds: [errorEmbed("Invalid preset.")], ephemeral: true });
    return;
  }
  try {
    const preset = ctx.presets.get(interaction.guildId, slot);
    if (!preset) {
      await interaction.reply({ embeds: [errorEmbed("That preset is empty.")], ephemeral: true });
      return;
    }
    ctx.dials.set(
      interaction.guildId,
      ctx.presets.list(interaction.guildId).map((p) => p.stationuuid),
    );
    await playStationUuid(interaction, ctx, preset.stationuuid);
  } catch (error) {
    logger.warn({ err: error }, "Preset play failed");
    await interaction.reply({ embeds: [errorEmbed("Could not play that preset.")], ephemeral: true });
  }
}
