import fp from "fastify-plugin";
import { z } from "zod";
import type { ProfileService } from "../../services/ProfileService.js";
import { requireAuth } from "../middleware/auth.js";

const CreateProfileSchema = z.object({
  name: z.string().min(1).max(64),
  pinCode: z.string().min(4).max(32),
  recoveryPhrase: z.string().min(4).max(128),
  recoveryPhraseHint: z.string().max(128).default(""),
  avatarId: z.number().int().optional(),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  avatarId: z.number().int().nullable().optional(),
  pinCode: z.string().min(4).max(32).optional(),
  locked: z.boolean().optional(),
  profileSettings: z.record(z.unknown()).optional(),
});

const LoginSchema = z.object({
  name: z.string().min(1),
  pinCode: z.string().min(1),
});

const RecoverSchema = z.object({
  name: z.string().min(1),
  recoveryPhrase: z.string().min(1),
  newPin: z.string().min(4).max(32),
});

export const profileRoutes = fp(async function profileRoutes(fastify) {
  const profiles = fastify.profiles as ProfileService;

  fastify.get("/api/profiles", async () => {
    return profiles.listProfiles();
  });

  fastify.get("/api/profiles/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const profile = await profiles.getProfile(id);
    return profile;
  });

  fastify.post("/api/profiles", async (req, reply) => {
    const input = CreateProfileSchema.parse(req.body);
    const profile = await profiles.createProfile(input);
    return reply.code(201).send(profile);
  });

  fastify.patch("/api/profiles/:id", async (req) => {
    requireAuth(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const input = UpdateProfileSchema.parse(req.body);
    return profiles.updateProfile(id, input);
  });

  fastify.delete("/api/profiles/:id", async (req, reply) => {
    requireAuth(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    await profiles.deleteProfile(id);
    return reply.code(204).send();
  });

  fastify.post("/api/auth/login", async (req) => {
    const { name, pinCode } = LoginSchema.parse(req.body);
    const { session, profile } = await profiles.login(name, pinCode);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      profile,
    };
  });

  fastify.post("/api/auth/logout", async (req, reply) => {
    const session = requireAuth(req);
    profiles.logout(session.token);
    return reply.code(204).send();
  });

  fastify.post("/api/auth/recover", async (req) => {
    const { name, recoveryPhrase, newPin } = RecoverSchema.parse(req.body);
    const profile = await profiles.recoverProfile(name, recoveryPhrase, newPin);
    return profile;
  });

  fastify.get("/api/auth/session", async (req) => {
    const session = requireAuth(req);
    const profile = await profiles.getProfile(session.profileId);
    return { session, profile };
  });
});