import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PsarcReader } from "./PsarcReader.js";
import { SloppakLoader } from "./SloppakLoader.js";
import { LooseFolderReader } from "./LooseFolderReader.js";
import type { ImportFormat } from "../../domain/models/import.js";
import type { Config } from "../../config.js";

const execFileAsync = promisify(execFile);

function convertDdsToPng(ddsBuffer: Buffer): Buffer | null {
  const tmpIn = path.join(os.tmpdir(), `slopsmith-art-${Date.now()}.dds`);
  const tmpOut = path.join(os.tmpdir(), `slopsmith-art-${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpIn, ddsBuffer);
    const result = spawnSync("ffmpeg", [
      "-y", "-pix_fmt", "rgba", "-i", tmpIn,
      "-compression_level", "0",
      tmpOut,
    ], { timeout: 15000, encoding: "utf8" });
    if (result.status !== 0) return null;
    if (!fs.existsSync(tmpOut)) return null;
    return fs.readFileSync(tmpOut);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

export function extractCoverArt(
  filePath: string,
  format: ImportFormat,
  config?: Config,
): Buffer | null {
  try {
    if (format === "sloppak") {
      const cacheDir = config?.sloppakCacheDir ?? "";
      const sourceDir = SloppakLoader.resolveDir(filePath, cacheDir);
      for (const ext of [".png", ".jpg", ".jpeg"]) {
        const artPath = path.join(sourceDir, `cover${ext}`);
        if (fs.existsSync(artPath)) return fs.readFileSync(artPath);
      }
      return null;
    }

    if (format === "loose" || LooseFolderReader.isLooseFolder(filePath)) {
      for (const ext of [".png", ".jpg", ".jpeg"]) {
        const artPath = path.join(filePath, `cover${ext}`);
        if (fs.existsSync(artPath)) return fs.readFileSync(artPath);
      }
      return null;
    }

    const entries = PsarcReader.read(filePath, [
      "**/*album*256*",
      "**/*album*128*",
      "**/*album*",
      "**/*cover*256*",
      "**/*cover*128*",
      "**/*cover*",
      "**/*_256*",
      "**/*.dds",
      "**/*.png",
      "**/*.jpg",
    ]);

    const ddsCandidates: { name: string; data: Buffer; score: number }[] = [];
    let best: { name: string; data: Buffer; score: number } | null = null;

    for (const [name, data] of entries) {
      if (name.endsWith(".dds")) {
        const score = name.includes("256") ? 3 : name.includes("128") ? 2 : 1;
        ddsCandidates.push({ name, data, score });
        continue;
      }
      const score = name.includes("256") ? 3 : name.includes("128") ? 2 : 1;
      if (!best || score > best.score) best = { name, data, score };
    }

    if (best) return best.data;

    if (ddsCandidates.length > 0) {
      ddsCandidates.sort((a, b) => b.score - a.score);
      const converted = convertDdsToPng(ddsCandidates[0].data);
      if (converted) return converted;
    }

    return null;
  } catch {
    return null;
  }
}