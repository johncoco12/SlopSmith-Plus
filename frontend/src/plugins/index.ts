import type { App } from "vue";
import { pluginEventBus } from "./PluginEventBus.js";
import { SlotManager, SLOT_MANAGER_KEY } from "./SlotManager.js";
import { installLegacyAdapter } from "./legacyAdapter.js";

export { pluginEventBus } from "./PluginEventBus.js";
export { useSlotManager, SLOT_MANAGER_KEY } from "./SlotManager.js";
export { getPluginComponent, loadPlugin } from "./PluginLoader.js";

export const slotManager = new SlotManager();

export function installPluginSystem(app: App): void {
  installLegacyAdapter(pluginEventBus);
  app.provide(SLOT_MANAGER_KEY, slotManager);
}
