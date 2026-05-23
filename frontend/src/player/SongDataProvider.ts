// SongDataProvider — renderer-agnostic data layer
//
// Handles: REST data loading, chart state, mastery filtering, timing (clock),
// and produces a reactive RenderBundle that any renderer can consume.
//
// Does NOT handle: canvas management, rendering, audio playback (that's the player store).

import { shallowRef, type ShallowRef } from 'vue'
import { ChartClock } from './clock'
import { ChartState } from './chartState'
import { MasteryFilter } from './masteryFilter'
import { ProjectionHelper } from './projection'
import { HighwayRestClient } from './restClient'
import { resolveNoteState } from './noteState'
import type {
  RenderBundle, ConnectOptions, NoteStateProvider, NoteState,
  ChartNote, ChartChordNote, SongInfo, DrawHook,
} from './types'

type EmitFn = (event: string, detail?: unknown) => void

function defaultEmit(event: string, detail?: unknown): void {
  const emitter = (window as unknown as { slopsmith?: { emit?: (e: string, d?: unknown) => void } }).slopsmith
  if (emitter && typeof emitter.emit === 'function') {
    try { emitter.emit(event, detail) } catch { /* ignore */ }
  }
}

export interface SongDataProviderOptions {
  emit?: EmitFn
}

/**
 * SongDataProvider — the data backbone for the highway player.
 *
 * Responsibilities:
 *  - Load chart data via REST (`reconnect`)
 *  - Maintain clock & timing (`setTime`, `getTime`)
 *  - Apply mastery filtering
 *  - Produce a `RenderBundle` every frame via `makeBundle()`
 *  - Expose chart accessors (notes, chords, beats, etc.)
 *
 * Does NOT:
 *  - Own a canvas or renderer
 *  - Manage audio playback
 *  - Know about Three.js, Canvas2D, or TresJS
 */
export class SongDataProvider {
  private clock = new ChartClock()
  private state = new ChartState()
  private filter = new MasteryFilter()
  private proj = new ProjectionHelper()
  private restClient: HighwayRestClient
  private emit: EmitFn

  // Settings (renderer-agnostic display prefs stored here for bundle production)
  private inverted = localStorage.getItem('invertHighway') === 'true'
  private lefty = localStorage.getItem('lefty') === '1'
  private lyricsVisible = localStorage.getItem('showLyrics') !== 'false'
  private renderScale = parseFloat(localStorage.getItem('renderScale') ?? '1') || 1
  private onLyricsChange: ((v: boolean) => void) | null = null

  // Hit detection / note state
  private noteStateProvider: NoteStateProvider | null = null

  // Loop
  private loopA: number | null = null
  private loopB: number | null = null

  // Ready callback
  private _onReady: (() => void | Promise<void>) | null = null

  /** Reactive bundle — renderers watch this */
  readonly bundle: ShallowRef<RenderBundle | null> = shallowRef(null)

  constructor(opts: SongDataProviderOptions = {}) {
    this.emit = opts.emit ?? defaultEmit
    this.restClient = new HighwayRestClient(
      this.state,
      this.filter,
      this.proj,
      this.emit,
      () => this._onReadyFired(),
    )
  }

  // ── Connection / loading ──────────────────────────────────────────────────

  async reconnect(trackId: string, arrangement = 0, opts: ConnectOptions = {}): Promise<void> {
    this._resetState()
    this.restClient.abort()
    await this.restClient.connect(trackId, arrangement, opts)
  }

  stop(): void {
    this.restClient.abort()
    this.clock.reset()
    this.state.isReady = false
    this.state.songInfo = {}
    this.proj.reset()
    this.loopA = null
    this.loopB = null
    this.bundle.value = null
  }

  /** Returns the shared <audio> element used for playback. */
  getAudioElement(): HTMLAudioElement | null {
    return document.getElementById('audio') as HTMLAudioElement | null
  }

  // ── Timing ────────────────────────────────────────────────────────────────

  setTime(audioT: number): void {
    this.clock.setTime(audioT)
    this._checkLoop()
  }

  getTime(): number {
    return this.clock.getTime()
  }

  setAvOffset(ms: number): void { this.clock.setAvOffset(ms) }
  getAvOffset(): number { return this.clock.getAvOffset() }

  getBPM(t: number): number {
    const beats = this.state.beats
    if (beats.length < 2) return 120
    let closest = 0
    for (let i = 1; i < beats.length; i++) {
      if (Math.abs(beats[i].time - t) < Math.abs(beats[closest].time - t)) closest = i
    }
    const start = Math.max(0, closest - 2)
    const end = Math.min(beats.length - 1, closest + 2)
    let sum = 0, count = 0
    for (let i = start; i < end; i++) {
      sum += beats[i + 1].time - beats[i].time
      count++
    }
    return count > 0 ? 60 / (sum / count) : 120
  }

  // ── Mastery ───────────────────────────────────────────────────────────────

  setMastery(fraction: number): void { this.filter.setMastery(fraction) }
  setMasterDifficulty(fraction: number): void { this.setMastery(fraction) }
  getMastery(): number { return this.filter.getMastery() }
  hasPhraseData(): boolean { return this.filter.hasPhraseData() }

