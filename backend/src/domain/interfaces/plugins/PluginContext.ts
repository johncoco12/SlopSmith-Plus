import type { FastifyRequest, FastifyReply } from "fastify";
import type { WebSocket } from "@fastify/websocket";

export interface PluginConfig {
  readonly configDir: string;
  readonly pluginsBuiltinDir: string;
  readonly pluginsUserDir?: string;
  readonly version: string;
  readonly env: "development" | "production";
}

export interface HookOptions {
  readonly phase?: "before" | "after";
  readonly priority?: number;
}

export interface HookPayload {
  readonly event: string;
  readonly data: Record<string, unknown>;
  readonly timestamp: number;
  abort(): void;
}

export interface HookResult {
  readonly data?: Record<string, unknown>;
}

export type HookHandler = (
  payload: HookPayload,
) => Promise<HookResult | void> | HookResult | void;

export type RouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown> | unknown;

export type WSHandler = (
  socket: WebSocket,
  request: FastifyRequest,
) => Promise<void> | void;

export interface PluginRouteHandle {
  register(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    path: string,
    handler: RouteHandler,
    opts?: { requirePermission?: string },
  ): void;
  ws(path: string, handler: WSHandler): void;
}

export interface PluginDb {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<{ key: string; value: unknown }[]>;
}

export interface PluginPermissionHandle {
  define(name: string, description: string): void;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly pluginDir: string;
  readonly config: Readonly<PluginConfig>;
  hooks: {
    on(event: string, handler: HookHandler, options?: HookOptions): void;
    once(event: string, handler: HookHandler): void;
    off(event: string, handler: HookHandler): void;
  };
  routes: PluginRouteHandle;
  providers: {
    register<T>(type: string, name: string, provider: T): void;
    get<T>(type: string): T | null;
    getByName<T>(type: string, name: string): T | null;
  };
  permissions: PluginPermissionHandle;
  db: PluginDb;
  logger: {
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
    error(msg: string, data?: Record<string, unknown>): void;
  };
}
