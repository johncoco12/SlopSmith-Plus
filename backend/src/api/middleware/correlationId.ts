import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { v4 as uuidv4 } from "uuid";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export const correlationId = fp(async function correlationId(fastify) {
  fastify.addHook("onRequest", async (req) => {
    const header = req.headers["x-correlation-id"];
    req.correlationId = typeof header === "string" ? header : uuidv4();
  });

  fastify.addHook("onSend", async (req, reply) => {
    reply.header("x-correlation-id", req.correlationId);
  });
} satisfies FastifyPluginAsync);
