// ── Wire types (matching WS message shapes from the backend) ─────────────────

export interface ChartNote {
  t: number;   // time
  s: number;   // string index
  f: number;   // fret
  sus?: number; // sustain duration
  ho?: boolean; // hammer-on
  po?: boolean; // pull-off
  tp?: boolean; // tap
  sl?: number;  // slide-to fret (-1 = none)
  bn?: number;  // bend (semitones: 0.5, 1, 1.5, 2)
  hm?: boolean; // harmonic
  hp?: boolean; // pinch harmonic
  pm?: boolean; // palm mute
  tr?: boolean; // tremolo
  ac?: boolean; // accent
  vb?: boolean; // vibrato
  mt?: boolean; // mute
  dn?: boolean; // dead note
}

export interface ChartChordNote extends ChartNote {
  // Inside a chord object; chord time is on ChartChord.t
}

export interface ChartChord {
  id: number;
  t: number;
  hd?: boolean; // hide chord name
  notes: ChartChordNote[];
}

export interface Beat {
  time: number;
  measure: number;  // -1 = beat, >=0 = measure number
}

export interface Section {
  time: number;
  name: string;
}

export interface Anchor {
  time: number;
  fret: number;
  width: number;
}

export interface ChordTemplate {
  name: string;
  frets: number[];    // per-string fret (0 = open, -1 = muted/unused)
  fingers: number[];  // per-string finger (-1 = unused, 0 = open, n = finger)
}

export interface Lyric {
  w: string;   // word/syllable text (trailing "-" = continues, "+" = line break)
  t: number;   // start time
  d: number;   // duration
}

export interface ToneChange {
  time: number;
  name: string;
}

export interface HandShape {
  start_time: number;
  end_time: number;
  chord_id: number;
}

export interface PhraseLevel {
  difficulty: number;
  notes: ChartNote[];
  chords: ChartChord[];
  anchors: Anchor[];
  handshapes?: HandShape[];
}

export interface Phrase {
  start_time: number;
  end_time: number;
  max_difficulty: number;
  levels: PhraseLevel[];
}

export interface SongInfo {
  title?: string;
  artist?: string;
  arrangement?: string;
  arrangement_index?: number;
  arrangements?: Array<{ index: number; name: string; notes: number }>;
  duration?: number;
  tuning?: number[];
  capo?: number;
  format?: string;
  audio_url?: string | null;
  audio_error?: string | null;
  stems?: Array<{ id: string; url: string; default: boolean }>;
  stringCount?: number;
  offset?: number;
  [key: string]: unknown;
}

// ── Renderer contract ─────────────────────────────────────────────────────────

export interface RenderBundle {
  currentTime: number;
  songInfo: SongInfo;
  isReady: boolean;
  notes: ChartNote[];
  chords: ChartChord[];
  anchors: Anchor[];
  beats: Beat[];
  sections: Section[];
  chordTemplates: ChordTemplate[];
  stringCount: number;
  tuning?: number[];
  capo?: number;
  lyrics: Lyric[];
  toneChanges: ToneChange[];
  toneBase: string;
  handShapes: HandShape[];
  mastery: number;
  hasPhraseData: boolean;
  inverted: boolean;
  lefty: boolean;
  renderScale: number;
  lyricsVisible: boolean;
  project: (tOffset: number) => { y: number; scale: number } | null;
  fretX: (fret: number, scale: number, w: number) => number;
  getNoteState: (note: ChartNote | ChartChordNote, chartTime: number) => NoteState | null;
}

// ── Renderer requirements & capabilities ─────────────────────────────────────

/** What a renderer needs from the platform to run. */
export interface RendererRequirements {
  /** Canvas context type needed (canvas-based renderers only). */
  contextType?: '2d' | 'webgl2' | 'webgpu';
  /** Minimum viewport width in CSS pixels (optional). */
  minWidth?: number;
  /** Minimum viewport height in CSS pixels (optional). */
  minHeight?: number;
  /** Requires hardware-accelerated GPU (e.g. no software fallback). */
  hardwareAcceleration?: boolean;
  /** Requires a specific set of WebGL extensions (webgl2 only). */
  webglExtensions?: string[];
  /** Max recommended note count before performance degrades. */
  maxNotes?: number;
}

/** Result of a support check. */
export interface RendererSupportResult {
  supported: boolean;
  reason?: string;
}

/** How the renderer integrates with the player. */
export type RendererType = 'canvas' | 'scene';

// ── Renderer descriptor (metadata + factory) ─────────────────────────────────

/**
 * Complete description of a renderer for the registry.
 * Contains everything needed to display, check support, and instantiate.
 */
export interface RendererDescriptor {
  /** Unique stable identifier (e.g. 'highway-2d', 'modernway-3d'). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description of the renderer. */
  description?: string;
  /** Integration type: 'canvas' = RendererManager draws, 'scene' = Vue component. */
  type: RendererType;
  /** Platform requirements. Checked before instantiation. */
  requirements: RendererRequirements;
  /** Optional thumbnail/icon path for UI. */
  icon?: string;
  /** Factory that creates the runtime renderer (canvas type only). */
  createRenderer?: () => CanvasRenderer;
  /** Async component import (scene type only — loaded with defineAsyncComponent). */
  sceneComponent?: () => Promise<{ default: any }>;
}

