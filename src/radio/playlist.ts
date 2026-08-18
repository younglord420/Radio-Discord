const PLAYLIST_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
  "audio/x-scpls",
  "text/plain",
  "application/pls+xml",
];

const AUDIO_HINTS = [
  "audio/",
  "application/ogg",
  "application/octet-stream",
  "video/mp2t",
];

export function isAllowedStreamUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost")
  ) {
    return false;
  }

  if (isPrivateIpv4(host)) {
    return false;
  }

  return true;
}

export function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) {
    return false;
  }
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  return false;
}

export function extractPlaylistUrls(body: string): string[] {
  const urls: string[] = [];
  const lines = body.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fileMatch = /^File\d+=(.+)$/i.exec(line);
    if (fileMatch) {
      const value = fileMatch[1].trim();
      if (isAllowedStreamUrl(value)) {
        urls.push(value);
      }
      continue;
    }

    if (isAllowedStreamUrl(line)) {
      urls.push(line);
    }
  }

  return urls;
}

export function looksLikePlaylist(contentType: string | null, url: string, bodyPreview: string): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (PLAYLIST_TYPES.includes(type)) {
    return true;
  }
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".m3u") || lowerUrl.endsWith(".m3u8") || lowerUrl.endsWith(".pls")) {
    return true;
  }
  const preview = bodyPreview.trim();
  if (preview.startsWith("#EXTM3U") || preview.startsWith("[playlist]")) {
    return true;
  }
  return false;
}

export function isAudioContentType(contentType: string | null, icyBr: string | null): boolean {
  if (icyBr) {
    return true;
  }
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!type) {
    return false;
  }
  return AUDIO_HINTS.some((hint) => type.startsWith(hint) || type === hint);
}

export { PLAYLIST_TYPES, AUDIO_HINTS };
