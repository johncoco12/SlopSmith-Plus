import fp from "fastify-plugin";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import type { ImportFormat } from "../../domain/models/import.js";
import type { ImportService } from "../../services/ImportService.js";
import { requireAuth, requireAuthAsync, requirePermission } from "../middleware/auth.js";
import { Permissions } from "../../domain/models/permission.js";

const VALID_EXTENSIONS = new Set([".psarc", ".sloppak"]);

function detectFormat(filename: string): ImportFormat | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".psarc") return "psarc";
  if (ext === ".sloppak") return "sloppak";
  return null;
}

export const importRoutes = fp(async function importRoutes(fastify) {
  const importService = fastify.imports as ImportService;

  fastify.post("/api/import/upload", {
    preHandler: [requireAuthAsync(), requirePermission(Permissions.UPLOAD)],
  }, async (req, reply) => {
    const parts = req.files({ limits: { fileSize: 256 * 1024 * 1024 } });
    const session = req.session!;
    const dlcDir = process.env.DLC_DIR;
    if (!dlcDir) return reply.code(500).send({ error: "DLC_DIR not configured" });

    const results: { filename: string; jobId: string; status: string; format: string }[] = [];

    for await (const data of parts) {
      const filename = data.filename;
      const format = detectFormat(filename);
      if (!format) continue;

      const destPath = path.join(dlcDir, filename);
      if (!destPath.startsWith(path.resolve(dlcDir))) continue;

      await fs.mkdir(dlcDir, { recursive: true });
      const buffer = await data.toBuffer();
      await fs.writeFile(destPath, buffer);

      const job = importService.enqueue(filename, session.profileId, format);
      results.push({
        jobId: job.id,
        status: job.status,
        filename: job.filename,
        format: job.format,
      });
    }

    if (results.length === 0) {
      return reply.code(400).send({ error: "No valid files provided. Accepted: .psarc, .sloppak" });
    }

    return reply.code(202).send({ jobs: results });
  });

  fastify.get("/api/import/status", {
    preHandler: [requireAuthAsync()],
  }, async () => {
    const jobs = importService.getAllJobs();
    return { jobs };
  });

  fastify.get("/api/import/status/:jobId", {
    preHandler: [requireAuthAsync()],
  }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params);
    const job = importService.getStatus(jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    const result = importService.getResult(jobId);
    return { ...job, result };
  });
});