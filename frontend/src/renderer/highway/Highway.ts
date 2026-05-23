// Highway — the main class.
//
// Ties together the clock, chart state, mastery filter, renderer manager,
// and WebSocket client. Exposes the full HighwayApi surface matching the
// legacy window.highway contract so the Vue player store works unchanged.

import { ChartClock } from '@/player/clock';
import { ChartState } from '@/player/chartState';
import { HitDetector } from '@/player/hitDetection';
import { MasteryFilter } from '@/player/masteryFilter';
import { ProjectionHelper, VISIBLE_SECONDS } from '@/player/projection';
import { RendererManager } from '@/player/RendererManager';
import { HighwayRestClient } from '@/player/restClient';
import { resolveNoteState } from '@/player/noteState';
import type {
  HighwayApi, ConnectOptions, Renderer, DrawHook, RenderBundle,
  NoteStateProvider, NoteState, ChartNote, ChartChordNote,
  Beat, ChartChord, Section, Anchor, ChordTemplate, Lyric, ToneChange,
  HandShape, SongInfo,
} from '@/player/types';

type SlopsmithEmitter = {
  emit?: (event: string, detail?: unknown) => void;
  on?: (event: string, handler: (e: Event) => void) => void;
};

function slopsmithEmit(event: string, detail?: unknown): void {
  const emitter = (window as unknown as { slopsmith?: SlopsmithEmitter }).slopsmith;
  if (emitter && typeof emitter.emit === 'function') {
    try { emitter.emit(event, detail); } catch { /* ignore */ }
  }
}

export class Highway implements HighwayApi {
  private clock = new ChartClock();
  private state = new ChartState();
  private filter = new MasteryFilter();
  private proj = new ProjectionHelper();
  private rendererMgr: RendererManager;
  private restClient: HighwayRestClient;

  private renderScale = parseFloat(localStorage.getItem('renderScale') ?? '1') || 1;
  private inverted = localStorage.getItem('invertHighway') === 'true';
  private lefty = localStorage.getItem('lefty') === '1';
  private lyricsVisible = localStorage.getItem('showLyrics') !== 'false';
  private onLyricsChange: ((v: boolean) => void) | null = null;

  readonly hitDetector: HitDetector;
  private noteStateProvider: NoteStateProvider | null = null;
  private drawHooks: DrawHook[] = [];
  private connectOpts: ConnectOptions = {};
  private resizeContainer: Element | null = null;
  private resizeHandler: (() => void) | null = null;
  private loopA: number | null = null;
  private loopB: number | null = null;
  private loopInterval: ReturnType<typeof setInterval> | null = null;

  _onReady: (() => void | Promise<void>) | null = null;

  constructor() {
    this.hitDetector = new HitDetector(this);
    this.rendererMgr = new RendererManager(slopsmithEmit);
    this.restClient = new HighwayRestClient(
      this.state,
      this.filter,
      this.proj,
      slopsmithEmit,
      () => this._onReadyFired(),
    );
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement, container?: Element | null): void {
    this.hitDetector.setup();
    this.resizeContainer = container ?? null;
    this.rendererMgr.setCanvas(canvas);
    this.resize();
    this.rendererMgr.setRenderer(null); // install default renderer
    this.rendererMgr.getDefaultRenderer().setHooks(this.drawHooks);

    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);

