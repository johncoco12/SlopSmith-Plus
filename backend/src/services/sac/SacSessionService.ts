import dgram from "node:dgram";
import { createHash } from "node:crypto";
import type { WebSocket } from "@fastify/websocket";
import type { IProfileRepository } from "../../domain/repositories.js";
import {
  SAC_CONTROL_PORT,
  type SacSession,
  type SacInboundMsg,
  type WsSacConnected,
  type WsSacDisconnected,
  type WsSacMonitoringActive,
  type WsSacMonitoringStopped,
  type WsSacChainState,
  type WsSacPluginList,
  type ChainStateMsg,
  type PluginListMsg,
} from "./types.js";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const EXPIRE_INTERVAL_MS   = 5_000;

function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(salt + pin).digest("hex");
}

function send(socket: dgram.Socket, ip: string, port: number, payload: object): void {
  const buf = Buffer.from(JSON.stringify(payload));
  socket.send(buf, port, ip, (err) => {
    if (err) console.error("[SacSession] send error:", err.message);
  });
}

// Manages authenticated SAC sessions over UDP (port 54921).
// Acts as the bridge between the UDP world (SAC app) and the WebSocket
// world (frontend client).
export class SacSessionService {
  private socket: dgram.Socket | null = null;
  private expireInterval: NodeJS.Timeout | null = null;
  private readonly sessions = new Map<string, SacSession>();

  constructor(private readonly profileRepo: IProfileRepository) {}

  start(): void {
    this.socket = dgram.createSocket("udp4");

    this.socket.on("error", (err) => {
      console.error("[SacSession] socket error:", err.message);
    });

    this.socket.on("message", (msg, rinfo) => {
      void this.handleMessage(msg, rinfo);
    });

    this.socket.bind(SAC_CONTROL_PORT, () => {
      console.info(`[SacSession] listening on UDP :${SAC_CONTROL_PORT}`);
    });

    this.expireInterval = setInterval(() => this.expireStale(), EXPIRE_INTERVAL_MS);
  }

  stop(): void {
    if (this.expireInterval) { clearInterval(this.expireInterval); this.expireInterval = null; }
    for (const session of this.sessions.values())
      this.sendToSac(session, { type: "DISCONNECT", reason: "server stopping" });
    this.sessions.clear();
    this.socket?.close();
    this.socket = null;
  }

  // ── Public session info (REST) ────────────────────────────────────────────

  getSessions(): Array<{
    sessionId: string;
    profileId: number;
    profileName: string;
    sacIp: string;
    lastSeen: number;
    linked: boolean;
  }> {
    return Array.from(this.sessions.values()).map(s => ({
      sessionId:   s.sessionId,
      profileId:   s.profileId,
      profileName: s.profileName,
      sacIp:       s.sacIp,
      lastSeen:    s.lastSeen,
      linked:      s.linkedWs !== null,
    }));
  }

  /** Scoped variant used by the authenticated REST endpoint. */
  getSessionsForProfile(profileId: number) {
    return this.getSessions().filter(s => s.profileId === profileId);
  }

  /**
   * Returns true if `ip` matches the SAC instance that owns `sessionId`.
   * Used by PitchProcessorService to reject spoofed pitch datagrams.
   */
  validatePitchSource(sessionId: string, ip: string): boolean {
    const session = this.sessions.get(sessionId);
    return session !== undefined && session.sacIp === ip;
  }

  // ── WebSocket linkage ─────────────────────────────────────────────────────

  /**
   * Returns "ok" on success, or an error discriminant string.
   * "not_found"  – no session with this id exists yet
   * "forbidden"  – session belongs to a different profile
   * "already_linked" – session is already linked to an open WebSocket
   */
  linkWs(sessionId: string, callerProfileId: number, ws: WebSocket): "ok" | "not_found" | "forbidden" | "already_linked" {
    const session = this.sessions.get(sessionId);
    if (!session) return "not_found";
    if (session.profileId !== callerProfileId) return "forbidden";

    // Reject if an open WebSocket is already linked to this session
    if (
      session.linkedWs !== null &&
      session.linkedWs.readyState < WebSocket.CLOSING
    ) {
      return "already_linked";
    }

    session.linkedWs = ws;

    const event: WsSacConnected = {
      type:        "sac:connected",
      sessionId,
      profileId:   session.profileId,
      profileName: session.profileName,
    };
    ws.send(JSON.stringify(event));
    return "ok";
  }

  unlinkWs(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.linkedWs = null;
  }

  // ── Commands from frontend via WebSocket ──────────────────────────────────

