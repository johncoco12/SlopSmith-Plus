import type { HookHandler, HookOptions, HookPayload } from "../../domain/interfaces/plugins/PluginContext.js";

export type HookEvent =
  | "song:load"
  | "song:play"
  | "song:pause"
  | "song:stop"
  | "song:end"
  | "note:hit"
  | "note:miss"
  | "library:scan:start"
  | "library:scan:complete"
  | "library:song:added"
  | "library:song:removed"
  | "server:startup"
  | "server:shutdown"
  | "plugin:loaded"
  | "plugin:errored"
  | (string & {});

interface HookEntry {
  readonly pluginId: string;
  readonly handler: HookHandler;
  readonly phase: "before" | "after";
  readonly priority: number;
}

interface MutablePayload extends HookPayload {
  aborted: boolean;
}

export class HookSystem {
  private readonly hooks = new Map<string, HookEntry[]>();

  register(
    event: string,
    pluginId: string,
    handler: HookHandler,
    opts?: HookOptions,
  ): void {
    const entry: HookEntry = {
      pluginId,
      handler,
      phase: opts?.phase ?? "after",
      priority: opts?.priority ?? 100,
    };
    const list = this.hooks.get(event) ?? [];
    list.push(entry);
    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, list);
  }

  unregister(event: string, pluginId: string, handler: HookHandler): void {
    const list = this.hooks.get(event);
    if (!list) return;
    this.hooks.set(
      event,
      list.filter((e) => !(e.pluginId === pluginId && e.handler === handler)),
    );
  }

  unregisterAll(pluginId: string): void {
    for (const [event, entries] of this.hooks.entries()) {
      this.hooks.set(
        event,
        entries.filter((e) => e.pluginId !== pluginId),
      );
    }
  }

  async emit(event: string, data: Record<string, unknown> = {}): Promise<HookPayload> {
    const payload: MutablePayload = {
      event,
      data: { ...data },
      timestamp: Date.now(),
      aborted: false,
      abort() {
        this.aborted = true;
      },
    };

    const entries = this.hooks.get(event) ?? [];
    const before = entries.filter((e) => e.phase === "before");
    const after = entries.filter((e) => e.phase === "after");

    for (const entry of [...before, ...after]) {
      if (payload.aborted) break;
      try {
        const result = await entry.handler(payload);
        if (result?.data) {
          Object.assign(payload.data, result.data);
        }
      } catch (err) {
        console.error(`[hooks] ${event} handler from plugin "${entry.pluginId}" threw:`, err);
      }
    }

    return payload;
  }
}
