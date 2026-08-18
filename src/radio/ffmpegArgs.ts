export function buildFfmpegArgs(url: string, volume: number, userAgent?: string): string[] {
  const vol = Math.max(0, Math.min(1, volume / 100));
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_at_eof",
    "1",
    "-reconnect_delay_max",
    "5",
    "-rw_timeout",
    "15000000",
    "-fflags",
    "+nobuffer+discardcorrupt",
    "-flags",
    "low_delay",
    "-analyzeduration",
    "0",
    "-probesize",
    "32768",
  ];
  if (userAgent) {
    args.push("-user_agent", userAgent);
  }
  args.push(
    "-i",
    url,
    "-vn",
    "-filter:a",
    `volume=${vol.toFixed(2)}`,
    "-acodec",
    "pcm_s16le",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "pipe:1",
  );
  return args;
}
