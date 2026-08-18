import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import type { BotContext } from "../context.js";
import { aboutCommand, handleAboutCommand } from "./about.js";
import {
  handleRadioAutocomplete,
  handleRadioCommand,
  radioCommand,
} from "./radio.js";

export const commandBuilders = [radioCommand, aboutCommand];

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  switch (interaction.commandName) {
    case "radio":
      await handleRadioCommand(interaction, ctx);
      break;
    case "about":
      await handleAboutCommand(interaction);
      break;
    default:
      break;
  }
}

export async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  if (interaction.commandName === "radio") {
    await handleRadioAutocomplete(interaction, ctx);
  }
}
