import fp from "fastify-plugin";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "../../config.js";

export const audioRoutes = fp(async function audioRoutes(fastify) {
  fastify.get("/audio/*", async (req, reply) => {
    const filename = (req.params as { "*": string })["*"];

    if (filename.includes("..") || filename.startsWith("/") || filename.includes("\\")) {
      return reply.code(404).send({ error: "not found" });
    }

    const candidate = path.join(config.audioCacheDir, filename);
    if (!candidate.startsWith(config.audioCacheDir + path.sep)) {
      return reply.code(404).send({ error: "not found" });
    }
    if (fs.existsSync(candidate)) {
      return reply.sendFile(candidate);
    }

    return reply.code(404).send({ error: "not found" });
  });

  fastify.get("/api/audio-local-path", async (req, reply) => {
    if (!config.electronMode) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const clientIp = req.socket.remoteAddress ?? "";
    const isLoopback =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1" ||
      clientIp === "localhost";

    if (!isLoopback) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const { url } = z.object({ url: z.string() }).parse(req.query);

    if (!/^\/audio\/[^?#]+$/.test(url)) {
      return reply.code(400).send({ error: "invalid url" });
    }

    const relative = url.slice("/audio/".length);
    if (relative.split("/").includes("..") || relative.startsWith("/") || relative.includes("\\")) {
      return reply.code(400).send({ error: "invalid url" });
    }

    const candidate = path.resolve(config.audioCacheDir, relative);
    if (!candidate.startsWith(path.resolve(config.audioCacheDir) + path.sep)) {
      return reply.code(404).send({ error: "not found" });
    }

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { path: candidate };
    }

    return reply.code(404).send({ error: "not found" });
  });
});
