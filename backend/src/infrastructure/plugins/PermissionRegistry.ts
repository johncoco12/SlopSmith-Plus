export interface PermissionDefinition {
  readonly name: string;
  readonly description: string;
  readonly pluginId: string;
}

export class PermissionRegistry {
  private readonly definitions = new Map<string, PermissionDefinition>();

  define(pluginId: string, name: string, description: string): void {
    if (this.definitions.has(name)) {
      const existing = this.definitions.get(name)!;
      if (existing.pluginId !== pluginId) {
        throw new Error(
          `Permission "${name}" is already defined by plugin "${existing.pluginId}"`,
        );
      }
      return;
    }
    this.definitions.set(name, { name, description, pluginId });
  }

  list(): PermissionDefinition[] {
    return [...this.definitions.values()];
  }

  listForPlugin(pluginId: string): PermissionDefinition[] {
    return [...this.definitions.values()].filter((d) => d.pluginId === pluginId);
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  unregisterAll(pluginId: string): void {
    for (const [name, def] of this.definitions.entries()) {
      if (def.pluginId === pluginId) {
        this.definitions.delete(name);
      }
    }
  }
}
