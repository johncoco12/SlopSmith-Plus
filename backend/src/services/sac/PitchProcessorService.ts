import dgram from "node:dgram";
import { SAC_PITCH_PORT, type PitchMsg, type WsSacPitch } from "./types.js";
import type { SacSessionService } from "./SacSessionService.js";

const MIN_CONFIDENCE = 0.80; // discard packets below this threshold

// Receives the high-frequency PITCH UDP stream from SlopAudio-Connect
// (port 54922) and forwards it to the linked WebSocket frontend client.
//
// Note-hit detection is intentionally left to the frontend for now;
// this service is the transport bridge.
export class PitchProcessorService {
  private socket: dgram.Socket | null = null;

  constructor(private readonly sessionSvc: SacSessionService) {}

  start(): void {
    this.socket = dgram.createSocket("udp4");

    this.socket.on("error", (err) => {
      console.error("[PitchProcessor] socket error:", err.message);
    });

    this.socket.on("message", (msg, rinfo) => this.handleMessage(msg, rinfo));

    this.socket.bind(SAC_PITCH_PORT, () => {
      console.info(`[PitchProcessor] listening on UDP :${SAC_PITCH_PORT}`);
    });
  }

  stop(): void {
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    let data: PitchMsg;
    try { data = JSON.parse(msg.toString()) as PitchMsg; }
    catch { return; }

    if (data.type !== "PITCH" || !data.sessionId) return;
    if (data.confidence < MIN_CONFIDENCE) return;

    // Reject pitch datagrams whose sender IP does not match the authenticated SAC endpoint
    if (!this.sessionSvc.validatePitchSource(data.sessionId, rinfo.address)) return;

    const event: WsSacPitch = {
      type:       "sac:pitch",
      ts:         data.ts,
      frequency:  data.frequency,
      confidence: data.confidence,
      midiNote:   data.midiNote,
      noteName:   data.noteName,
    };

    this.sessionSvc.forwardPitch(data.sessionId, event);
  }
}
