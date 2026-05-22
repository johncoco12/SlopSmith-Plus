// REST-based highway data client.
// Replaces the WebSocket client — fetches all chart data from /api/tracks/:trackId/highway

import type { ConnectOptions, SongInfo } from './types.js';
import type { ChartState } from './chartState.js';
import type { MasteryFilter } from './masteryFilter.js';
import type { ProjectionHelper } from './projection.js';

export type ReadyCallback = () => void | Promise<void>;

interface HighwayResponse {
  song_info: {
    title?: string;
    artist?: string;
    album?: string;
    arrangement?: string;
    arrangement_index: number;
    arrangements: { index: number; name: string; notes: number }[];
    duration?: number;
    tuning: number[];
    capo: number;
    offset: number;
    stringCount: number;
    format?: string;
  };
  beats: { time: number; measure: number }[];
  sections: { time: number; name: string }[];
  anchors: { time: number; fret: number; width: number }[];
  chord_templates: {
    name: string;
    displayName?: string;
    arp?: true;
    fingers: number[];
    frets: number[];
  }[];
  lyrics: { t: number; d: number; w: string }[];
  tone_changes: { time: number; name: string }[];
  tone_base: string;
  notes: { t: number; s: number; f: number; sus?: number; sl?: number; bn?: number; ho?: true; po?: true; hm?: true; hp?: true; pm?: true; mu?: true; vb?: true; tr?: true; ac?: true; ln?: true; tap?: true }[];
  chords: { t: number; id: number; hd?: true; notes: { s: number; f: number; sus?: number; sl?: number; bn?: number; ho?: true; po?: true; pm?: true; mu?: true; vb?: true; tr?: true; ac?: true; ln?: true; tap?: true }[] }[];
  handshapes: { id: number; st: number; et: number; arp?: true }[];
  phrases?: {
    start_time: number; end_time: number; max_difficulty: number;
    levels: { difficulty: number; notes: unknown[]; chords: unknown[]; anchors: unknown[]; handshapes: unknown[] }[];
  }[];
}

export class HighwayRestClient {
  private generation = 0;

  constructor(
    private readonly state: ChartState,
    private readonly filter: MasteryFilter,
    private readonly proj: ProjectionHelper,
    private readonly emit: (event: string, detail?: unknown) => void,
    private readonly onReady: () => void | Promise<void>,
  ) {}

  async connect(trackId: string, arrangement: number, opts: ConnectOptions = {}): Promise<void> {
    this.generation++;
    const gen = this.generation;
    this.state.reset();
    this.filter.reset();
    this.proj.reset();

    try {
      const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/highway?arrangement=${arrangement}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        const errMsg = String(errBody.error ?? res.statusText);
        console.error('[highway] API error:', errMsg);
        if (opts.onError) opts.onError(errMsg);
        return;
      }

      const data = (await res.json()) as HighwayResponse;

      if (gen !== this.generation) return;

      // Process song_info
      const info = data.song_info;
      const songInfo: SongInfo = {
        title: info.title,
        artist: info.artist,
        arrangement: info.arrangement,
        arrangement_index: info.arrangement_index,
        arrangements: info.arrangements,
        duration: info.duration,
        tuning: info.tuning,
        capo: info.capo,
        offset: info.offset,
        stringCount: info.stringCount,
        format: info.format,
      };
      this.state.applySongInfo(songInfo);

      if (opts.onSongInfo) {
        opts.onSongInfo(songInfo);
      } else {
        this.defaultSongInfoHandler(songInfo);
      }
      this.emitSongLoaded(songInfo);

      if (gen !== this.generation) return;

      // Process chart data
      this.state.beats = data.beats;
      this.state.sections = data.sections;
      this.state.anchors = data.anchors;
      this.proj.seedFromAnchors(data.anchors);
      this.state.chordTemplates = data.chord_templates;
      this.state.lyrics = data.lyrics;
      this.state.toneChanges = data.tone_changes;
      this.state.toneBase = data.tone_base;
      this.state.notes = data.notes;
      this.state.chords = data.chords;
      this.state.handShapes = data.handshapes;

      // Process phrases
      if (data.phrases) {
        for (const p of data.phrases) {
          this.filter.appendPhrase({
            start_time: p.start_time,
            end_time: p.end_time,
            max_difficulty: p.max_difficulty,
            levels: p.levels.map((l) => ({
              difficulty: l.difficulty,
              notes: l.notes,
              chords: l.chords,
              anchors: l.anchors,
              handshapes: l.handshapes,
            })),
          });
        }
      }

      if (gen !== this.generation) return;

      // Signal ready
      this.state.finalise();
      this.filter.finalise();
      console.log(
        `[highway] ready: ${this.state.notes.length} notes, ${this.state.chords.length} chords` +
        (this.filter.hasPhraseData() ? `, phrase data (mastery ${Math.round(this.filter.getMastery() * 100)}%)` : ''),
      );
      await Promise.resolve(this.onReady()).catch(e => console.error('[highway] onReady error:', e));
      this.emit('song:ready', { hasPhraseData: this.filter.hasPhraseData() });
    } catch (e) {
      console.error('[highway] fetch error:', e);
      if (opts.onError) opts.onError(String(e));
    }
  }

  abort(): void {
    this.generation++;
  }

  private emitSongLoaded(info: SongInfo): void {
    this.emit('song:loaded', {
      filename: '',
      title: info.title,
      artist: info.artist,
      duration: info.duration,
      arrangement: info.arrangement,
      arrangementIndex: info.arrangement_index,
      arrangements: info.arrangements ?? [],
      tuning: info.tuning,
      capo: info.capo,
      format: info.format,
    });
  }

  private defaultSongInfoHandler(info: SongInfo): void {
    const sel = (id: string) => document.getElementById(id);
    const set = (id: string, text: string) => { const el = sel(id); if (el) el.textContent = text; };
    set('hud-artist', info.artist ?? '');
    set('hud-title', info.title ?? '');
    set('hud-arrangement', info.arrangement ?? '');

    sel('audio-error-banner')?.remove();

    if (!info.audio_url && info.audio_error) {
      const banner = document.createElement('div');
      banner.id = 'audio-error-banner';
      banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[300] bg-red-900/95 border border-red-700 text-red-100 rounded-lg px-4 py-3 max-w-2xl shadow-xl';
      banner.innerHTML = `<div class="flex items-start gap-3">
        <span class="text-xl">⚠</span>
        <div class="flex-1">
          <div class="font-semibold text-sm">Audio unavailable</div>
          <div class="text-xs text-red-200 mt-1">${info.audio_error}</div>
        </div>
        <button class="text-red-300 hover:text-white text-lg" aria-label="Dismiss">✕</button>
      </div>`;
      banner.querySelector('button')!.addEventListener('click', () => banner.remove());
      document.body.appendChild(banner);
    }

    if (info.arrangements) {
      const select = sel('arr-select') as HTMLSelectElement | null;
      if (select) {
        select.innerHTML = info.arrangements.map(a =>
          `<option value="${a.index}" ${a.index === info.arrangement_index ? 'selected' : ''}>${a.name} (${a.notes})</option>`
        ).join('');
      }
    }
  }
}
