import { buildServer } from "./server.js";
import { config } from "./config.js";

const fastify = await buildServer();

try {
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info("Slopsmith backend listening on %s:%d", config.host, config.port);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
