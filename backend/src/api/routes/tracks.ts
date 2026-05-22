import fp from "fastify-plugin";
import { z } from "zod";
import type { TrackService } from "../../services/TrackService.js";
import { requireAuth } from "../middleware/auth.js";

const trackIdParam = z.object({ trackId: z.string().min(1) });
const loopIdParam = z.object({ id: z.coerce.number().int().min(1) });
const getLoopsQuery = z.object({ profileId: z.coerce.number().int().min(1) });

const CreateLoopSchema = z.object({
  name: z.string().max(128).optional(),
  start_time: z.number().finite().min(0),
  end_time: z.number().finite().min(0),
});

export const trackRoutes = fp(async function trackRoutes(fastify) {
  const tracks = fastify.trackSvc as TrackService;

  fastify.get("/api/tracks/:trackId", async (req) => {
    const { trackId } = trackIdParam.parse(req.params);
    return tracks.getTrack(trackId);
  });

  fastify.get("/api/tracks/:trackId/data", async (req) => {
    const { trackId } = trackIdParam.parse(req.params);
    return tracks.getTrackData(trackId);
  });

  fastify.get("/api/tracks/:trackId/stems", async (req) => {
    const { trackId } = trackIdParam.parse(req.params);
    const stems = await tracks.getStems(trackId);
    return { stems };
  });

  fastify.get("/api/tracks/:trackId/cover", async (req, reply) => {
    const { trackId } = trackIdParam.parse(req.params);
    const result = await tracks.getCoverArt(trackId);
    if (!result) return reply.code(404).send({ error: "No cover art" });
    reply.header("Content-Type", result.mimeType);
    return reply.send(result.data);
  });

  fastify.get("/api/tracks/:trackId/audio", async (req, reply) => {
    const { trackId } = trackIdParam.parse(req.params);
    const result = await tracks.getAudio(trackId);
    if (!result) return reply.code(404).send({ error: "No audio" });
    reply.header("Content-Type", result.mimeType);
    return reply.send(result.data);
  });

  fastify.get("/api/tracks/:trackId/stems/:stemIndex/audio", async (req, reply) => {
    const params = trackIdParam.extend({ stemIndex: z.coerce.number().int().min(0) }).parse(req.params);
    const result = await tracks.getStemAudio(params.trackId, params.stemIndex);
    if (!result) return reply.code(404).send({ error: "No stem audio" });
    reply.header("Content-Type", result.mimeType);
    return reply.send(result.data);
  });

  fastify.get("/api/tracks/:trackId/loops", async (req) => {
    const { trackId } = trackIdParam.parse(req.params);
    const { profileId } = getLoopsQuery.parse(req.query);
    const items = await tracks.getLoops(trackId, profileId);
    return { loops: items };
  });

  fastify.post("/api/tracks/:trackId/loops", {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { trackId } = trackIdParam.parse(req.params);
    const session = req.session!;
    const body = CreateLoopSchema.parse(req.body);
    const loop = await tracks.addLoop(trackId, session.profileId, body.name, body.start_time, body.end_time);
    return reply.code(201).send(loop);
  });

  fastify.delete("/api/loops/:id", {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id } = loopIdParam.parse(req.params);
    await tracks.deleteLoop(id);
    return reply.code(204).send();
  });
});