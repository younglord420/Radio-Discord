import { Client, GatewayIntentBits } from "discord.js";
import type { BotContext } from "./context.js";
import { registerInteractionHandler } from "./events/interactionCreate.js";
import { registerReadyHandler } from "./events/ready.js";

export function createBotClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
}

export function registerBotEvents(client: Client, ctx: BotContext): void {
  registerReadyHandler(client, ctx);
  registerInteractionHandler(client, ctx);
}
