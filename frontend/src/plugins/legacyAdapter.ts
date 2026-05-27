import type { PluginEventBus } from "./PluginEventBus.js";

export function installLegacyAdapter(bus: PluginEventBus): void {
  const existing = window.slopsmith;
  window.slopsmith = Object.assign(window.slopsmith ?? new EventTarget(), {
    emit(event: string, detail?: unknown) {
      bus.emit(event, detail);
    },
    on(event: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions) {
      bus.on(event, (d) => {
        if (typeof fn === "function") {
          fn(new CustomEvent(event, { detail: d }));
        } else {
          fn.handleEvent(new CustomEvent(event, { detail: d }));
        }
      });
    },
    off() {
      // best-effort — legacy callers don't unsubscribe cleanly
    },
  }) as typeof window.slopsmith;

  // Re-attach any keys that were on the original object (e.g. diagnostics)
  if (existing) {
    for (const key of Object.keys(existing)) {
      if (!(key in window.slopsmith!)) {
        (window.slopsmith as Record<string, unknown>)[key] =
          (existing as Record<string, unknown>)[key];
      }
    }
  }
}
