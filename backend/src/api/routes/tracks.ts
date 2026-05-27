import fp from "fastify-plugin";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { TrackService } from "../../services/TrackService.js";
import { requireAuth, requireAuthAsync, requirePermission } from "../middleware/auth.js";
import { Permissions } from "../../domain/models/permission.js";

const trackIdParam = z.object({ trackId: z.string().min(1) });

function sendAudioWithRangeSupport(reply: FastifyReply, data: Buffer, mimeType: string, rangeHeader: string | undefined): void {
  const totalSize = data.length;
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
      const clampedEnd = Math.min(end, totalSize - 1);
      const chunk = data.subarray(start, clampedEnd + 1);
      reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${clampedEnd}/${totalSize}`)
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", chunk.length)
        .header("Content-Type", mimeType);
      return void reply.send(chunk);
    }
  }
  reply
    .header("Content-Type", mimeType)
    .header("Accept-Ranges", "bytes")
    .header("Content-Length", totalSize);
  return void reply.send(data);
}
const loopIdParam = z.object({ id: z.coerce.number().int().min(1) });
const getLoopsQuery = z.object({ profileId: z.coerce.number().int().min(1) });

const CreateLoopSchema = z.object({
  name: z.string().max(128).optional(),
  start_time: z.number().finite().min(0),
  end_time: z.number().finite().min(0),
});

const UpdateTrackSchema = z.object({
  trackId: z.string().min(1).optional(),
  artist: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  album: z.string().max(255).optional(),
  year: z.string().max(10).optional(),
  duration: z.number().nonnegative().optional(),
  tuning: z.string().max(64).optional(),
  hasLyrics: z.boolean().optional(),
  format: z.enum(["psarc", "sloppak", "loose"]).optional(),
  tuningName: z.string().max(64).optional(),
  tuningSortKey: z.number().int().optional(),
});

export const trackRoutes = fp(async function trackRoutes(fastify) {
  const tracks = fastify.trackSvc as TrackService;

  // Public — no auth. Returns a random selection of trackIds that have cover art.
  // Used by the profile switcher background mosaic.
  fastify.get("/api/covers", async (req, reply) => {
    const { count } = z.object({
      count: z.coerce.number().int().min(1).max(100).default(30),
    }).parse(req.query);
    const trackIds = await tracks.getCovers(count);
    reply.header("Cache-Control", "public, max-age=60");
    return { trackIds };
  });

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
    sendAudioWithRangeSupport(reply, result.data, result.mimeType, req.headers.range);
  });

  fastify.get("/api/tracks/:trackId/stems/:stemIndex/audio", async (req, reply) => {
    const params = trackIdParam.extend({ stemIndex: z.coerce.number().int().min(0) }).parse(req.params);
    const result = await tracks.getStemAudio(params.trackId, params.stemIndex);
    if (!result) return reply.code(404).send({ error: "No stem audio" });
    sendAudioWithRangeSupport(reply, result.data, result.mimeType, req.headers.range);
  });

  fastify.get("/api/tracks/:trackId/loops", async (req) => {
    const { trackId } = trackIdParam.parse(req.params);
    const { profileId } = getLoopsQuery.parse(req.query);
    const items = await tracks.getLoops(trackId, profileId);
    return { loops: items };
  });

  fastify.post("/api/tracks/:trackId/loops", {
    preHandler: [requireAuthAsync()],
  }, async (req, reply) => {
    const { trackId } = trackIdParam.parse(req.params);
    const session = req.session!;
    const body = CreateLoopSchema.parse(req.body);
    const loop = await tracks.addLoop(trackId, session.profileId, body.name, body.start_time, body.end_time);
    return reply.code(201).send(loop);
  });

  fastify.delete("/api/loops/:id", {
    preHandler: [requireAuthAsync()],
  }, async (req, reply) => {
    const { id } = loopIdParam.parse(req.params);
    await tracks.deleteLoop(id);
    return reply.code(204).send();
  });

  fastify.post("/api/tracks/:trackId", {
    preHandler: [requireAuthAsync(), requirePermission(Permissions.EDIT_TRACKS)],
  }, async (req) => {
    const { trackId } = trackIdParam.parse(req.params);
    const body = UpdateTrackSchema.parse(req.body);
    return tracks.updateTrack(trackId, body);
  });

  fastify.delete("/api/tracks/:trackId", {
    preHandler: [requireAuthAsync(), requirePermission(Permissions.DELETE_TRACKS)],
  }, async (req, reply) => {
    const { trackId } = trackIdParam.parse(req.params);
    await tracks.deleteTrack(trackId);
    return reply.code(204).send();
  });
});