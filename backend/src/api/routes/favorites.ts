import fp from "fastify-plugin";
import { z } from "zod";
import type { LibraryService } from "../../services/LibraryService.js";
import { requireAuthAsync } from "../middleware/auth.js";

const ToggleFavoriteSchema = z.object({
  trackId: z.string().min(1),
  profileId: z.number().int().min(1),
});

export const favoritesRoutes = fp(async function favoritesRoutes(fastify) {
  const library = fastify.library;

  fastify.post("/api/favorites/toggle", { preHandler: [requireAuthAsync()] }, async (req) => {
    const { trackId, profileId } = ToggleFavoriteSchema.parse(req.body);
    const isFavorite = await library.toggleFavorite(trackId, profileId);
    return { trackId, favorite: isFavorite };
  });
});