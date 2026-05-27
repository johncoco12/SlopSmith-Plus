import type { FastifyInstance } from "fastify";
import type { PluginRouteHandle, RouteHandler, WSHandler } from "../../domain/interfaces/plugins/PluginContext.js";
import { requireAuthAsync, requirePermissionStr } from "../../api/middleware/auth.js";

export class RouteRegistrar {
  constructor(private readonly fastify: FastifyInstance) {}

  forPlugin(pluginId: string): PluginRouteHandle {
    const fastify = this.fastify;

    return {
      register(method, path, handler: RouteHandler, opts) {
        const preHandler = [
          requireAuthAsync(),
          ...(opts?.requirePermission ? [requirePermissionStr(opts.requirePermission)] : []),
        ];

        fastify.route({
          method,
          url: `/api/plugins/${pluginId}/${path}`,
          preHandler,
          handler,
        });
      },

      ws(path: string, handler: WSHandler) {
        fastify.get(
          `/ws/plugins/${pluginId}/${path}`,
          { websocket: true, preHandler: [requireAuthAsync()] },
          handler as any,
        );
      },
    };
  }
}
