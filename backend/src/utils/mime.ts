import path from "node:path";

const MIME_MAP: Record<string, string> = {
  ogg: "audio/ogg",
  opus: "audio/ogg",
  oga: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  wem: "audio/x-wem",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  pdf: "application/pdf",
  zip: "application/zip",
};

export function mimeFromFile(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  return MIME_MAP[ext] ?? "application/octet-stream";
}