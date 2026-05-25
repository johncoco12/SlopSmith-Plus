import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
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

function which(cmd: string): string | null {
  try {
    return execFileSync("which", [cmd], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

export class AudioConverter {
  private static resolveVgmstream(): string | null {
    const env = process.env.VGMSTREAM_CLI;
    if (env && fs.existsSync(env)) return env;
    return which("vgmstream-cli");
  }

  private static resolveFfmpeg(): string | null {
    return which("ffmpeg");
  }

  private static decodeWemToWav(vgmstream: string, wemPath: string, wavPath: string): string | null {
    const r = spawnSync(vgmstream, ["-o", wavPath, wemPath], { timeout: 120_000, encoding: "utf8" });
    if (r.status === 0 && fs.existsSync(wavPath) && fs.statSync(wavPath).size > 0) {
      return null; // success
    }
    const stderr = ((r.stderr || r.stdout || "") as string).trim();
    return truncate(stderr || `exit code ${r.status}`);
  }

  static convertWem(wemPath: string, outputBase: string): string {
    const errors: string[] = [];

    const vgmstream = AudioConverter.resolveVgmstream();
    if (vgmstream) {
      const wav = `${outputBase}.wav`;
      const detail = AudioConverter.decodeWemToWav(vgmstream, wemPath, wav);
      if (!detail) {
        const ffmpeg = AudioConverter.resolveFfmpeg();
        if (ffmpeg) {
          const mp3 = `${outputBase}.mp3`;
          const r = spawnSync(ffmpeg, ["-y", "-i", wav, "-b:a", "192k", mp3], { timeout: 120_000 });
          if (r.status === 0 && fs.existsSync(mp3)) {
            fs.unlinkSync(wav);
            return mp3;
          }
        }
        return wav;
      }
      errors.push(`vgmstream: ${detail}`);
    }

    const ffmpeg = AudioConverter.resolveFfmpeg();
    if (ffmpeg) {
      const mp3 = `${outputBase}.mp3`;
      const r = spawnSync(ffmpeg, ["-y", "-i", wemPath, "-b:a", "192k", mp3], { timeout: 120_000 });
      if (r.status === 0 && fs.existsSync(mp3) && fs.statSync(mp3).size > 0) return mp3;
      errors.push(`ffmpeg: ${truncate((r.stderr?.toString() ?? "").trim() || `exit code ${r.status}`)}`);

      const wav = `${outputBase}.wav`;
      const r2 = spawnSync(ffmpeg, ["-y", "-i", wemPath, wav], { timeout: 120_000 });
      if (r2.status === 0 && fs.existsSync(wav) && fs.statSync(wav).size > 0) return wav;
      errors.push(`ffmpeg-wav: ${truncate((r2.stderr?.toString() ?? "").trim() || `exit code ${r2.status}`)}`);
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
