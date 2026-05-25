import fp from "fastify-plugin";
import { z } from "zod";
import type { IProfileService } from "../../domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "../../domain/interfaces/services/IPermissionsService.js";
import { ForbiddenError } from "../../domain/errors.js";
import { DEFAULT_ADMIN_PERMISSIONS } from "../../domain/models/permission.js";

const SetupSchema = z.object({
  name: z.string().min(1).max(64),
  pinCode: z.string().min(4).max(32),
  recoveryPhrase: z.string().min(4).max(128),
  recoveryPhraseHint: z.string().max(128).default(""),
  avatarId: z.number().int().optional(),
});

export const setupRoutes = fp(async function setupRoutes(fastify) {
  const profiles = fastify.profiles as IProfileService;
  const perms = fastify.permissions as IPermissionsService;

  fastify.get("/api/setup", async () => {
    const done = await profiles.isSetup();
    return { setup: done };
  });

  fastify.post("/api/setup", async (req, reply) => {
    const alreadySetup = await profiles.isSetup();
    if (alreadySetup) throw new ForbiddenError("Setup has already been completed");

    const input = SetupSchema.parse(req.body);
    const profile = await profiles.createProfile(input);
    await perms.createGroup({
      name: "admin",
      profileIds: [profile.id],
      permissions: DEFAULT_ADMIN_PERMISSIONS,
    });

    return reply.code(201).send(profile);
  });
});