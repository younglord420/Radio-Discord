export class SessionRegistry<T> {
  private readonly sessions = new Map<string, T>();

  get(guildId: string): T | undefined {
    return this.sessions.get(guildId);
  }

  set(guildId: string, session: T): void {
    this.sessions.set(guildId, session);
  }

  delete(guildId: string): boolean {
    return this.sessions.delete(guildId);
  }

  has(guildId: string): boolean {
    return this.sessions.has(guildId);
  }

  values(): IterableIterator<T> {
    return this.sessions.values();
  }

  entries(): IterableIterator<[string, T]> {
    return this.sessions.entries();
  }

  get size(): number {
    return this.sessions.size;
  }

  clear(): void {
    this.sessions.clear();
  }
}
