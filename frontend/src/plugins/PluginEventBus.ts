export type FrontendPluginEvent =
  | { type: "song:ready"; detail: unknown }
  | { type: "song:play"; detail: { filename: string } }
  | { type: "song:pause"; detail: { filename: string } }
  | { type: "song:end"; detail: { trackId?: string; score?: number } }
  | { type: "note:hit"; detail: { fret: number; string: number; time: number } }
  | { type: "note:miss"; detail: { fret: number; string: number; time: number } }
  | { type: "plugins:ready"; detail: Record<string, unknown> }
  | { type: "plugin:register"; detail: { id: string } }
  | { type: string; detail?: unknown };

export class PluginEventBus {
  private readonly bus = new EventTarget();

  emit(event: string, detail?: unknown): void {
    this.bus.dispatchEvent(new CustomEvent(event, { detail }));
  }

  on(event: string, handler: (detail: unknown) => void): () => void {
    const wrapper = (e: Event) => handler((e as CustomEvent).detail);
    this.bus.addEventListener(event, wrapper);
    return () => this.bus.removeEventListener(event, wrapper);
  }

  once(event: string, handler: (detail: unknown) => void): void {
    const wrapper = (e: Event) => handler((e as CustomEvent).detail);
    this.bus.addEventListener(event, wrapper, { once: true });
  }
}

export const pluginEventBus = new PluginEventBus();
