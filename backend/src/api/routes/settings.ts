import fp from "fastify-plugin";
import { z } from "zod";
import type { SettingsService } from "../../services/SettingsService.js";
import type { ScannerService } from "../../services/ScannerService.js";

const SettingsPatchSchema = z.object({
  dlc_dir: z.string().optional(),
  psarc_platform: z.enum(["both", "pc", "mac"]).optional(),
  default_arrangement: z.enum(["Lead", "Rhythm", "Bass", "Combo"]).optional(),
  master_difficulty: z.number().int().min(0).max(100).optional(),
  av_offset_ms: z.number().min(-1000).max(1000).optional(),
  demucs_server_url: z.string().optional(),
});

export const settingsRoutes = fp(async function settingsRoutes(fastify) {
  const settings = fastify.settings as SettingsService;
  const scanner = fastify.scanner as ScannerService;

  fastify.get("/api/settings", async () => settings.asApiResponse());

  fastify.post("/api/settings", async (req) => {
    const body = SettingsPatchSchema.parse(req.body);
    settings.save({
      dlcDir: body.dlc_dir,
      psarcPlatform: body.psarc_platform,
      defaultArrangement: body.default_arrangement,
      masterDifficulty: body.master_difficulty,
      avOffsetMs: body.av_offset_ms,
      demucsServerUrl: body.demucs_server_url,
    });

    if (body.dlc_dir !== undefined) {
      scanner.scan(true).catch(() => undefined);
    }

    return settings.asApiResponse();
  });

  fastify.get("/api/settings/export", async (_req, reply) => {
    const bundle = settings.exportBundle();
    const filename = `slopsmith-settings-${new Date().toISOString().slice(0, 10)}.json`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return bundle;
  });

  fastify.post("/api/settings/import", async (req, reply) => {
    const bundle = req.body as Record<string, unknown>;
    if (!bundle || typeof bundle !== "object") {
      return reply.code(400).send({ ok: false, error: "bundle must be a JSON object" });
    }
    const result = settings.importBundle(bundle);
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    return result;
  });
});
