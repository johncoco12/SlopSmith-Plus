import type { PluginContext } from "./PluginContext.js";

export interface PluginModule {
  setup?(ctx: PluginContext): Promise<void> | void;
  teardown?(ctx: PluginContext): Promise<void> | void;
}
