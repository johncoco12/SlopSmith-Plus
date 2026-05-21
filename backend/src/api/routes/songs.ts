import fp from "fastify-plugin";
import type { SongService } from "../../services/SongService.js";

// find-my-way (Fastify's router) requires wildcards at the end of a route.
// Filenames can contain path separators (e.g. "Artist/Song.psarc"), so we
// use a single `*` wildcard per HTTP method and dispatch by URL suffix.

const MIME: Record<string, string> = {
  ogg: "audio/ogg", opus: "audio/ogg", oga: "audio/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  json: "application/json",
};

function stripSuffix(raw: string, suffix: string): string {
  return raw.slice(0, raw.length - suffix.length);
}

export const songRoutes = fp(async function songRoutes(fastify) {
  const songs = fastify.songs as SongService;

  // GET /api/song/<filename>
  // GET /api/song/<filename>/art
  fastify.get("/api/song/*", async (req, reply) => {
    const raw = (req.params as { "*": string })["*"];

    if (raw.endsWith("/art")) {
      const filename = stripSuffix(raw, "/art");
      const art = songs.getAlbumArt(filename);
      if (!art) return reply.code(404).send();
      reply.header("Content-Type", "image/png");
      return reply.send(art);
    }

    const meta = await songs.getMeta(raw);
    return meta;
  });

  // POST /api/song/<filename>/meta
  // POST /api/song/<filename>/art/upload
  fastify.post("/api/song/*", async (req, reply) => {
    const raw = (req.params as { "*": string })["*"];

    if (raw.endsWith("/art/upload")) {
      const filename = stripSuffix(raw, "/art/upload");
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: "No file provided" });
      const buffer = await data.toBuffer();
      songs.saveAlbumArt(filename, buffer.toString("base64"));
      return { ok: true };
    }

    if (raw.endsWith("/meta")) {
      const filename = stripSuffix(raw, "/meta");
      const body = req.body as Record<string, unknown>;
      if (typeof body?.art === "string") songs.saveAlbumArt(filename, body.art);
      return reply.code(204).send();
    }

    return reply.code(404).send({ error: "Not found" });
  });

  // DELETE /api/song/<filename>
  fastify.delete("/api/song/*", async (req, reply) => {
    const filename = (req.params as { "*": string })["*"];
    await songs.deleteSong(filename);
    return reply.code(204).send();
  });

  // GET /api/sloppak/<filename>/file/<relPath>
  fastify.get("/api/sloppak/*", async (req, reply) => {
    const raw = (req.params as { "*": string })["*"];
    const marker = "/file/";
    const idx = raw.indexOf(marker);
    if (idx === -1) return reply.code(404).send({ error: "Not found" });

    const filename = raw.slice(0, idx);
    const relPath = raw.slice(idx + marker.length);
    const filePath = songs.getSloppakFile(filename, relPath);

    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = MIME[ext];
    if (mimeType) reply.header("Content-Type", mimeType);
    return reply.sendFile(filePath);
  });
});
