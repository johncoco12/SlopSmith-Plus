import fp from "fastify-plugin";
import { z } from "zod";
import type { LibraryService } from "../../services/LibraryService.js";
import type { LoopService } from "../../services/LoopService.js";

const ToggleFavoriteSchema = z.object({
  trackId: z.string().min(1),
  profileId: z.number().int().min(1),
});

const GetLoopsSchema = z.object({
  trackId: z.coerce.number().int().min(1),
  profileId: z.coerce.number().int().min(1),
});

const CreateLoopSchema = z.object({
  trackId: z.number().int().min(1),
  profileId: z.number().int().min(1),
  name: z.string().optional(),
  start_time: z.number().finite().min(0),
  end_time: z.number().finite().min(0),
});

export const favoritesRoutes = fp(async function favoritesRoutes(fastify) {
  const library = fastify.library as LibraryService;
  const loops = fastify.loops as LoopService;

  fastify.post("/api/favorites/toggle", async (req) => {
    const { trackId, profileId } = ToggleFavoriteSchema.parse(req.body);
    const isFavorite = await library.toggleFavorite(trackId, profileId);
    return { trackId, favorite: isFavorite };
  });

  fastify.get("/api/loops", async (req) => {
    const { trackId, profileId } = GetLoopsSchema.parse(req.query);
    const items = await loops.getForTrack(trackId, profileId);
    return { loops: items };
  });

  fastify.post("/api/loops", async (req, reply) => {
    const body = CreateLoopSchema.parse(req.body);
    const loop = await loops.create(body.trackId, body.profileId, body.name, body.start_time, body.end_time);
    return reply.code(201).send(loop);
  });

  fastify.delete("/api/loops/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().min(1) }).parse(req.params);
    await loops.delete(id);
    return reply.code(204).send();
  });
});