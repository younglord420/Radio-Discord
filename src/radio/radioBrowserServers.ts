import dns from "node:dns/promises";
import { logger } from "../utils/logger.js";

export const FALLBACK_RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
];

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function orderServers(preferred: string | undefined, discovered: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of [preferred, ...discovered, ...FALLBACK_RADIO_BROWSER_SERVERS]) {
    if (!raw) {
      continue;
    }
    const url = stripTrailingSlash(raw);
    if (!url.startsWith("https://") || seen.has(url)) {
      continue;
    }
    seen.add(url);
    ordered.push(url);
  }
  return ordered;
}

export async function discoverRadioBrowserServers(): Promise<string[]> {
  try {
    const ips = await dns.resolve4("all.api.radio-browser.info");
    const hosts: string[] = [];
    for (const ip of ips) {
      try {
        const names = await dns.reverse(ip);
        for (const name of names) {
          hosts.push(`https://${name.replace(/\.$/, "")}`);
        }
      } catch {
        // reverse DNS is optional
      }
    }
    if (hosts.length > 0) {
      logger.info({ hosts }, "Discovered Radio Browser mirrors");
      return hosts;
    }
  } catch (error) {
    logger.warn({ err: error }, "Radio Browser DNS discovery failed");
  }
  return [...FALLBACK_RADIO_BROWSER_SERVERS];
}
