import fp from "fastify-plugin";
import { z } from "zod";
import type { HighwayService } from "../../services/HighwayService.js";

export const highwayRoutes = fp(async function highwayRoutes(fastify) {
  const highway = fastify.highway as HighwayService;

  fastify.get("/api/tracks/:trackId/highway", async (req, reply) => {
    const { trackId } = z.object({ trackId: z.string().min(1) }).parse(req.params);
    const { arrangement } = z.object({ arrangement: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    try {
      return await highway.getHighwayData(trackId, arrangement);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "Not found" });
    }
  });
});
