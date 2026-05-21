import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
import path from "node:path";
import { tuningName, tuningSortKey } from "./tunings.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
});

export class LooseFolderReader {
  static isLooseFolder(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isDirectory()) return false;
      const entries = fs.readdirSync(filePath);
      return entries.some((e) => e.endsWith(".wem")) && entries.some((e) => e.endsWith(".xml"));
    } catch {
      return false;
    }
  }

  static extractMeta(dirPath: string): Record<string, unknown> {
    const xmlFile = fs.readdirSync(dirPath).find(
      (e) => e.endsWith(".xml") && !e.includes("_showlights") && !e.includes("vocal")
    );
    if (!xmlFile) return { format: "loose" };

    try {
      const content = fs.readFileSync(path.join(dirPath, xmlFile), "utf8");
      const doc = parser.parse(content) as Record<string, unknown>;
      const root = (doc["song"] ?? doc["Song"] ?? {}) as Record<string, unknown>;

      const tuningEl = root["tuning"] as Record<string, unknown> | undefined;
      const tuningOffsets = tuningEl
        ? Array.from({ length: 6 }, (_, i) => {
            const v = tuningEl[`@_string${i}`];
            return v !== undefined ? Number(v) : 0;
          })
        : [0, 0, 0, 0, 0, 0];

      return {
        title: String(root["@_title"] ?? root["title"] ?? ""),
        artist: String(root["@_artistName"] ?? root["artistName"] ?? ""),
        album: String(root["@_albumName"] ?? root["albumName"] ?? ""),
        year: String(root["@_albumYear"] ?? root["albumYear"] ?? ""),
        duration: Number(root["@_songLength"] ?? root["songLength"]) || 0,
        offset: Number(root["@_startBeat"] ?? root["startBeat"]) || 0,
        tuning: tuningOffsets.join(","),
        tuningName: tuningName(tuningOffsets),
        tuningSortKey: tuningSortKey(tuningOffsets),
        format: "loose",
        arrangements: [{ index: 0, name: "Lead", notes: 0 }],
        hasLyrics: false,
        stemCount: 0,
        stemIds: [],
      };
    } catch {
      return { format: "loose" };
    }
  }

  static findWemFiles(dirPath: string): string[] {
    const results: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".wem")) results.push(full);
      }
    }
    walk(dirPath);
    return results.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  }
}
