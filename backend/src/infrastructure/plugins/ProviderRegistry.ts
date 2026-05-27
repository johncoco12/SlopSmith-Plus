export class ProviderRegistry {
  private readonly providers = new Map<string, Map<string, unknown>>();
  private readonly active = new Map<string, string>();
  private readonly ownership = new Map<string, string>();

  register<T>(type: string, name: string, provider: T, pluginId?: string): void {
    if (!this.providers.has(type)) {
      this.providers.set(type, new Map());
    }
    this.providers.get(type)!.set(name, provider);
    if (!this.active.has(type)) {
      this.active.set(type, name);
    }
    if (pluginId) {
      this.ownership.set(`${type}:${name}`, pluginId);
    }
  }

  get<T>(type: string): T | null {
    const name = this.active.get(type);
    if (!name) return null;
    return (this.providers.get(type)?.get(name) as T) ?? null;
  }

  getByName<T>(type: string, name: string): T | null {
    return (this.providers.get(type)?.get(name) as T) ?? null;
  }

  setActive(type: string, name: string): void {
    if (!this.providers.get(type)?.has(name)) {
      throw new Error(`Provider "${name}" not registered for type "${type}"`);
    }
    this.active.set(type, name);
  }

  list(type: string): { name: string; active: boolean }[] {
    const map = this.providers.get(type);
    if (!map) return [];
    const activeName = this.active.get(type);
    return [...map.keys()].map((name) => ({ name, active: name === activeName }));
  }

  listTypes(): string[] {
    return [...this.providers.keys()];
  }

  unregisterAll(pluginId: string): void {
    for (const [key, owner] of this.ownership.entries()) {
      if (owner !== pluginId) continue;
      const [type, name] = key.split(":");
      this.providers.get(type)?.delete(name);
      this.ownership.delete(key);
      if (this.active.get(type) === name) {
        const remaining = [...(this.providers.get(type)?.keys() ?? [])];
        if (remaining.length > 0) {
          this.active.set(type, remaining[0]);
        } else {
          this.active.delete(type);
        }
      }
    }
  }
}
