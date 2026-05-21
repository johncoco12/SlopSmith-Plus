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
  // Inside a chord object, same fields; chord time is on ChartChord
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

export interface Renderer {
  contextType?: '2d' | 'webgl2';
  readyPromise?: Promise<void>;
  init?(canvas: HTMLCanvasElement, bundle: RenderBundle): void;
  draw(bundle: RenderBundle): void;
  resize?(w: number, h: number): void;
  destroy?(): void;
}

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
  reconnect(filename: string, arrangement?: number): void;
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
