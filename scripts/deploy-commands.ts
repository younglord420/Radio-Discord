import { REST, Routes } from "discord.js";
import { config as loadDotenv } from "dotenv";
import { commandBuilders } from "../src/bot/commands/index.js";

loadDotenv();

const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.DISCORD_CLIENT_ID?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required to deploy commands.");
  process.exit(1);
}

const body = commandBuilders.map((c) => c.toJSON());
const rest = new REST({ version: "10" }).setToken(token);

async function deploy(): Promise<void> {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Deployed ${body.length} guild commands to ${guildId}`);
    return;
  }
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log(`Deployed ${body.length} global application commands`);
}

void deploy().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
