import dgram from "node:dgram";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { SAC_BEACON_PORT } from "./types.js";

const BROADCAST_INTERVAL_MS = 2000;

// Broadcasts a UDP beacon to 255.255.255.255:54920 every 2 s so that
// SlopAudio-Connect instances on the same LAN can discover the server
// without manual IP entry.
export class SacBeaconService {
  private socket: dgram.Socket | null = null;
  private interval: NodeJS.Timeout | null = null;
  private readonly serverId = randomUUID();

  constructor(
    private readonly serverName: string,
    private readonly httpPort: number,
    private readonly controlPort: number = 54921,
    private readonly pitchPort: number   = 54922,
    private readonly serverIpOverride?: string,
  ) {}

  start(): void {
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", (err) => {
      console.error("[SacBeacon] socket error:", err.message);
    });

    this.socket.bind(0, () => {
      this.socket!.setBroadcast(true);
      this.broadcast();
      this.interval = setInterval(() => this.broadcast(), BROADCAST_INTERVAL_MS);
    });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private resolvedIp(): string {
    if (this.serverIpOverride) return this.serverIpOverride;
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces ?? []) {
        if (iface.family === "IPv4" && !iface.internal)
          return iface.address;
      }
    }
    return "127.0.0.1";
  }

  private broadcast(): void {
    if (!this.socket) return;

    const payload = Buffer.from(JSON.stringify({
      type:        "SLOP_BEACON",
      version:     "1",
      serverId:    this.serverId,
      serverName:  this.serverName,
      serverIp:    this.resolvedIp(),
      httpPort:    this.httpPort,
      controlPort: this.controlPort,
      pitchPort:   this.pitchPort,
    }));

    this.socket.send(payload, SAC_BEACON_PORT, "255.255.255.255", (err) => {
      if (err) console.error("[SacBeacon] send error:", err.message);
    });
  }
}
