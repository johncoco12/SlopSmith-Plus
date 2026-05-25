import fp from "fastify-plugin";
import os from "node:os";
import { z } from "zod";

export const diagnosticsRoutes = fp(async function diagnosticsRoutes(fastify) {
  fastify.get("/api/diagnostics/hardware", async () => {
    const cpus = os.cpus();
    return {
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      cpus: cpus.length,
      cpu_model: cpus[0]?.model ?? "unknown",
      total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
      free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      os_type: os.type(),
      os_release: os.release(),
    };
  });

  fastify.get("/api/diagnostics/preview", async () => {
    return {
      message: "Diagnostics preview — bundle export not yet implemented in Node backend",
      sections: ["hardware", "system"],
    };
  });

  fastify.post("/api/diagnostics/export", async (_req, reply) => {
    return reply.code(501).send({ error: "Diagnostics export not yet implemented" });
  });
});