// ── Canvas renderer interface (drawn by RendererManager rAF loop) ────────────

/**
 * A canvas-based renderer that the RendererManager drives each frame.
 * The manager provides the canvas, calls init/draw/resize/destroy.
 */
export interface CanvasRenderer {
  /** Canvas context type needed. */
  readonly contextType: '2d' | 'webgl2';
  /** Optional async init (e.g. loading shaders). Resolves when ready to draw. */
  readyPromise?: Promise<void>;
  /** Called once with the canvas element. Acquire context here. */
  init?(canvas: HTMLCanvasElement): void;
  /** Called every frame with the current RenderBundle. */
  draw(bundle: RenderBundle): void;
  /** Called when the canvas is resized (pixel dimensions). */
  resize?(w: number, h: number): void;
  /** Cleanup resources. Called before switching away or unmounting. */
  destroy?(): void;
}

// ── Legacy alias ─────────────────────────────────────────────────────────────
/** @deprecated Use CanvasRenderer instead. */
export type Renderer = CanvasRenderer;

// ── Note-state provider (slopsmith#254) ──────────────────────────────────────

export interface NoteState {
  state: 'hit' | 'active' | 'miss';
  alpha: number;  // 0..1
  color: string | null;
}

export type NoteStateRaw =
  | 'hit' | 'active' | 'miss'
  | { state: 'hit' | 'active' | 'miss'; alpha?: number; color?: string };

export type NoteStateProvider = (
  note: ChartNote | ChartChordNote,
  chartTime: number
) => NoteStateRaw | null | undefined | false | 0;

// ── Highway public API ────────────────────────────────────────────────────────

export interface HighwayApi {
  init(canvas: HTMLCanvasElement, container?: Element | null): void;
  resize(): void;
  connect(wsUrl: string, opts?: ConnectOptions): void;
  reconnect(trackId: string, arrangement?: number): Promise<void>;
  stop(): void;

  setTime(t: number): void;
  getTime(): number;
  setAvOffset(ms: number): void;
  getAvOffset(): number;
  getBPM(t: number): number;

  setMastery(fraction: number): void;
  getMastery(): number;
  hasPhraseData(): boolean;

  setRenderScale(scale: number): void;
  getRenderScale(): number;

  setInverted(v: boolean): void;
  getInverted(): boolean;
  setLefty(on: boolean): void;
  getLefty(): boolean;

  setRenderer(r: Renderer | null): void;
  isDefaultRenderer(): boolean;

  getNotes(): ChartNote[];
  getChords(): ChartChord[];
  getBeats(): Beat[];
  getSections(): Section[];
  getChordTemplates(): ChordTemplate[];
  getSongInfo(): SongInfo;
  getStringCount(): number;
  getToneChanges(): ToneChange[];
  getToneBase(): string;

  addDrawHook(fn: DrawHook): void;
  removeDrawHook(fn: DrawHook): void;
  fireDrawHooks(ctx: CanvasRenderingContext2D, W: number, H: number): void;

  setNoteStateProvider(fn: NoteStateProvider | null): void;
  getNoteStateProvider(): NoteStateProvider | null;
  getNoteState(note: ChartNote | ChartChordNote, chartTime: number): NoteState | null;

  project(tOffset: number): { y: number; scale: number } | null;
  fretX(fret: number, scale: number, w: number): number;
  fillTextUnmirrored(text: string, x: number, y: number): void;

  toggleLyrics(): void;
  getLyricsVisible(): boolean;
  setLyricsVisible(v: boolean): void;
  setOnLyricsChange(fn: ((visible: boolean) => void) | null): void;

  getAudioElement(): HTMLAudioElement | null;
  setVisible(v: boolean | null): void;
  isVisible(): boolean;

  setLoop(a: number | null, b: number | null): void;
  setMasterDifficulty(fraction: number): void;  // alias for setMastery

  _onReady?: (() => void | Promise<void>) | null;
}

export interface ConnectOptions {
  onSongInfo?: (info: SongInfo) => void;
  onError?: (msg: string) => void;
}

export type DrawHook = (ctx: CanvasRenderingContext2D, W: number, H: number) => void;

// ── Painter context ───────────────────────────────────────────────────────────

export interface DrawContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly W: number;
  readonly H: number;
  readonly currentTime: number;
  readonly notes: ChartNote[];
  readonly chords: ChartChord[];
  readonly anchors: Anchor[];
  readonly beats: Beat[];
  readonly chordTemplates: ChordTemplate[];
  readonly handShapes: HandShape[];
  readonly stringCount: number;
  readonly inverted: boolean;
  readonly lefty: boolean;
  readonly noteStateProvider: NoteStateProvider | null;
  readonly displayMaxFret: number;
  readonly project: (tOffset: number) => { y: number; scale: number } | null;
  readonly fretX: (fret: number, scale: number, w: number) => number;
  readonly fillTextReadable: (text: string, x: number, y: number) => void;
}
