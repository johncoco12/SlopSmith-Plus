// WebSocket client for the highway stream.
//
// Messages arrive in order but are processed on a serialized async chain so
// async message handlers (e.g. JUCE audio routing on song_info) don't race.

import type { ConnectOptions, SongInfo } from './types.js';
import type { ChartState } from './chartState.js';
import type { MasteryFilter } from './masteryFilter.js';
import type { ProjectionHelper } from './projection.js';

export type ReadyCallback = () => void | Promise<void>;

export class HighwayWsClient {
  private ws: WebSocket | null = null;
  private msgChain = Promise.resolve();
  private generation = 0;

  constructor(
    private readonly state: ChartState,
    private readonly filter: MasteryFilter,
    private readonly proj: ProjectionHelper,
    private readonly emit: (event: string, detail?: unknown) => void,
    private readonly onReady: () => void | Promise<void>,
  ) {}

  connect(wsUrl: string, opts: ConnectOptions = {}): void {
    if (this.ws) { this.ws.close(); this.ws = null; }

    this.generation++;
    const gen = this.generation;
    this.msgChain = Promise.resolve();
    this.state.reset();
    this.filter.reset();
    this.proj.reset();

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onclose = () => console.log('[highway] WS closed');
    ws.onerror = (e) => console.error('[highway] WS error', e);

    ws.onmessage = (ev) => {
      const data = ev.data as string;
      this.msgChain = this.msgChain.then(async () => {
        if (gen !== this.generation) return;
        try {
          await this._handleMessage(JSON.parse(data), gen, opts);
        } catch (e) {
          console.error('[highway] message error:', e);
        }
      }).catch(e => console.error('[highway] chain error:', e));
    };
  }

  close(): void {
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.generation++;
  }

  private async _handleMessage(msg: Record<string, unknown>, gen: number, opts: ConnectOptions): Promise<void> {
    if (msg.error) {
      const errMsg = String(msg.error);
      console.error('[highway] server error:', errMsg);
      if (opts.onError) opts.onError(errMsg);
      else alert('Error: ' + errMsg);
      return;
    }

    switch (msg.type) {
      case 'loading':
        console.log('[highway] loading:', msg.stage);
        break;

      case 'song_info': {
        const info = msg as unknown as SongInfo;
        this.state.applySongInfo(info);
        if (opts.onSongInfo) {
          opts.onSongInfo(info);
        } else {
          this._defaultSongInfoHandler(info);
        }
        this._emitSongLoaded(info);
        break;
      }

      case 'beats':
        this.state.beats = (msg.data as typeof this.state.beats);
        this.emit('beats:loaded', { count: this.state.beats.length });
        break;

      case 'sections':
        this.state.sections = (msg.data as typeof this.state.sections);
        break;

      case 'anchors':
        this.state.anchors = (msg.data as typeof this.state.anchors);
        this.proj.seedFromAnchors(this.state.anchors);
        break;

      case 'chord_templates':
        this.state.chordTemplates = (msg.data as typeof this.state.chordTemplates);
        break;

      case 'lyrics':
        this.state.lyrics = (msg.data as typeof this.state.lyrics);
        break;

      case 'tone_changes':
        this.state.toneChanges = (msg.data as typeof this.state.toneChanges);
        this.state.toneBase = String(msg.base ?? '');
        break;

      case 'notes':
        this.state.notes = this.state.notes.concat(msg.data as typeof this.state.notes);
        break;

      case 'chords':
        this.state.chords = this.state.chords.concat(msg.data as typeof this.state.chords);
        break;

      case 'handshapes':
        this.state.handShapes = this.state.handShapes.concat(msg.data as typeof this.state.handShapes);
        break;

      case 'phrases':
        for (const p of (msg.data as Parameters<MasteryFilter['appendPhrase']>[0][])) {
          this.filter.appendPhrase(p);
        }
        break;

      case 'ready':
        if (gen !== this.generation) return;
        this.state.finalise();
        this.filter.finalise();
        console.log(
          `[highway] ready: ${this.state.notes.length} notes, ${this.state.chords.length} chords` +
          (this.filter.hasPhraseData() ? `, phrase data (mastery ${Math.round(this.filter.getMastery() * 100)}%)` : ''),
        );
        await Promise.resolve(this.onReady()).catch(e => console.error('[highway] onReady error:', e));
        this.emit('song:ready', { hasPhraseData: this.filter.hasPhraseData() });
        break;
    }
  }

  private _emitSongLoaded(info: SongInfo): void {
    const wsUrl = this.ws?.url ?? '';
    const wsPath = wsUrl.split('/ws/highway/')[1] ?? '';
    const filename = decodeURIComponent(wsPath.split('?')[0]);
    this.emit('song:loaded', {
      filename,
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

  private _defaultSongInfoHandler(info: SongInfo): void {
    const set = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('hud-artist', info.artist ?? '');
    set('hud-title', info.title ?? '');
    set('hud-arrangement', info.arrangement ?? '');

    document.getElementById('audio-error-banner')?.remove();

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

    if (info.audio_url) {
      const audio = document.getElementById('audio') as HTMLAudioElement | null;
      if (audio) {
        const filename = info.audio_url.split('/').pop();
        const alreadyLoaded = audio.src && filename && audio.src.includes(filename);
        if (!alreadyLoaded) {
          audio.src = info.audio_url;
          audio.load();
        }
      }
    }

    if (info.arrangements) {
      const sel = document.getElementById('arr-select') as HTMLSelectElement | null;
      if (sel) {
        sel.innerHTML = info.arrangements.map(a =>
          `<option value="${a.index}" ${a.index === info.arrangement_index ? 'selected' : ''}>${a.name} (${a.notes})</option>`
        ).join('');
      }
    }
  }
}
