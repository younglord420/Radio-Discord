import { generateDependencyReport } from "@discordjs/voice";
import * as davey from "@snazzah/davey";
import * as opus from "@discordjs/opus";
import sodium from "sodium-native";
import { logger } from "../utils/logger.js";

void davey;
void opus;
void sodium;

export function logVoiceDependencies(): void {
  logger.info({ report: generateDependencyReport() }, "Voice dependencies");
}
