import { spawn, execFile as execFileCb } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { AudioConversionError } from "../../domain/errors.js";

const MAX_DETAIL = 500;

function truncate(text: string): string {
  const bannerRe = /^\s*(ffmpeg\s+version|built\s+with|configuration:|lib(av\w+|sw\w+)|Stream\s+mapping:|Input\s+#|Output\s+#|Duration:|Press\s+\[q\])/;
  const lines = text.split("\n").filter((l) => l.trim());
  const actionable = lines.find((l) => !bannerRe.test(l)) ?? lines[0] ?? text.trim();
  const s = actionable.trim();
  return s.length <= MAX_DETAIL ? s : s.slice(0, MAX_DETAIL - 1).trimEnd() + "…";
}

function basename(raw: string): string {
  const s = raw.replace(/[/\\]+$/, "");
  const idx = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function execFileAsync(cmd: string, args: string[]): Promise<{ stdout: string; status: number | null }> {
  return new Promise((resolve) => {
    execFileCb(cmd, args, { timeout: 10_000, encoding: "utf8" }, (err, stdout) => {
      resolve({ stdout: (stdout ?? "").trim(), status: err ? 1 : 0 });
    });
  });
}

function spawnAsync(cmd: string, args: string[], options?: { timeout?: number }): Promise<{ status: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { timeout: options?.timeout });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      resolve({ status: code, stderr, stdout });
    });
    child.on("error", () => {
      resolve({ status: 1, stderr, stdout });
    });
  });
}

let whichVgmstream: string | null | undefined;
let whichFfmpeg: string | null | undefined;

async function resolveVgmstream(): Promise<string | null> {
  if (whichVgmstream !== undefined) return whichVgmstream;
  const env = process.env.VGMSTREAM_CLI;
  if (env) {
    try { await fs.access(env); whichVgmstream = env; return env; } catch { /* fall through */ }
  }
  const r = await execFileAsync("which", ["vgmstream-cli"]);
  whichVgmstream = r.status === 0 ? r.stdout : null;
  return whichVgmstream;
}

async function resolveFfmpeg(): Promise<string | null> {
  if (whichFfmpeg !== undefined) return whichFfmpeg;
  const r = await execFileAsync("which", ["ffmpeg"]);
  whichFfmpeg = r.status === 0 ? r.stdout : null;
  return whichFfmpeg;
}

async function decodeWemToWav(vgmstream: string, wemPath: string, wavPath: string): Promise<string | null> {
  const r = await spawnAsync(vgmstream, ["-o", wavPath, wemPath], { timeout: 120_000 });
  if (r.status === 0) {
    try {
      const stat = await fs.stat(wavPath);
      if (stat.size > 0) return null;
    } catch { /* fall through */ }
  }
  const stderr = (r.stderr || r.stdout || "").trim();
  return truncate(stderr || `exit code ${r.status}`);
}

export class AudioConverterAsync {
  static async convertWem(wemPath: string, outputBase: string): Promise<string> {
    const errors: string[] = [];

    const vgmstream = await resolveVgmstream();
    if (vgmstream) {
      const wav = `${outputBase}.wav`;
      const detail = await decodeWemToWav(vgmstream, wemPath, wav);
      if (!detail) {
        const ffmpeg = await resolveFfmpeg();
        if (ffmpeg) {
          const mp3 = `${outputBase}.mp3`;
          const r = await spawnAsync(ffmpeg, ["-y", "-i", wav, "-b:a", "192k", mp3], { timeout: 120_000 });
          if (r.status === 0) {
            try { await fs.access(mp3); return mp3; } catch { /* fall through */ }
          }
        }
        return wav;
      }
      errors.push(`vgmstream: ${detail}`);
    }

    const ffmpeg = await resolveFfmpeg();
    if (ffmpeg) {
      const mp3 = `${outputBase}.mp3`;
      const r = await spawnAsync(ffmpeg, ["-y", "-i", wemPath, "-b:a", "192k", mp3], { timeout: 120_000 });
      if (r.status === 0) {
        try {
          const stat = await fs.stat(mp3);
          if (stat.size > 0) return mp3;
        } catch { /* fall through */ }
      }
      errors.push(`ffmpeg: ${truncate((r.stderr || "").trim() || `exit code ${r.status}`)}`);

      const wav = `${outputBase}.wav`;
      const r2 = await spawnAsync(ffmpeg, ["-y", "-i", wemPath, wav], { timeout: 120_000 });
      if (r2.status === 0) {
        try {
          const stat = await fs.stat(wav);
          if (stat.size > 0) return wav;
        } catch { /* fall through */ }
      }
      errors.push(`ffmpeg-wav: ${truncate((r2.stderr || "").trim() || `exit code ${r2.status}`)}`);
    }

    const hint = "Install vgmstream-cli (Arch: yay -S vgmstream-cli-bin) or set VGMSTREAM_CLI";
    if (errors.length > 0) {
      throw new AudioConversionError(
        `Failed to decode ${basename(wemPath)}: ${errors.join(" | ")}${vgmstream ? "" : ` | Hint: ${hint}`}`
      );
    }
    throw new AudioConversionError(`No WEM decoder found. ${hint}`);
  }
}