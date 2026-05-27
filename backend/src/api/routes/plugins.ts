import fp from "fastify-plugin";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { PluginRegistry } from "../../infrastructure/plugins/PluginRegistry.js";
import type { PluginService } from "../../services/PluginService.js";
import { requireAuthAsync, requirePermission } from "../middleware/auth.js";
import { Permissions } from "../../domain/models/permission.js";

const MIME: Record<string, string> = {
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".wasm": "application/wasm",
};

export const pluginRoutes = fp(async function pluginRoutes(fastify) {
  const plugins = fastify.plugins as PluginRegistry;
  const pluginSvc = fastify.pluginSvc as PluginService;

  // List all plugins with lifecycle state
  fastify.get("/api/plugins", { preHandler: [requireAuthAsync()] }, async () => {
    return { plugins: pluginSvc.getAll() };
  });

  // Single plugin detail
  fastify.get("/api/plugins/:id", { preHandler: [requireAuthAsync()] }, async (req) => {
    const { id } = req.params as { id: string };
    return pluginSvc.getById(id);
  });

  // Serve a file from a plugin directory (public — scripts/modules load before auth)
  // Uses a direct stream rather than reply.sendFile so it works independently of
  // how @fastify/static is configured (decorateReply setting, root path, etc.)
  fastify.get("/api/plugins/:id/file/*", async (req, reply) => {
    const { id } = req.params as { id: string; "*": string };
    const filename = (req.params as { "*": string })["*"];
    const filePath = plugins.resolveFile(id, filename); // validates path traversal
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    return reply.type(contentType).send(fs.createReadStream(filePath));
  });

  // Provider management
  fastify.get(
    "/api/plugins/providers",
    { preHandler: [requireAuthAsync()] },
    async () => pluginSvc.listProviders(),
  );

  fastify.put(
    "/api/plugins/providers/:type/active",
    { preHandler: [requireAuthAsync(), requirePermission(Permissions.MANAGE_SETTINGS)] },
    async (req, reply) => {
      const { type } = req.params as { type: string };
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      pluginSvc.setActiveProvider(type, name);
      return reply.code(200).send({ ok: true });
    },
  );

  // Enable / disable a plugin (persisted across restarts)
  fastify.post("/api/plugins/:id/enable", {
    preHandler: [requireAuthAsync(), requirePermission(Permissions.MANAGE_SETTINGS)],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await pluginSvc.enablePlugin(id);
    reply.code(200).send({ ok: true, restarting: true });
    setTimeout(() => process.exit(0), 300);
  });

  fastify.post("/api/plugins/:id/disable", {
    preHandler: [requireAuthAsync(), requirePermission(Permissions.MANAGE_SETTINGS)],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await pluginSvc.disablePlugin(id);
    reply.code(200).send({ ok: true, restarting: true });
    // Give the response time to flush before exiting — Docker restarts the container
    setTimeout(() => process.exit(0), 300);
  });

  fastify.post("/api/admin/restart", {
    preHandler: [requireAuthAsync(), requirePermission(Permissions.MANAGE_SETTINGS)],
  }, async (_req, reply) => {
    reply.code(200).send({ ok: true, restarting: true });
    setTimeout(() => process.exit(0), 300);
  });

  // Plugin settings persistence via PluginData
  fastify.get(
    "/api/plugins/:id/settings",
    { preHandler: [requireAuthAsync()] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const plugin = plugins.getById(id);
      if (!plugin.capabilities.hasSettings || !plugin.manifest.settings?.html) {
        return reply.code(404).send({ error: "Plugin has no settings page" });
      }
      const filePath = plugins.resolveFile(id, plugin.manifest.settings.html);
      return reply.type("text/html; charset=utf-8").send(fs.createReadStream(filePath));
    },
  );
});
