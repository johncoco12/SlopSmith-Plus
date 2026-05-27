import fp from "fastify-plugin";
import fs from "node:fs";
import path from "node:path";
import type { SongService } from "../../services/SongService.js";

export const songRoutes = fp(async function songRoutes(fastify) {
  const songs = fastify.songs as SongService;

  fastify.get("/api/song/*", async (req, reply) => {
    const raw = (req.params as { "*": string })["*"];

    if (raw.endsWith("/art")) {
      const filename = raw.slice(0, -"/art".length);
      const art = songs.getAlbumArt(filename);
      if (!art) return reply.code(404).send({ error: "not found" });
      reply.header("Content-Type", "image/png");
      return reply.send(art);
    }

    return songs.getMeta(raw);
  });

  fastify.post("/api/song/*", async (req, reply) => {
    const raw = (req.params as { "*": string })["*"];
    if (!raw.endsWith("/meta")) return reply.code(404).send({ error: "not found" });
    const filename = raw.slice(0, -"/meta".length);
    const body = (req.body as Record<string, unknown>) ?? {};
    if (typeof body.art === "string") songs.saveAlbumArt(filename, body.art);
    return reply.code(204).send();
  });

  fastify.delete("/api/song/*", async (req, reply) => {
    const filename = (req.params as { "*": string })["*"];
    await songs.deleteSong(filename);
    return reply.code(204).send();
  });

  fastify.get("/api/sloppak/*", async (req, reply) => {
    const raw = (req.params as { "*": string })["*"];
    const markerIdx = raw.indexOf("/file/");
    if (markerIdx === -1) return reply.code(404).send({ error: "not found" });
    const filename = raw.slice(0, markerIdx);
    const relPath = raw.slice(markerIdx + "/file/".length);
    const filePath = songs.getSloppakFile(filename, relPath);
    const ext = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = { ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
    reply.header("Content-Type", mime[ext] ?? "application/octet-stream");
    return reply.send(fs.createReadStream(filePath));
  });
});
