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
} from "./types.js";

const HEARTBEAT_TIMEOUT_MS = 15_000;
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

  // ── WebSocket linkage ─────────────────────────────────────────────────────

  linkWs(sessionId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.linkedWs = ws;

    const event: WsSacConnected = {
      type:        "sac:connected",
      sessionId,
      profileId:   session.profileId,
      profileName: session.profileName,
    };
    ws.send(JSON.stringify(event));
    return true;
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

    session.linkedWs?.send(JSON.stringify({ type: "sac:monitoring_active", trackId } satisfies WsSacMonitoringActive));
  }

  sendStopMonitoring(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sendToSac(session, { type: "STOP_MONITORING" });
    session.activeTrackId = null;

    session.linkedWs?.send(JSON.stringify({ type: "sac:monitoring_stopped" } satisfies WsSacMonitoringStopped));
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
      case "MONITORING_STOPPED": return; // acknowledged by the SAC itself, no-op here
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
    session.lastSeen = Date.now();
    this.socket && send(this.socket, rinfo.address, session.sacPort, {
      type: "HEARTBEAT_ACK", ts: Date.now(),
    });
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
