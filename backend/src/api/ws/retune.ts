import fp from "fastify-plugin";
import { spawn } from "node:child_process";
import type { WebSocket } from "@fastify/websocket";
import type { SongService } from "../../services/SongService.js";
import { ConfigurationError } from "../../domain/errors.js";
import { config } from "../../config.js";
import path from "node:path";
import fs from "node:fs";

function send(ws: WebSocket, data: unknown): void {
  try { ws.send(JSON.stringify(data)); } catch { /* socket closed */ }
}

export const retuneWs = fp(async function retuneWs(fastify) {
  const songService = fastify.songs as SongService;

  fastify.get("/ws/retune", { websocket: true }, async (ws, req) => {
    const query = req.query as Record<string, string>;
    const { filename, target = "E Standard" } = query;

    if (!filename) {
      send(ws, { error: "filename query param required" });
      ws.close();
      return;
    }

    if (target !== "E Standard") {
      send(ws, { error: `Unsupported target tuning: "${target}". Only 'E Standard' is supported.` });
      ws.close();
      return;
    }

    if (filename.toLowerCase().endsWith(".sloppak")) {
      send(ws, { error: "Retune is not supported for .sloppak files" });
      ws.close();
      return;
    }

    const rscli = config.rscliPath;
    if (!rscli || !fs.existsSync(rscli)) {
      send(ws, { error: "rscli not configured or not found" });
      ws.close();
      return;
    }

    let filePath: string;
    try {
      filePath = songService.resolveDlcPath(filename);
    } catch (err) {
      send(ws, { error: err instanceof Error ? err.message : String(err) });
      ws.close();
      return;
    }

    if (!fs.existsSync(filePath)) {
      send(ws, { error: "File not found" });
      ws.close();
      return;
    }

    const stem = path.basename(filePath, path.extname(filePath)).replace(/_p$/, "");
    const outPath = path.join(path.dirname(filePath), `${stem}_EStd_p.psarc`);

    send(ws, { stage: "Checking tuning...", progress: 5 });

    const proc = spawn(rscli, ["retune", filePath, outPath, "--target", target], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let closed = false;

    ws.on("close", () => {
      closed = true;
      proc.kill();
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      if (closed) return;
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          send(ws, msg);
        } catch {
          send(ws, { stage: line.trim(), progress: 50 });
        }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      fastify.log.debug("retune stderr: %s", chunk.toString().trim());
    });

    await new Promise<void>((resolve) => {
      proc.on("close", (code) => {
        if (!closed) {
          if (code === 0) {
            send(ws, {
              done: true,
              progress: 100,
              stage: "Complete!",
              filename: path.basename(outPath),
            });
          } else {
            send(ws, { error: `rscli exited with code ${code}` });
          }
        }
        resolve();
      });
    });

    if (!closed) ws.close();
  });
});
