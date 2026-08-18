import { describe, expect, it } from "vitest";
import {
  extractPlaylistUrls,
  isAllowedStreamUrl,
  isAudioContentType,
  isPrivateIpv4,
  looksLikePlaylist,
} from "../src/radio/playlist.js";

describe("URL validation", () => {
  it("allows http and https public hosts", () => {
    expect(isAllowedStreamUrl("https://stream.pramborsfm.com/live")).toBe(true);
    expect(isAllowedStreamUrl("http://example.com:8000/stream")).toBe(true);
  });

  it("rejects dangerous schemes and local addresses", () => {
    expect(isAllowedStreamUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedStreamUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedStreamUrl("ftp://example.com/x")).toBe(false);
    expect(isAllowedStreamUrl("http://localhost/stream")).toBe(false);
    expect(isAllowedStreamUrl("http://127.0.0.1/stream")).toBe(false);
    expect(isAllowedStreamUrl("http://10.0.0.5/stream")).toBe(false);
    expect(isAllowedStreamUrl("not a url")).toBe(false);
  });

  it("detects private IPv4", () => {
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
  });
});

describe("playlist parsing", () => {
  it("extracts M3U http entries and ignores comments", () => {
    const body = `#EXTM3U
#EXTINF:-1,Prambors
https://example.com/live
http://127.0.0.1/nope
`;
    expect(extractPlaylistUrls(body)).toEqual(["https://example.com/live"]);
  });

  it("extracts PLS FileN entries", () => {
    const body = `[playlist]
NumberOfEntries=1
File1=https://radio.example.com/stream.mp3
Title1=Prambors
`;
    expect(extractPlaylistUrls(body)).toEqual(["https://radio.example.com/stream.mp3"]);
  });

  it("detects playlist content types and bodies", () => {
    expect(looksLikePlaylist("audio/x-mpegurl", "https://x/a", "")).toBe(true);
    expect(looksLikePlaylist("audio/mpeg", "https://x/a.m3u8", "")).toBe(true);
    expect(looksLikePlaylist("audio/mpeg", "https://x/a", "#EXTM3U\nhttps://x")).toBe(true);
    expect(looksLikePlaylist("audio/mpeg", "https://x/a", "ID3")).toBe(false);
  });

  it("treats icy-br as audio even without content-type", () => {
    expect(isAudioContentType(null, "128")).toBe(true);
    expect(isAudioContentType("audio/mpeg", null)).toBe(true);
    expect(isAudioContentType("text/html", null)).toBe(false);
  });
});
