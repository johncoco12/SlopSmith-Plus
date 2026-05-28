import fp from "fastify-plugin";
import type { WebSocket } from "@fastify/websocket";
import type { SacSessionService } from "../../services/sac/SacSessionService.js";
import type {
  WsLinkSac,
  WsTrackPlay,
  WsTrackStop,
} from "../../services/sac/types.js";

// WebSocket endpoint consumed by the frontend.
//
// Flow:
//   frontend → track:link_sac { sessionId }       link this WS to a SAC session
//   frontend → track:play { sessionId, ... }       tell SAC to start monitoring
//   frontend → track:stop { sessionId }            tell SAC to stop monitoring
//
//   backend → sac:connected { profileId, ... }     SAC is authenticated
//   backend → sac:monitoring_active { trackId }    SAC confirmed monitoring start
//   backend → sac:monitoring_stopped               SAC confirmed monitoring stop
//   backend → sac:pitch { frequency, ... }         live pitch forwarded from SAC
//   backend → sac:disconnected { sessionId }       SAC timed out / disconnected
export const sacRoutes = fp(async function sacRoutes(fastify) {
  const sessionSvc = fastify.sacSessionSvc as SacSessionService;

  // ── REST: list active SAC sessions ───────────────────────────────────────

  fastify.get("/api/sac/sessions", async () => sessionSvc.getSessions());

  // ── WebSocket: frontend ↔ SAC bridge ─────────────────────────────────────

  fastify.get(
    "/ws/sac",
    { websocket: true },
    function sacWsHandler(socket: WebSocket) {
      let linkedSessionId: string | null = null;

      socket.on("message", (raw) => {
        let msg: { type: string };
        try { msg = JSON.parse(raw.toString()); }
        catch { return; }

        switch (msg.type) {
          case "track:link_sac": {
            const { sessionId } = msg as WsLinkSac;
            if (!sessionId) break;
            const ok = sessionSvc.linkWs(sessionId, socket);
            if (!ok) {
              socket.send(JSON.stringify({
                type: "sac:error",
                reason: "session not found — SAC must connect first",
              }));
            } else {
              linkedSessionId = sessionId;
            }
            break;
          }

          case "track:play": {
            const { sessionId, trackId, tuning, arrangement } = msg as WsTrackPlay;
            if (sessionId && trackId)
              sessionSvc.sendStartMonitoring(sessionId, trackId, tuning ?? "", arrangement ?? "0");
            break;
          }

          case "track:stop": {
            const { sessionId } = msg as WsTrackStop;
            if (sessionId)
              sessionSvc.sendStopMonitoring(sessionId);
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
