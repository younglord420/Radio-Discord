export const POPULAR_DIAL_LIMIT = 40;

export type DialDirection = -1 | 1;

export function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Cycle Prev/Next through a station uuid list. Wraps at both ends. */
export function nextInDial(
  ids: string[],
  currentId: string | undefined,
  direction: DialDirection,
): string | undefined {
  const unique = uniqueIds(ids);
  if (unique.length === 0) {
    return undefined;
  }
  if (unique.length === 1) {
    return unique[0];
  }
  const idx = currentId ? unique.indexOf(currentId) : -1;
  if (idx === -1) {
    return direction === 1 ? unique[0] : unique[unique.length - 1];
  }
  return unique[(idx + direction + unique.length) % unique.length];
}

export class StationDialStore {
  private readonly dials = new Map<string, string[]>();

  set(guildId: string, ids: string[]): void {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return;
    }
    this.dials.set(guildId, unique);
  }

  get(guildId: string): string[] | undefined {
    return this.dials.get(guildId);
  }

  clear(guildId: string): void {
    this.dials.delete(guildId);
  }
}
