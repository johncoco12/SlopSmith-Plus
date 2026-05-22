import fp from "fastify-plugin";
import { z } from "zod";
import type { PermissionsService } from "../../services/PermissionsService.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(128),
  profileIds: z.array(z.number().int()).optional().default([]),
  permissions: z.array(z.string()).optional().default([]),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  profileIds: z.array(z.number().int()).optional(),
  permissions: z.array(z.string()).optional(),
});

const AddProfileSchema = z.object({
  profileId: z.number().int(),
});

export const permissionRoutes = fp(async function permissionRoutes(fastify) {
  const perms = fastify.permissions as PermissionsService;

  fastify.get("/api/permissions/groups",{preHandler: [requireAuth]}, async (req) => {
    return perms.listGroups();
  });

  fastify.get("/api/permissions/groups/:id", {preHandler: [requireAuth]}, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    return perms.getGroup(id);
  });

  fastify.post("/api/permissions/groups", {
    preHandler: [requireAuth, requirePermission("admin")],
  }, async (req, reply) => {
    const input = CreateGroupSchema.parse(req.body);
    const group = await perms.createGroup(input);
    return reply.code(201).send(group);
  });

  fastify.patch("/api/permissions/groups/:id", {
    preHandler: [requireAuth, requirePermission("admin")],
  }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const input = UpdateGroupSchema.parse(req.body);
    return perms.updateGroup(id, input);
  });

  fastify.delete("/api/permissions/groups/:id", {
    preHandler: [requireAuth, requirePermission("admin")],
  }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    await perms.deleteGroup(id);
    return reply.code(204).send();
  });

  fastify.post("/api/permissions/groups/:id/profiles", {
    preHandler: [requireAuth, requirePermission("admin")],
  }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { profileId } = AddProfileSchema.parse(req.body);
    return perms.addProfileToGroup(id, profileId);
  });

  fastify.delete("/api/permissions/groups/:id/profiles/:profileId", {
    preHandler: [requireAuth, requirePermission("admin")],
  }, async (req) => {
    const { id, profileId } = z.object({
      id: z.coerce.number().int(),
      profileId: z.coerce.number().int(),
    }).parse(req.params);
    return perms.removeProfileFromGroup(id, profileId);
  });

  fastify.get("/api/permissions/me", async (req) => {
    const session = requireAuth(req);
    const myPerms = await perms.resolvePermissions(session.profileId);
    return { profileId: session.profileId, permissions: myPerms };
  });
});