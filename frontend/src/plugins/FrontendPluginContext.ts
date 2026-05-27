import type { Component } from "vue";
import type { PluginEventBus } from "./PluginEventBus.js";
import type { SlotManager, SlotName } from "./SlotManager.js";

export interface FrontendPluginContext {
  readonly pluginId: string;

  events: {
    on(event: string, handler: (detail: unknown) => void): () => void;
    once(event: string, handler: (detail: unknown) => void): void;
    emit(event: string, detail?: unknown): void;
  };

  slots: {
    register(
      slot: SlotName,
      component: Component,
      opts?: { order?: number; props?: Record<string, unknown> },
    ): void;
  };

  api: {
    get<T = unknown>(path: string): Promise<T>;
    post<T = unknown>(path: string, body: unknown): Promise<T>;
    patch<T = unknown>(path: string, body: unknown): Promise<T>;
    delete<T = unknown>(path: string): Promise<T>;
  };
}

function getToken(): string {
  return localStorage.getItem("slopsmith_token") ?? "";
}

async function pluginFetch<T>(
  pluginId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `/api/plugins/${pluginId}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plugin API ${method} ${url} failed (${res.status}): ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : (res.text() as unknown as T);
}

export function createFrontendPluginContext(
  pluginId: string,
  bus: PluginEventBus,
  slots: SlotManager,
): FrontendPluginContext {
  return {
    pluginId,
    events: {
      on: (event, handler) => bus.on(event, handler),
      once: (event, handler) => bus.once(event, handler),
      emit: (event, detail) => bus.emit(event, detail),
    },
    slots: {
      register: (slot, component, opts) => slots.register(pluginId, slot, component, opts),
    },
    api: {
      get: (path) => pluginFetch(pluginId, "GET", path),
      post: (path, body) => pluginFetch(pluginId, "POST", path, body),
      patch: (path, body) => pluginFetch(pluginId, "PATCH", path, body),
      delete: (path) => pluginFetch(pluginId, "DELETE", path),
    },
  };
}
