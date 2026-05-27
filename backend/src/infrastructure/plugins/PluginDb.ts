import type { PluginDb } from "../../domain/interfaces/plugins/PluginContext.js";
import { prisma } from "../db/client.js";

export class PluginDbStore implements PluginDb {
  constructor(private readonly pluginId: string) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await (prisma as any).pluginData.findUnique({
      where: { pluginId_key: { pluginId: this.pluginId, key } },
    });
    return (row?.value as T) ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await (prisma as any).pluginData.upsert({
      where: { pluginId_key: { pluginId: this.pluginId, key } },
      create: { pluginId: this.pluginId, key, value },
      update: { value },
    });
  }

  async delete(key: string): Promise<void> {
    await (prisma as any).pluginData.deleteMany({
      where: { pluginId: this.pluginId, key },
    });
  }

  async list(): Promise<{ key: string; value: unknown }[]> {
    const rows = await (prisma as any).pluginData.findMany({
      where: { pluginId: this.pluginId },
      select: { key: true, value: true },
    });
    return rows;
  }
}

export class PluginDbFactory {
  forPlugin(pluginId: string): PluginDb {
    return new PluginDbStore(pluginId);
  }

  async purgePlugin(pluginId: string): Promise<void> {
    await (prisma as any).pluginData.deleteMany({ where: { pluginId } });
  }
}
