import { createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { minimatch } from "minimatch";

// Rocksmith 2014 PSARC archive format constants
const PSARC_MAGIC = Buffer.from("PSAR");
const ARCHIVE_FLAGS_ENCRYPTED = 4;

const ARC_KEY = Buffer.from(
  "C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C",
  "hex"
);
const ARC_IV = Buffer.from("E915AA018FEF71FC508132E4BB4CEB42", "hex");

interface TocEntry {
  readonly zIndex: number;
  readonly length: number;
  readonly offset: number;
}

interface ParsedToc {
  readonly entries: TocEntry[];
  readonly filenames: string[];
  readonly blockSizes: number[];
  readonly blockSize: number;
}

export class PsarcReader {
  static read(filePath: string, patterns?: string[]): Map<string, Buffer> {
    const result = new Map<string, Buffer>();
    const fd = fs.openSync(filePath, "r");
    try {
      const toc = PsarcReader.parseToc(fd);
      for (let i = 0; i < toc.filenames.length; i++) {
        const filename = toc.filenames[i].trim();
        if (!filename) continue;
        if (patterns && !patterns.some((p) => minimatch(filename.toLowerCase(), p.toLowerCase()))) {
          continue;
        }
        try {
          result.set(filename, PsarcReader.extractEntry(fd, toc.entries[i + 1], toc.blockSizes, toc.blockSize));
        } catch {
          // skip unreadable entries
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    return result;
  }

  static unpack(filePath: string, outputDir: string): string[] {
    const extracted: string[] = [];
    const fd = fs.openSync(filePath, "r");
    try {
      const toc = PsarcReader.parseToc(fd);
      for (let i = 0; i < toc.filenames.length; i++) {
        const filename = toc.filenames[i].trim();
        if (!filename) continue;
        const outPath = path.join(outputDir, filename);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        try {
          const data = PsarcReader.extractEntry(fd, toc.entries[i + 1], toc.blockSizes, toc.blockSize);
          fs.writeFileSync(outPath, data);
          extracted.push(outPath);
        } catch {
          // skip
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    return extracted;
  }

  static extractQuickMeta(filePath: string): Record<string, unknown> {
    const entries = PsarcReader.read(filePath, ["*.json"]);
    for (const [key, buf] of entries) {
      if (!key.includes("manifest")) continue;
      try {
        const raw = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
        const entryValues = Object.values(raw["Entries"] as Record<string, unknown> ?? {}) as Record<string, unknown>[];
        const attrs = entryValues[0]?.["Attributes"] as Record<string, unknown> | undefined;
        if (!attrs?.["SongName"]) continue;

        const arrangements = entryValues
          .map((e) => (e["Attributes"] as Record<string, unknown>))
          .filter(Boolean)
          .map((a, idx) => ({
            index: idx,
            name: String(a["ArrangementName"] ?? "Lead"),
            notes: 0,
          }));

        return {
          title: String(attrs["SongName"] ?? ""),
          artist: String(attrs["ArtistName"] ?? ""),
          album: String(attrs["AlbumName"] ?? ""),
          year: String(attrs["SongYear"] ?? ""),
          duration: Number(attrs["SongLength"] ?? 0),
          tuning: String(attrs["Tuning"] ?? ""),
          arrangements,
          hasLyrics: false,
          format: "psarc",
        };
      } catch {
        // try next entry
      }
    }
    return { format: "psarc" };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private static parseToc(fd: number): ParsedToc {
    const header = Buffer.alloc(32);
    fs.readSync(fd, header, 0, 32, 0);

    if (!header.subarray(0, 4).equals(PSARC_MAGIC)) {
      throw new Error("Not a PSARC file");
    }

    const tocLength = header.readUInt32BE(8);
    const tocEntrySize = header.readUInt32BE(12);
    const tocEntryCount = header.readUInt32BE(16);
    const blockSize = header.readUInt32BE(20);
    const archiveFlags = header.readUInt32BE(24);

    const tocRegionSize = tocLength - 32;
    const tocRaw = Buffer.alloc(tocRegionSize);
    fs.readSync(fd, tocRaw, 0, tocRegionSize, 32);

    const tocRegion =
      archiveFlags === ARCHIVE_FLAGS_ENCRYPTED
        ? PsarcReader.decryptToc(tocRaw)
        : tocRaw;

    const tocDataSize = tocEntrySize * tocEntryCount;
    const tocData = tocRegion.subarray(0, tocDataSize);
    const blockTable = tocRegion.subarray(tocDataSize);

    const entries: TocEntry[] = [];
    for (let i = 0; i < tocEntryCount; i++) {
      const off = i * tocEntrySize;
      const zIndex = tocData.readUInt32BE(off + 16);
      // 5-byte big-endian integers for length and offset
      const length = PsarcReader.read5ByteBE(tocData, off + 20);
      const offset = PsarcReader.read5ByteBE(tocData, off + 25);
      entries.push({ zIndex, length, offset });
    }

    const blockSizes: number[] = [];
    for (let i = 0; i + 1 < blockTable.length; i += 2) {
      blockSizes.push(blockTable.readUInt16BE(i));
    }

    const fileListData = PsarcReader.extractEntry(fd, entries[0], blockSizes, blockSize);
    const filenames = fileListData
      .toString("utf8")
      .replace(/\r\n/g, "\n")
      .trim()
      .split("\n");

    return { entries, filenames, blockSizes, blockSize };
  }

  private static extractEntry(fd: number, entry: TocEntry, blockSizes: number[], blockSize: number): Buffer {
    if (entry.length === 0) return Buffer.alloc(0);

    const numBlocks = Math.ceil(entry.length / blockSize);
    const chunks: Buffer[] = [];
    let pos = entry.offset;

    for (let i = 0; i < numBlocks; i++) {
      const bi = entry.zIndex + i;
      const compressedSize = bi < blockSizes.length ? blockSizes[bi] : 0;

      if (compressedSize === 0) {
        const remaining = entry.length - chunks.reduce((s, b) => s + b.length, 0);
        const toRead = Math.min(blockSize, remaining);
        const block = Buffer.alloc(toRead);
        fs.readSync(fd, block, 0, toRead, pos);
        chunks.push(block);
        pos += toRead;
      } else {
        const compressed = Buffer.alloc(compressedSize);
        fs.readSync(fd, compressed, 0, compressedSize, pos);
        pos += compressedSize;
        try {
          chunks.push(inflateSync(compressed));
        } catch {
          chunks.push(compressed);
        }
      }
    }

    return Buffer.concat(chunks).subarray(0, entry.length);
  }

  private static decryptToc(data: Buffer): Buffer {
    const decipher = createDecipheriv("aes-256-cfb", ARC_KEY, ARC_IV);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  private static read5ByteBE(buf: Buffer, offset: number): number {
    return Number(
      BigInt(buf.readUInt8(offset)) * 256n ** 4n +
        BigInt(buf.readUInt32BE(offset + 1))
    );
  }
}
