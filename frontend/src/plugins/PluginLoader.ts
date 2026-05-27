import type { Plugin } from "@/types";
import type { PluginEventBus } from "./PluginEventBus.js";
import type { SlotManager } from "./SlotManager.js";
import { createFrontendPluginContext } from "./FrontendPluginContext.js";

const pluginComponents = new Map<string, unknown>();

export function getPluginComponent(pluginId: string): unknown | undefined {
  return pluginComponents.get(pluginId);
}

export async function loadPlugin(
  plugin: Plugin,
  bus: PluginEventBus,
  slots: SlotManager,
): Promise<void> {
  if (plugin.state === 'disabled') return;
  try {
    if (plugin.has_script && plugin.script) {
      await loadScript(`/api/plugins/${plugin.id}/file/${plugin.script}?v=${plugin.version ?? 0}`);
    }

    if (plugin.component) {
      const url = `/api/plugins/${plugin.id}/file/${plugin.component}?v=${plugin.version ?? 0}`;
      const mod = await import(/* @vite-ignore */ url);
      const ctx = createFrontendPluginContext(plugin.id, bus, slots);
      if (typeof mod.setup === "function") {
        await mod.setup(ctx);
      }
      if (mod.default) {
        pluginComponents.set(plugin.id, mod.default);
      }
    }

    bus.emit("plugin:register", { id: plugin.id });
  } catch (err) {
    console.warn(`[Plugin] ${plugin.id} failed to load:`, err);
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => {
      console.warn(`[Plugin] script failed to load: ${src}`);
      reject(new Error(`Script load failed: ${src}`));
    };
    document.head.appendChild(el);
  });
}