  // ── Settings ──────────────────────────────────────────────────────────────

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.25, Math.min(1, scale))
    localStorage.setItem('renderScale', String(this.renderScale))
  }
  getRenderScale(): number { return this.renderScale }

  setInverted(v: boolean): void { this.inverted = v; localStorage.setItem('invertHighway', String(v)) }
  getInverted(): boolean { return this.inverted }
  setLefty(on: boolean): void { this.lefty = !!on; localStorage.setItem('lefty', this.lefty ? '1' : '0') }
  getLefty(): boolean { return this.lefty }

  toggleLyrics(): void {
    this.lyricsVisible = !this.lyricsVisible
    localStorage.setItem('showLyrics', String(this.lyricsVisible))
    this.onLyricsChange?.(this.lyricsVisible)
  }
  getLyricsVisible(): boolean { return this.lyricsVisible }
  setLyricsVisible(v: boolean): void {
    this.lyricsVisible = !!v
    this.onLyricsChange?.(this.lyricsVisible)
  }
  setOnLyricsChange(fn: ((v: boolean) => void) | null): void { this.onLyricsChange = fn }

  /** No-op — renderer switching is handled by RendererManager */
  setRenderer(_r: unknown): void { /* noop */ }

  // ── Note state ────────────────────────────────────────────────────────────

  setNoteStateProvider(fn: NoteStateProvider | null): void {
    this.noteStateProvider = typeof fn === 'function' ? fn : null
  }
  getNoteStateProvider(): NoteStateProvider | null { return this.noteStateProvider }
  getNoteState(note: ChartNote | ChartChordNote, chartTime: number): NoteState | null {
    return this.noteStateProvider ? resolveNoteState(this.noteStateProvider, note as ChartNote, chartTime) : null
  }

  // ── Data accessors ────────────────────────────────────────────────────────

  getNotes(): ChartNote[] {
    return this.filter.getFiltered().notes ?? this.state.notes
  }
  getChords() { return this.filter.getFiltered().chords ?? this.state.chords }
  getBeats() { return this.state.beats }
  getSections() { return this.state.sections }
  getChordTemplates() { return this.state.chordTemplates }
  getSongInfo(): SongInfo { return this.state.songInfo }
  getStringCount(): number { return this.state.stringCount }
  getToneChanges() { return this.state.toneChanges }
  getToneBase(): string { return this.state.toneBase }

  // ── Projection (for 2D renderer) ─────────────────────────────────────────

  project(tOffset: number) { return this.proj.project(tOffset) }
  fretX(fret: number, scale: number, w: number): number { return this.proj.fretX(fret, scale, w) }

  // ── Loop ──────────────────────────────────────────────────────────────────

  setLoop(a: number | null, b: number | null): void {
    this.loopA = a
    this.loopB = b
  }

  // ── Bundle production ─────────────────────────────────────────────────────

  /**
   * Produces a fresh RenderBundle snapshot.
   * Call this every frame (e.g. from rAF or useLoop).
   * Also updates the reactive `this.bundle` shallowRef.
   */
  makeBundle(): RenderBundle {
    const filtered = this.filter.getFiltered()
    const currentTime = this.clock.getCurrentTime()

    this.proj.updateSmoothing(
      filtered.anchors ?? this.state.anchors,
      currentTime,
      1 / 60,
    )

    const proj = this.proj
    const provider = this.noteStateProvider
    const getNoteState = (note: ChartNote | ChartChordNote, chartTime: number): NoteState | null =>
      provider ? resolveNoteState(provider, note as ChartNote, chartTime) : null

    const bundle: RenderBundle = {
      currentTime,
      songInfo: this.state.songInfo,
      isReady: this.state.isReady,
      notes: filtered.notes ?? this.state.notes,
      chords: filtered.chords ?? this.state.chords,
      anchors: filtered.anchors ?? this.state.anchors,
      beats: this.state.beats,
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
    }

    this.bundle.value = bundle
    return bundle
  }

  // ── Ready callback ────────────────────────────────────────────────────────

  set onReady(fn: (() => void | Promise<void>) | null) { this._onReady = fn }
  get onReady() { return this._onReady }

  get isReady(): boolean { return this.state.isReady }

  // ── Private ───────────────────────────────────────────────────────────────

  private _resetState(): void {
    this.state.reset()
    this.filter.reset()
    this.proj.reset()
    this.loopA = null
    this.loopB = null
  }

  private async _onReadyFired(): Promise<void> {
    if (this._onReady) {
      await Promise.resolve(this._onReady()).catch(e => console.error('[SongDataProvider] onReady error:', e))
    }
  }

  private _checkLoop(): void {
    if (this.loopA === null || this.loopB === null) return
    const audio = document.getElementById('audio') as HTMLAudioElement | null
    if (!audio || audio.paused) return
    const end = Math.max(this.loopA, this.loopB)
    if (audio.currentTime > end) {
      audio.currentTime = Math.min(this.loopA, this.loopB)
    }
  }
}
