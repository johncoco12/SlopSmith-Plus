import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { ProfileService, Session } from "../../services/ProfileService.js";
import type { PermissionsService } from "../../services/PermissionsService.js";
import { AuthenticationError, ForbiddenError } from "../../domain/errors.js";

export function requireAuth(req: FastifyRequest): Session {
  if (!req.session) throw new AuthenticationError();
  return req.session;
}

export function requirePermission(...permissions: string[]): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    const session = requireAuth(req);
    const perms = req.server.permissions as PermissionsService;
    const hasPermission = await perms.hasAnyPermission(session.profileId, ...permissions);
    if (!hasPermission) {
      throw new ForbiddenError(`Missing permission: ${permissions.join(", ")}`);
    }
  };
}

export function requireAllPermissions(...permissions: string[]): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    const session = requireAuth(req);
    const perms = req.server.permissions as PermissionsService;
    const hasPermission = await perms.hasAllPermissions(session.profileId, ...permissions);
    if (!hasPermission) {
      throw new ForbiddenError(`Missing permissions: ${permissions.join(", ")}`);
    }
  };
}

export const authMiddleware = fp(async function authMiddleware(fastify) {
  fastify.addHook("preHandler", async (req: FastifyRequest) => {
    const auth = req.headers.authorization;
    let token: string | null = null;
    if (auth?.startsWith("Bearer ")) {
      token = auth.slice(7).trim();
    }

    if (!token) {
      req.session = null;
      return;
    }

    const profileService = fastify.profiles as ProfileService;
    const session = profileService.validateSession(token);
    req.session = session;
  });
} satisfies FastifyPluginAsync);