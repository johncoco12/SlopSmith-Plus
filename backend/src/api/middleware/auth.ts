import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { IProfileService, Session } from "../../domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "../../domain/interfaces/services/IPermissionsService.js";
import { AuthenticationError, ForbiddenError } from "../../domain/errors.js";
import { Permissions } from "../../domain/models/permission.js";

export function requireAuth(req: FastifyRequest): Session {
  if (!req.session) throw new AuthenticationError();
  return req.session;
}

export function requireAuthAsync(): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    requireAuth(req);
  };
}

export function requirePermission(...permissions: Permissions[]): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    const session = requireAuth(req);
    const perms = req.server.permissions as IPermissionsService;
    const hasPermission = await perms.hasAnyPermission(session.profileId, ...permissions);
    if (!hasPermission) {
      throw new ForbiddenError(`Missing permission: ${permissions.join(", ")}`);
    }
  };
}

export function requirePermissionStr(permission: string): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    const session = requireAuth(req);
    const perms = req.server.permissions as IPermissionsService;
    const ok = await perms.hasAnyPermission(session.profileId, permission);
    if (!ok) throw new ForbiddenError(`Missing permission: ${permission}`);
  };
}

export function requireAllPermissions(...permissions: Permissions[]): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    const session = requireAuth(req);
    const perms = req.server.permissions as IPermissionsService;
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

    // WebSocket upgrade requests cannot carry Authorization headers from the browser.
    // Accept the token via query string as a fallback (used by /ws/* routes).
    if (!token) {
      const q = req.query as Record<string, unknown>;
      if (typeof q.token === "string" && q.token) token = q.token;
    }

    if (!token) {
      req.session = null;
      return;
    }

    const profileService = fastify.profiles as IProfileService;
    const session = profileService.validateSession(token);
    req.session = session;
  });
} satisfies FastifyPluginAsync);