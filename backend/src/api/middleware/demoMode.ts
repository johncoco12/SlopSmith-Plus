import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { DemoModeError } from "../../domain/errors.js";
import { config } from "../../config.js";

export const demoMode = fp(async function demoMode(fastify) {
  if (!config.demoMode) return;

  fastify.addHook("preHandler", async (request, reply) => {
    const method = request.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const err = new DemoModeError();
      reply.code(err.statusCode).send({ error: err.message });
    }
  });
} satisfies FastifyPluginAsync);
