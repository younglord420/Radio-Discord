import { logger } from "../utils/logger.js";
import {
  extractPlaylistUrls,
  isAllowedStreamUrl,
  isAudioContentType,
  looksLikePlaylist,
} from "./playlist.js";

export class StreamUnavailableError extends Error {
  override readonly name = "StreamUnavailableError";
  constructor(message = "Stream unavailable") {
    super(message);
  }
}

export interface ProbeResult {
  url: string;
  contentType: string | null;
  ok: boolean;
}

const PROBE_TIMEOUT_MS = 8000;
const MAX_BODY = 64 * 1024;

export class StationValidator {
  constructor(private readonly userAgent: string) {}

  async resolvePlaybackUrl(rawUrl: string): Promise<string> {
    if (!isAllowedStreamUrl(rawUrl)) {
      throw new StreamUnavailableError("Invalid stream URL");
    }
    const probe = await this.probe(rawUrl);
    if (!probe.ok) {
      throw new StreamUnavailableError();
    }
    return probe.url;
  }

  async probe(url: string, depth = 0): Promise<ProbeResult> {
    if (!isAllowedStreamUrl(url)) {
      return { url, contentType: null, ok: false };
    }
    if (depth > 3) {
      return { url, contentType: null, ok: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": this.userAgent,
          "Icy-MetaData": "1",
          Range: "bytes=0-2047",
        },
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type");
      const icyBr = res.headers.get("icy-br") ?? res.headers.get("ice-audio-info");
      const finalUrl = res.url || url;

      if (!res.ok && res.status !== 206) {
        logger.warn({ url, status: res.status }, "Stream probe failed");
        return { url: finalUrl, contentType, ok: false };
      }

      const buf = await readLimited(res, MAX_BODY);
      const preview = buf.toString("utf8");

      if (looksLikePlaylist(contentType, finalUrl, preview)) {
        const next = extractPlaylistUrls(preview)[0];
        if (!next) {
          return { url: finalUrl, contentType, ok: false };
        }
        logger.debug({ from: finalUrl, to: next }, "Resolved playlist entry");
        return this.probe(next, depth + 1);
      }

      if (isAudioContentType(contentType, icyBr) || looksLikeMediaBytes(buf)) {
        return { url: finalUrl, contentType, ok: true };
      }

      if (res.ok || res.status === 206) {
        return { url: finalUrl, contentType, ok: true };
      }

      return { url: finalUrl, contentType, ok: false };
    } catch (error) {
      logger.warn({ err: error, url }, "Stream probe error");
      return { url, contentType: null, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readLimited(res: Response, max: number): Promise<Buffer> {
  if (!res.body) {
    return Buffer.alloc(0);
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      size += chunk.length;
      if (size >= 2048) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  return Buffer.concat(chunks);
}

function looksLikeMediaBytes(buf: Buffer): boolean {
  if (buf.length < 3) {
    return false;
  }
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return true; // ID3
  }
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return true; // MPEG frame sync
  }
  if (buf.subarray(0, 4).toString("ascii") === "OggS") {
    return true;
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    return true;
  }
  return false;
}
