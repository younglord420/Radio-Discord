import { Events, type Client } from "discord.js";
import { logger } from "../../utils/logger.js";
import type { BotContext } from "../context.js";

export function registerReadyHandler(client: Client, ctx: BotContext): void {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ user: readyClient.user.tag }, "Bot logged in");
    void ctx.sync.syncIfDue().catch((error: unknown) => {
      logger.error({ err: error }, "Initial station sync failed");
    });
    setTimeout(() => {
      void ctx.stayAlive.resumeAll().catch((error: unknown) => {
        logger.error({ err: error }, "24/7 resume failed");
      });
    }, 3_000);
  });
}