    this._resetSongState();
  }

  resize(): void {
    this.rendererMgr.resize(this.resizeContainer, this.renderScale);
  }

  // ── Connection ────────────────────────────────────────────────────────────

  connect(wsUrl: string, opts: ConnectOptions = {}): void {
    // Legacy compat — no-op; use reconnect(trackId, arrangement) instead
  }

  async reconnect(trackId: string, arrangement = 0): Promise<void> {
    this._resetSongState();
    this.restClient.abort();
    await this.restClient.connect(trackId, arrangement, this.connectOpts);
  }

  stop(): void {
    this.hitDetector.teardown();
    this.rendererMgr.stopLoop();
    this.restClient.abort();
    this._clearLoopInterval();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.clock.reset();
    this.rendererMgr.setRenderer(null); // destroy current, revert to default (will be re-init'd on next init())
    this.state.isReady = false;
    this.state.songInfo = {};
    this.proj.reset();
  }

  // ── Timing ────────────────────────────────────────────────────────────────

  setTime(audioT: number): void {
    this.clock.setTime(audioT);
    this._checkLoop();
  }

  getTime(): number {
    return this.clock.getTime();
  }

  setAvOffset(ms: number): void { this.clock.setAvOffset(ms); }
  getAvOffset(): number { return this.clock.getAvOffset(); }

  getBPM(t: number): number {
    const beats = this.state.beats;
    if (beats.length < 2) return 120;
    let closest = 0;
    for (let i = 1; i < beats.length; i++) {
      if (Math.abs(beats[i].time - t) < Math.abs(beats[closest].time - t)) closest = i;
    }
    const start = Math.max(0, closest - 2);
    const end   = Math.min(beats.length - 1, closest + 2);
    let sum = 0, count = 0;
    for (let i = start; i < end; i++) {
      sum += beats[i + 1].time - beats[i].time;
      count++;
    }
    return count > 0 ? 60 / (sum / count) : 120;
  }

  // ── Mastery ───────────────────────────────────────────────────────────────

  setMastery(fraction: number): void {
    this.filter.setMastery(fraction);
  }

  /** Alias used by the player store. */
  setMasterDifficulty(fraction: number): void {
    this.setMastery(fraction);
  }

  getMastery(): number { return this.filter.getMastery(); }
  hasPhraseData(): boolean { return this.filter.hasPhraseData(); }

  // ── Render settings ───────────────────────────────────────────────────────

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.25, Math.min(1, scale));
    localStorage.setItem('renderScale', String(this.renderScale));
    this.resize();
  }
  getRenderScale(): number { return this.renderScale; }

  setInverted(v: boolean): void { this.inverted = v; localStorage.setItem('invertHighway', String(v)); }
  getInverted(): boolean { return this.inverted; }
  setLefty(on: boolean): void { this.lefty = !!on; localStorage.setItem('lefty', this.lefty ? '1' : '0'); }
  getLefty(): boolean { return this.lefty; }

  // ── Renderer ──────────────────────────────────────────────────────────────

  setRenderer(r: Renderer | null): void { this.rendererMgr.setRenderer(r); }
  isDefaultRenderer(): boolean { return this.rendererMgr.isDefault(); }

  // ── Data accessors ────────────────────────────────────────────────────────

  getNotes(): ChartNote[] {
    const filtered = this.filter.getFiltered().notes;
    return filtered ?? this.state.notes;
  }
  getChords(): ChartChord[] {
    const filtered = this.filter.getFiltered().chords;
    return filtered ?? this.state.chords;
  }
  getBeats(): Beat[] { return this.state.beats; }
  getSections(): Section[] { return this.state.sections; }
  getChordTemplates(): ChordTemplate[] { return this.state.chordTemplates; }
  getSongInfo(): SongInfo { return this.state.songInfo; }
  getStringCount(): number { return this.state.stringCount; }
  getToneChanges(): ToneChange[] { return this.state.toneChanges; }
  getToneBase(): string { return this.state.toneBase; }

  // ── Draw hooks ────────────────────────────────────────────────────────────

  addDrawHook(fn: DrawHook): void { this.drawHooks.push(fn); }
  removeDrawHook(fn: DrawHook): void { this.drawHooks = this.drawHooks.filter(h => h !== fn); }
  fireDrawHooks(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    this.rendererMgr.fireHooks(ctx, W, H);
  }

  // ── Note state ────────────────────────────────────────────────────────────

  setNoteStateProvider(fn: NoteStateProvider | null): void {
    this.noteStateProvider = typeof fn === 'function' ? fn : null;
  }
  getNoteStateProvider(): NoteStateProvider | null { return this.noteStateProvider; }
  getNoteState(note: ChartNote | ChartChordNote, chartTime: number): NoteState | null {
    return this.noteStateProvider ? resolveNoteState(this.noteStateProvider, note as ChartNote, chartTime) : null;
  }

  // ── Geometry helpers ──────────────────────────────────────────────────────

  project(tOffset: number) { return this.proj.project(tOffset); }
  fretX(fret: number, scale: number, w: number): number { return this.proj.fretX(fret, scale, w); }

  fillTextUnmirrored(text: string, x: number, y: number): void {
    // Exposed for plugin draw hooks that want to render un-mirrored text while
    // inside the lefty transform. The default renderer handles this in its
    // draw loop; plugins calling addDrawHook and receiving the already-
    // transformed ctx can call this helper. This implementation is a no-op
    // stub — the real implementation lives inside the DefaultRenderer's
    // draw loop where the ctx reference is available. Plugins that need this
    // should check bundle.lefty and apply their own transform.
    void text; void x; void y;
  }

  // ── Lyrics ────────────────────────────────────────────────────────────────

  toggleLyrics(): void {
    this.lyricsVisible = !this.lyricsVisible;
    localStorage.setItem('showLyrics', String(this.lyricsVisible));
    this.onLyricsChange?.(this.lyricsVisible);
  }
  getLyricsVisible(): boolean { return this.lyricsVisible; }
  setLyricsVisible(v: boolean): void {
    this.lyricsVisible = !!v;
    this.onLyricsChange?.(this.lyricsVisible);
  }
  setOnLyricsChange(fn: ((v: boolean) => void) | null): void { this.onLyricsChange = fn; }

  // ── Audio element ─────────────────────────────────────────────────────────

  getAudioElement(): HTMLAudioElement | null {
    return document.getElementById('audio') as HTMLAudioElement | null;
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  setVisible(v: boolean | null): void { this.rendererMgr.setVisible(v); }
  isVisible(): boolean { return this.rendererMgr.isVisible(); }

  // ── Loop ──────────────────────────────────────────────────────────────────

  setLoop(a: number | null, b: number | null): void {
    this.loopA = a;
    this.loopB = b;
    if (a === null || b === null) {
      this._clearLoopInterval();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _resetSongState(): void {
    this.state.reset();
    this.filter.reset();
    this.proj.reset();
    this.loopA = null;
    this.loopB = null;
    this._clearLoopInterval();
  }

  private async _onReadyFired(): Promise<void> {
    this.rendererMgr.startLoop(() => this._makeBundle());
    if (this._onReady) {
      await Promise.resolve(this._onReady()).catch(e => console.error('[highway] _onReady error:', e));
    }
  }

  private _makeBundle(): RenderBundle {
    const filtered = this.filter.getFiltered();
    const currentTime = this.clock.getCurrentTime();

    // Smooth the fret zoom once per bundle (approximately once per frame).
    this.proj.updateSmoothing(
      filtered.anchors ?? this.state.anchors,
      currentTime,
      1 / 60,
    );

    const proj = this.proj;
    const lefty = this.lefty;
    const canvas = this.rendererMgr['canvas'] as HTMLCanvasElement | null;
    const ctx2d = canvas?.getContext('2d') ?? null;

    const fillTextReadable = (text: string, x: number, y: number): void => {
      if (!ctx2d || !canvas) return;
      if (!lefty) { ctx2d.fillText(text, x, y); return; }
      ctx2d.save();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.fillText(text, canvas.width - x, y);
      ctx2d.restore();
    };

    const provider = this.noteStateProvider;
    const getNoteState = (note: ChartNote | ChartChordNote, chartTime: number): NoteState | null =>
      provider ? resolveNoteState(provider, note as ChartNote, chartTime) : null;

    return {
      currentTime,
      songInfo: this.state.songInfo,
      isReady: this.state.isReady,
      notes:   filtered.notes   ?? this.state.notes,
      chords:  filtered.chords  ?? this.state.chords,
      anchors: filtered.anchors ?? this.state.anchors,
      beats:   this.state.beats,
      sections: this.state.sections,
      chordTemplates: this.state.chordTemplates,
      stringCount: this.state.stringCount,
      tuning: this.state.songInfo.tuning,
      capo: this.state.songInfo.capo,
      lyrics: this.state.lyrics,
      toneChanges: this.state.toneChanges,
      toneBase: this.state.toneBase,
      handShapes: (filtered.handShapes !== null && filtered.phrasesHaveHandShapes)
        ? filtered.handShapes
        : this.state.handShapes,
      mastery: this.filter.getMastery(),
      hasPhraseData: this.filter.hasPhraseData(),
      inverted: this.inverted,
      lefty: this.lefty,
      renderScale: this.renderScale,
      lyricsVisible: this.lyricsVisible,
      project: (t) => proj.project(t),
      fretX: (f, s, w) => proj.fretX(f, s, w),
      getNoteState,
      // Private fields consumed by DefaultRenderer.
      _displayMaxFret: proj.displayMaxFret,
      _fillTextReadable: fillTextReadable,
    } as RenderBundle;
  }

  private _checkLoop(): void {
    if (this.loopA === null || this.loopB === null) return;
    const audio = this.getAudioElement();
    if (!audio || audio.paused) return;
    const end = Math.max(this.loopA, this.loopB);
    if (audio.currentTime > end) {
      audio.currentTime = Math.min(this.loopA, this.loopB);
    }
  }

  private _clearLoopInterval(): void {
    if (this.loopInterval !== null) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }
}
