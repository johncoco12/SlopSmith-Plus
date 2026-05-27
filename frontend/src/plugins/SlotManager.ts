import type { Component, InjectionKey } from "vue";
import { inject } from "vue";

export type SlotName =
  | "visualization"
  | "settings-panel"
  | "nav-item"
  | "player-overlay"
  | "player-controls"
  | "library-card-badge"
  | "diagnostics-panel"
  | (string & {});

export interface SlotRegistration {
  readonly pluginId: string;
  readonly slot: SlotName;
  readonly component: Component;
  readonly props?: Record<string, unknown>;
  readonly order: number;
}

export class SlotManager {
  private readonly slots = new Map<SlotName, SlotRegistration[]>();

  register(
    pluginId: string,
    slot: SlotName,
    component: Component,
    opts?: { props?: Record<string, unknown>; order?: number },
  ): void {
    const list = this.slots.get(slot) ?? [];
    list.push({ pluginId, slot, component, props: opts?.props, order: opts?.order ?? 100 });
    list.sort((a, b) => a.order - b.order);
    this.slots.set(slot, list);
  }

  get(slot: SlotName): SlotRegistration[] {
    return this.slots.get(slot) ?? [];
  }

  unregister(pluginId: string): void {
    for (const [slot, list] of this.slots.entries()) {
      this.slots.set(
        slot,
        list.filter((r) => r.pluginId !== pluginId),
      );
    }
  }
}

export const SLOT_MANAGER_KEY: InjectionKey<SlotManager> = Symbol("SlotManager");

export function useSlotManager(): SlotManager {
  const sm = inject(SLOT_MANAGER_KEY);
  if (!sm) throw new Error("SlotManager not provided");
  return sm;
}
