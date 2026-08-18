import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { aboutEmbed } from "../ui.js";

export const aboutCommand = new SlashCommandBuilder()
  .setName("about")
  .setDescription("About this bot and Radio Browser attribution");

export async function handleAboutCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ embeds: [aboutEmbed()] });
}
