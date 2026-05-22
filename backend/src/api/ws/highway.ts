import fp from "fastify-plugin";
import type { WebSocket } from "@fastify/websocket";
import type { SongService } from "../../services/SongService.js";
import type { SettingsService } from "../../services/SettingsService.js";
import {
  toWireNote,
  toWireChord,
  toWireAnchor,
  toWireHandShape,
  toWireChordTemplate,
  toWirePhrase,
  arrangementStringCount,
} from "../../domain/models/song.js";
import type { Arrangement } from "../../domain/models/song.js";

const PHRASE_CHUNK_SIZE = 50;

function pickArrangement(
  arrangements: readonly Arrangement[],
  requested: number,
  preferredName?: string,
): number {
  if (requested >= 0 && requested < arrangements.length) return requested;

  if (preferredName) {
    const idx = arrangements.findIndex((a) => a.name === preferredName);
    if (idx >= 0) return idx;
  }

  // Fallback: most notes
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < arrangements.length; i++) {
    const arr = arrangements[i];
    const count = arr.notes.length + arr.chords.reduce((s, c) => s + c.notes.length, 0);
    if (count > bestCount) { bestCount = count; best = i; }
  }
  return best;
}

function send(ws: WebSocket, data: unknown): void {
  ws.send(JSON.stringify(data));
}

export const highwayWs = fp(async function highwayWs(fastify) {
  const songService = fastify.songs as SongService;
  const settingsService = fastify.settings as SettingsService;

  fastify.get("/ws/highway/:filename", { websocket: true }, async (ws, req) => {
    const { filename } = req.params as { filename: string };
    const query = req.query as Record<string, string>;
    const arrangementParam = parseInt(query.arrangement ?? "-1", 10);

    try {
      send(ws, { type: "loading", stage: "Extracting..." });

      const extracted = await songService.extractSong(filename);
      const { song } = extracted;

      if (!song.arrangements.length) {
        send(ws, { error: "No arrangements found" });
        ws.close();
        return;
      }

      const settings = settingsService.load();
      const arrIndex = pickArrangement(
        song.arrangements,
        arrangementParam,
        settings.defaultArrangement,
      );
      const arr = song.arrangements[arrIndex];

      // Audio
      const filePath = songService.resolveDlcPath(filename);
      const { url: audioUrl, error: audioError } = songService.getAudioUrl(
        filename,
        filePath,
        extracted.extractedDir,
        extracted.stems,
      );

      // Build stems payload for sloppak
      const stemsPayload = extracted.stems.map((s) => ({
        id: s.id,
        url: `/api/sloppak/${encodeURIComponent(filename)}/file/${encodeURIComponent(s.file)}`,
        default: s.default,
      }));

      const arrList = song.arrangements.map((a, i) => ({
        index: i,
        name: a.name,
        notes: a.notes.length + a.chords.reduce((s, c) => s + c.notes.length, 0),
      }));

      // song_info
      send(ws, {
        type: "song_info",
        title: song.title,
        artist: song.artist,
        duration: song.songLength,
        arrangement: arr.name,
        arrangement_index: arrIndex,
        arrangements: arrList,
        audio_url: audioUrl,
        audio_error: audioError,
        tuning: arr.tuning,
        stringCount: arrangementStringCount(arr),
        capo: arr.capo,
        offset: Number.isFinite(song.offset) ? song.offset : 0,
        format: extracted.format,
        stems: stemsPayload,
      });

      // beats
      send(ws, {
        type: "beats",
        data: song.beats.map((b) => ({ time: b.time, measure: b.measure })),
      });

      // sections
      send(ws, {
        type: "sections",
        data: song.sections.map((s) => ({ time: s.startTime, name: s.name })),
      });

      // anchors
      send(ws, { type: "anchors", data: arr.anchors.map(toWireAnchor) });

      // chord_templates
      send(ws, { type: "chord_templates", data: arr.chordTemplates.map(toWireChordTemplate) });

      // lyrics
      if (song.lyrics.length > 0) {
        send(ws, { type: "lyrics", data: song.lyrics });
      }

      // tone_changes (from sloppak tones or PSARC XML already parsed into arr.tones)
      if (arr.tones) {
        const changes = arr.tones.changes.filter(
          (tc) => Number.isFinite(tc.time) && tc.name,
        ).map((tc) => ({ t: Math.round(tc.time * 1000) / 1000, name: tc.name }));

        if (changes.length > 0 || arr.tones.base) {
          send(ws, { type: "tone_changes", base: arr.tones.base, data: changes });
        }
      }

      // notes
      send(ws, { type: "notes", data: arr.notes.map(toWireNote) });

      // chords
      send(ws, { type: "chords", data: arr.chords.map(toWireChord) });

      // phrases (chunked)
      if (arr.phrases && arr.phrases.length > 0) {
        const phrases = arr.phrases;
        for (let i = 0; i < phrases.length; i += PHRASE_CHUNK_SIZE) {
          send(ws, {
            type: "phrases",
            data: phrases.slice(i, i + PHRASE_CHUNK_SIZE).map(toWirePhrase),
            total: phrases.length,
          });
        }
      }

      send(ws, { type: "ready" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err }, "highway ws error for %s", filename);
      try { send(ws, { error: message }); } catch { /* socket closed */ }
      ws.close();
    }
  });
});
