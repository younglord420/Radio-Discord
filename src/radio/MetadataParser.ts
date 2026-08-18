import { isAllowedStreamUrl } from "./playlist.js";
import { logger } from "../utils/logger.js";

export function parseIcyMetadataBlock(block: Buffer | string): string | null {
  const text = typeof block === "string" ? block : block.toString("utf8");
  const match = /StreamTitle='([^']*)'/.exec(text);
  if (!match) {
    return null;
  }
  const title = match[1].trim();
  return title.length > 0 ? title : null;
}

export class MetadataParser {
  constructor(private readonly userAgent: string) {}

  async fetchIcyTitle(url: string, timeoutMs = 5000): Promise<string | null> {
    if (!isAllowedStreamUrl(url)) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Icy-MetaData": "1",
        },
        signal: controller.signal,
      });

      const metaintHeader = res.headers.get("icy-metaint");
      const metaint = metaintHeader ? Number(metaintHeader) : NaN;
      if (!res.body || !Number.isFinite(metaint) || metaint <= 0) {
        return null;
      }

      return await readIcyTitle(res.body, metaint, timeoutMs);
    } catch (error) {
      logger.debug({ err: error, url }, "ICY metadata unavailable");
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readIcyTitle(
  body: ReadableStream<Uint8Array>,
  metaint: number,
  timeoutMs: number,
): Promise<string | null> {
  const reader = body.getReader();
  const deadline = Date.now() + timeoutMs;
  let pending = Buffer.alloc(0);
  let waitingForLength = false;
  let metaLen: number | null = null;
  let audioNeeded = metaint;

  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      pending = Buffer.concat([pending, Buffer.from(value)]);

      while (pending.length > 0) {
        if (metaLen === null && !waitingForLength) {
          if (pending.length < audioNeeded) {
            audioNeeded -= pending.length;
            pending = Buffer.alloc(0);
            break;
          }
          pending = pending.subarray(audioNeeded);
          audioNeeded = metaint;
          waitingForLength = true;
        }

        if (waitingForLength) {
          if (pending.length < 1) {
            break;
          }
          metaLen = pending[0] * 16;
          pending = pending.subarray(1);
          waitingForLength = false;
        }

        if (metaLen === 0) {
          metaLen = null;
          continue;
        }
        if (metaLen === null || pending.length < metaLen) {
          break;
        }
        const block = pending.subarray(0, metaLen);
        pending = pending.subarray(metaLen);
        metaLen = null;
        const title = parseIcyMetadataBlock(block);
        if (title) {
          return title;
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  return null;
}
