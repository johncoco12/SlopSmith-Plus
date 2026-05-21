import fp from "fastify-plugin";
import { z } from "zod";
import type { LibraryQuery, SortField } from "../../domain/models/library.js";
import type { LibraryService } from "../../services/LibraryService.js";
import type { ScannerService } from "../../services/ScannerService.js";

const LibraryQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z
    .enum(["artist", "artist-desc", "title", "title-desc", "recent", "tuning", "year", "year-desc"])
    .default("artist"),
  favorites: z.coerce.number().int().transform(Boolean).default(0),
  format: z.enum(["psarc", "sloppak", "loose"]).optional(),
  arrangements_has: z.string().optional(),
  arrangements_lacks: z.string().optional(),
  stems_has: z.string().optional(),
  stems_lacks: z.string().optional(),
  has_lyrics: z.enum(["0", "1"]).optional(),
  tunings: z.string().optional(),
});

function csvList(value: string | undefined): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export const libraryRoutes = fp(async function libraryRoutes(fastify) {
  const library = fastify.library;
  const scanner = fastify.scanner;

  fastify.get("/api/library", async (req) => {
    const q = LibraryQuerySchema.parse(req.query);
    const query: LibraryQuery = {
      q: q.q,
      page: q.page,
      size: q.size,
      sort: q.sort as SortField,
      favoritesOnly: q.favorites,
      format: q.format,
      arrangementsHas: csvList(q.arrangements_has),
      arrangementsLacks: csvList(q.arrangements_lacks),
      stemsHas: csvList(q.stems_has),
      stemsLacks: csvList(q.stems_lacks),
      hasLyrics: q.has_lyrics === "1" ? true : q.has_lyrics === "0" ? false : undefined,
      tunings: csvList(q.tunings),
    };
    const result = await library.search(query);
    return { songs: result.items, total: result.total, page: result.page, size: result.size };
  });

  fastify.get("/api/library/artists", async (req) => {
    const q = z.object({
      q: z.string().optional(),
      letter: z.string().max(2).optional(),
      page: z.coerce.number().int().min(1).default(1),
      size: z.coerce.number().int().min(1).max(50).default(20),
      favorites: z.coerce.number().int().transform(Boolean).default(0),
    }).parse(req.query);

    const result = await library.artists({
      q: q.q,
      letter: q.letter,
      page: q.page,
      size: q.size,
      favoritesOnly: q.favorites,
    });
    return { artists: result.items, total: result.total, page: result.page, size: result.size };
  });

  fastify.get("/api/library/stats", async () => library.stats());

  fastify.get("/api/library/tuning-names", async () => library.tuningNames());

  fastify.get("/api/scan-status", async () => scanner.getStatus());

  fastify.post("/api/rescan", async (_req, reply) => {
    scanner.scan(false).catch(() => undefined);
    return reply.code(202).send({ ok: true });
  });

  fastify.post("/api/rescan/full", async (_req, reply) => {
    scanner.scan(true).catch(() => undefined);
    return reply.code(202).send({ ok: true });
  });

  fastify.get("/api/startup-status", async () => ({
    stage: "ready",
    plugins_loaded: true,
    scan_running: scanner.getStatus().running,
  }));

  fastify.get("/api/startup-status/stream", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const emit = (data: unknown) =>
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    emit({ stage: "ready", plugins_loaded: true });

    const interval = setInterval(() => {
      const status = scanner.getStatus();
      emit({ stage: status.stage, scan: status });
      if (!status.running) {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    req.raw.on("close", () => clearInterval(interval));
  });
});