  sendStartMonitoring(sessionId: string, trackId: string, tuning: string, arrangement: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "START_MONITORING", trackId, tuning, arrangement });
    session.activeTrackId = trackId;
    // sac:monitoring_active is emitted when SAC confirms with MONITORING_STARTED
  }

  sendStopMonitoring(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "STOP_MONITORING" });
    session.activeTrackId = null;
    // sac:monitoring_stopped is emitted when SAC confirms with MONITORING_STOPPED
  }

  // ── Plugin control commands (frontend → SAC) ──────────────────────────────

  sendSetParameter(sessionId: string, pluginIndex: number, parameterIndex: number, value: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "SET_PARAMETER", pluginIndex, parameterIndex, value });
  }

  sendSetBypass(sessionId: string, pluginIndex: number, bypassed: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "SET_BYPASS", pluginIndex, bypassed });
  }

  sendMovePlugin(sessionId: string, fromIndex: number, toIndex: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "MOVE_PLUGIN", fromIndex, toIndex });
  }

  sendRemovePlugin(sessionId: string, pluginIndex: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "REMOVE_PLUGIN", pluginIndex });
  }

  sendAddPlugin(sessionId: string, pluginId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "ADD_PLUGIN", pluginId });
  }

  requestChainState(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "REQUEST_CHAIN_STATE" });
  }

  // ── Inbound pitch forwarding (called by PitchProcessorService) ────────────

  forwardPitch(sessionId: string, pitchPayload: object): void {
    this.sessions.get(sessionId)?.linkedWs?.send(JSON.stringify(pitchPayload));
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    let data: SacInboundMsg;
    try { data = JSON.parse(msg.toString()) as SacInboundMsg; }
    catch { return; }

    switch (data.type) {
      case "CONNECT_REQUEST":   return this.handleConnect(data, rinfo);
      case "HEARTBEAT":         return this.handleHeartbeat(data, rinfo);
      case "MONITORING_STARTED":
        return this.handleMonitoringStarted(data as Extract<SacInboundMsg, { type: "MONITORING_STARTED" }>);
      case "MONITORING_STOPPED":
        return this.handleMonitoringStopped(data as Extract<SacInboundMsg, { type: "MONITORING_STOPPED" }>);
      case "CHAIN_STATE":
        return this.handleChainState(data as ChainStateMsg);
      case "PLUGIN_LIST":
        return this.handlePluginList(data as PluginListMsg);
    }
  }

  private async handleConnect(data: Extract<SacInboundMsg, { type: "CONNECT_REQUEST" }>, rinfo: dgram.RemoteInfo): Promise<void> {
    const sacPort = data.sacPort ?? rinfo.port;
    const deny = (reason: string) =>
      this.socket && send(this.socket, rinfo.address, sacPort, {
        type: "CONNECT_ACK", sessionId: data.sessionId, status: "denied", reason,
      });

    if (!data.sessionId || !data.profileId || data.authToken === undefined)
      return void deny("missing fields");

    const profile = await this.profileRepo.findById(Number(data.profileId));
    if (!profile) return void deny("profile not found");

    // authToken is the raw PIN; verify against stored hash
    const expected = hashPin(data.authToken, profile.pinSalt);
    if (expected !== profile.pinCode) return void deny("invalid pin");

    const session: SacSession = {
      sessionId:   data.sessionId,
      profileId:   profile.id,
      profileName: profile.name,
      sacIp:       rinfo.address,
      sacPort,
      lastSeen:    Date.now(),
      linkedWs:    null,
      activeTrackId: null,
    };
    this.sessions.set(data.sessionId, session);

    this.socket && send(this.socket, rinfo.address, sacPort, {
      type: "CONNECT_ACK", sessionId: data.sessionId, status: "ok",
    });

    console.info(`[SacSession] ${profile.name} connected from ${rinfo.address}:${sacPort}`);
  }

  private handleHeartbeat(data: Extract<SacInboundMsg, { type: "HEARTBEAT" }>, rinfo: dgram.RemoteInfo): void {
    const session = this.sessions.get(data.sessionId);
    if (!session) return;
    // Reject heartbeats from addresses that don't match the authenticated SAC endpoint
    if (rinfo.address !== session.sacIp) return;
    session.lastSeen = Date.now();
    this.socket && send(this.socket, rinfo.address, session.sacPort, {
      type: "HEARTBEAT_ACK", ts: Date.now(),
    });
  }

  private handleMonitoringStarted(data: Extract<SacInboundMsg, { type: "MONITORING_STARTED" }>): void {
    const session = this.sessions.get(data.sessionId);
    if (!session || !session.linkedWs) return;
    const event: WsSacMonitoringActive = {
      type: "sac:monitoring_active",
      trackId: session.activeTrackId ?? "",
    };
    session.linkedWs.send(JSON.stringify(event));
  }

  private handleMonitoringStopped(data: Extract<SacInboundMsg, { type: "MONITORING_STOPPED" }>): void {
    const session = this.sessions.get(data.sessionId);
    if (!session || !session.linkedWs) return;
    session.activeTrackId = null;
    session.linkedWs.send(JSON.stringify({ type: "sac:monitoring_stopped" } satisfies WsSacMonitoringStopped));
  }

  private handleChainState(data: ChainStateMsg): void {
    const session = this.sessions.get(data.sessionId);
    if (!session || !session.linkedWs) return;
    const event: WsSacChainState = { type: "sac:chain_state", plugins: data.plugins };
    session.linkedWs.send(JSON.stringify(event));
  }

  private handlePluginList(data: PluginListMsg): void {
    const session = this.sessions.get(data.sessionId);
    if (!session || !session.linkedWs) return;
    const event: WsSacPluginList = { type: "sac:plugin_list", plugins: data.plugins };
    session.linkedWs.send(JSON.stringify(event));
  }

  private expireStale(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        console.info(`[SacSession] session ${id} timed out`);
        const event: WsSacDisconnected = { type: "sac:disconnected", sessionId: id };
        session.linkedWs?.send(JSON.stringify(event));
        this.sessions.delete(id);
      }
    }
  }

  private sendToSac(session: SacSession, payload: object): void {
    if (this.socket)
      send(this.socket, session.sacIp, session.sacPort, payload);
  }
}
