import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const pretty = process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "0";

export const logger = pino({
  level,
  redact: {
    paths: [
      "DISCORD_TOKEN",
      "token",
      "headers.authorization",
      "config.discordToken",
    ],
    remove: true,
  },
  transport: pretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});
