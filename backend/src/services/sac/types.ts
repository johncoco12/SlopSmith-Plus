import type { WebSocket } from "@fastify/websocket";

// ── UDP ports ─────────────────────────────────────────────────────────────────

export const SAC_BEACON_PORT  = 54920;
export const SAC_CONTROL_PORT = 54921;
export const SAC_PITCH_PORT   = 54922;
export const SAC_CLIENT_PORT  = 54930; // SAC binds here to receive backend events

// ── Session ───────────────────────────────────────────────────────────────────

export interface SacSession {
  readonly sessionId:   string;
  readonly profileId:   number;
  readonly profileName: string;
  readonly sacIp:       string;
  readonly sacPort:     number;  // SAC control receive port (kSacPort = 54930)
  lastSeen:        number;
  linkedWs:        WebSocket | null;
  activeTrackId:   string | null;
}

// ── Inbound UDP messages (SAC → backend) ─────────────────────────────────────

export interface ConnectRequest {
  type:       "CONNECT_REQUEST";
  sessionId:  string;
  profileId:  number;
  authToken:  string;     // raw PIN — verified against stored hash server-side
  sacPort:    number;
  version:    string;
}

export interface HeartbeatMsg {
  type:      "HEARTBEAT";
  sessionId: string;
  ts:        number;
}

export interface MonitoringStartedMsg {
  type:      "MONITORING_STARTED";
  sessionId: string;
}

export interface MonitoringStoppedMsg {
  type:      "MONITORING_STOPPED";
  sessionId: string;
}

export interface PitchMsg {
  type:       "PITCH";
  sessionId:  string;
  ts:         number;
  frequency:  number;
  confidence: number;
  midiNote:   number;
  noteName:   string;
}

export type SacInboundMsg =
  | ConnectRequest
  | HeartbeatMsg
  | MonitoringStartedMsg
  | MonitoringStoppedMsg
  | PitchMsg;

// ── Outbound UDP messages (backend → SAC) ────────────────────────────────────

export interface ConnectAck {
  type:      "CONNECT_ACK";
  sessionId: string;
  status:    "ok" | "denied";
  reason?:   string;
}

export interface HeartbeatAck {
  type: "HEARTBEAT_ACK";
  ts:   number;
}

export interface StartMonitoringCmd {
  type:        "START_MONITORING";
  trackId:     string;
  tuning:      string;
  arrangement: string;
}

export interface StopMonitoringCmd {
  type: "STOP_MONITORING";
}

export interface DisconnectCmd {
  type:   "DISCONNECT";
  reason: string;
}

// ── WebSocket events (backend → frontend) ────────────────────────────────────

export interface WsSacConnected {
  type:        "sac:connected";
  sessionId:   string;
  profileId:   number;
  profileName: string;
}

export interface WsSacDisconnected {
  type:      "sac:disconnected";
  sessionId: string;
}

export interface WsSacMonitoringActive {
  type:    "sac:monitoring_active";
  trackId: string;
}

export interface WsSacMonitoringStopped {
  type: "sac:monitoring_stopped";
}

export interface WsSacPitch {
  type:       "sac:pitch";
  ts:         number;
  frequency:  number;
  confidence: number;
  midiNote:   number;
  noteName:   string;
}

// ── WebSocket events (frontend → backend) ────────────────────────────────────

export interface WsLinkSac {
  type:      "track:link_sac";
  sessionId: string;
}

export interface WsTrackPlay {
  type:        "track:play";
  sessionId:   string;
  trackId:     string;
  tuning:      string;
  arrangement: string;
}

export interface WsTrackStop {
  type:      "track:stop";
  sessionId: string;
}
