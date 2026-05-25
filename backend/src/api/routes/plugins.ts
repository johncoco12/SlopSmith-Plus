import fp from "fastify-plugin";
import type { PluginRegistry } from "../../infrastructure/plugins/PluginRegistry.js";

export const pluginRoutes = fp(async function pluginRoutes(fastify) {
  const plugins = fastify.plugins as PluginRegistry;

  fastify.get("/api/plugins", async () => {
    const all = plugins.getAll();
    return {
      plugins: all.map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        bundled: p.bundled,
        capabilities: p.capabilities,
        manifest: p.manifest,
      })),
    };
  });

  fastify.get("/api/plugins/:id/file/*", async (req, reply) => {
    const { id } = req.params as { id: string; "*": string };
    const filename = (req.params as { "*": string })["*"];
    const filePath = plugins.resolveFile(id, filename);
    return reply.sendFile(filePath);
  });
});
