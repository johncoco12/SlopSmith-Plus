import fp from "fastify-plugin";
import type { WebSocket } from "@fastify/websocket";
import type { SacSessionService } from "../../services/sac/SacSessionService.js";
import { requireAuthAsync, requireAuth } from "../middleware/auth.js";
import type {
  WsLinkSac,
  WsTrackPlay,
  WsTrackStop,
  WsSetParameter,
  WsSetBypass,
  WsMovePlugin,
  WsRemovePlugin,
  WsAddPlugin,
} from "../../services/sac/types.js";

// WebSocket endpoint consumed by the frontend.
//
// Flow:
//   frontend → track:link_sac { sessionId }       link this WS to a SAC session
//   frontend → track:play { ... }                 tell SAC to start monitoring
//   frontend → track:stop                         tell SAC to stop monitoring
//
//   backend → sac:connected { profileId, ... }     SAC is authenticated
//   backend → sac:monitoring_active { trackId }    SAC confirmed monitoring start
//   backend → sac:monitoring_stopped               SAC confirmed monitoring stop
//   backend → sac:pitch { frequency, ... }         live pitch forwarded from SAC
//   backend → sac:disconnected { sessionId }       SAC timed out / disconnected
export const sacRoutes = fp(async function sacRoutes(fastify) {
  const sessionSvc = fastify.sacSessionSvc as SacSessionService;

  // ── REST: list active SAC sessions ───────────────────────────────────────

  fastify.get(
    "/api/sac/sessions",
    { preHandler: [requireAuthAsync()] },
    async (req) => {
      const session = requireAuth(req);
      return sessionSvc.getSessionsForProfile(session.profileId);
    },
  );

  // ── WebSocket: frontend ↔ SAC bridge ─────────────────────────────────────

  fastify.get(
    "/ws/sac",
    { websocket: true, preHandler: [requireAuthAsync()] },
    function sacWsHandler(socket: WebSocket, req) {
      const session = requireAuth(req);
      const callerProfileId = session.profileId;
      let linkedSessionId: string | null = null;

      socket.on("message", (raw) => {
        let msg: { type: string };
        try { msg = JSON.parse(raw.toString()); }
        catch { return; }

        switch (msg.type) {
          case "track:link_sac": {
            const { sessionId } = msg as WsLinkSac;
            if (!sessionId) break;
            const result = sessionSvc.linkWs(sessionId, callerProfileId, socket);
            if (result !== "ok") {
              socket.send(JSON.stringify({
                type: "sac:error",
                reason: result === "not_found"
                  ? "session not found — SAC must connect first"
                  : result === "forbidden"
                  ? "session belongs to a different profile"
                  : "session already linked to another client",
              }));
            } else {
              linkedSessionId = sessionId;
              // Ask SAC to immediately push fresh chain state and plugin list
              // to the newly linked WebSocket client
              sessionSvc.requestChainState(sessionId);
            }
            break;
          }

          case "track:play": {
            if (!linkedSessionId) break;
            const { trackId, tuning, arrangement } = msg as WsTrackPlay;
            if (trackId)
              sessionSvc.sendStartMonitoring(linkedSessionId, trackId, tuning ?? "", arrangement ?? "0");
            break;
          }

          case "track:stop": {
            if (linkedSessionId)
              sessionSvc.sendStopMonitoring(linkedSessionId);
            break;
          }

          case "sac:set_parameter": {
            if (!linkedSessionId) break;
            const { pluginIndex, parameterIndex, value } = msg as WsSetParameter;
            sessionSvc.sendSetParameter(linkedSessionId, pluginIndex, parameterIndex, value);
            break;
          }

          case "sac:set_bypass": {
            if (!linkedSessionId) break;
            const { pluginIndex, bypassed } = msg as WsSetBypass;
            sessionSvc.sendSetBypass(linkedSessionId, pluginIndex, bypassed);
            break;
          }

          case "sac:move_plugin": {
            if (!linkedSessionId) break;
            const { fromIndex, toIndex } = msg as WsMovePlugin;
            sessionSvc.sendMovePlugin(linkedSessionId, fromIndex, toIndex);
            break;
          }

          case "sac:remove_plugin": {
            if (!linkedSessionId) break;
            const { pluginIndex } = msg as WsRemovePlugin;
            sessionSvc.sendRemovePlugin(linkedSessionId, pluginIndex);
            break;
          }

          case "sac:add_plugin": {
            if (!linkedSessionId) break;
            const { pluginId } = msg as WsAddPlugin;
            sessionSvc.sendAddPlugin(linkedSessionId, pluginId);
            break;
          }

          case "sac:request_chain_state": {
            if (linkedSessionId)
              sessionSvc.requestChainState(linkedSessionId);
            break;
          }
        }
      });

      socket.on("close", () => {
        if (linkedSessionId)
          sessionSvc.unlinkWs(linkedSessionId);
      });
    },
  );
});
