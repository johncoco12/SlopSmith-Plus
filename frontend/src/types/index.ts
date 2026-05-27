export interface Note {
  t: number        // time
  s: number        // string
  f: number        // fret
  sus?: number     // sustain
  ho?: number      // hammer-on
  po?: number      // pull-off
  sl?: number      // slide
  bn?: number      // bend
  [key: string]: unknown
}

export interface ChordNote {
  s: number
  f: number
  sus?: number
  [key: string]: unknown
}

export interface Chord {
  t: number
  id?: number
  notes: ChordNote[]
}

export interface Beat {
  time: number
  measure: number
}

export interface Section {
  time: number
  name: string
}

export interface Anchor {
  time: number
  fret: number
  width: number
}

export interface ChordTemplate {
  name: string
  frets: number[]
  fingers?: number[]
}

export interface LyricWord {
  w: string
  t: number
  d: number
}

export interface ToneChange {
  time: number
  name: string
}

export interface Arrangement {
  name: string
  index: number
}

export interface SongInfo {
  title?: string
  artist?: string
  arrangement?: string
  arrangement_index?: number
  arrangements?: Arrangement[]
  duration?: number
  tuning?: number[]
  capo?: number
  format?: string
  audio_url?: string | null
  audio_error?: string | null
  stems?: string[]
  filename?: string
  [key: string]: unknown
}

export interface Song {
  filename: string
  trackId?: string
  title: string
  artist: string
  album?: string
  duration?: number
  format?: string
  arrangement?: string
  arrangements?: string[]
  stems?: string[]
  has_lyrics?: boolean
  tuning?: string
  isFavorite?: boolean
  bestScore?: number
  [key: string]: unknown
}

export interface LibraryStats {
  total: number
  by_artist?: Record<string, number>
  [key: string]: unknown
}

export interface LibraryFilters {
  arrangements: { has: string[]; lacks: string[] }
  stems: { has: string[]; lacks: string[] }
  lyrics: boolean | null
  tunings: string[]
}

export interface Loop {
  id: number
  profileId: number
  trackId: number
  name: string
  startTime: number
  endTime: number
}

export interface Plugin {
  id: string
  name: string
  version?: string
  type?: string
  nav?: { label: string; screen?: string; section?: string }
  has_settings?: boolean
  has_script?: boolean
  script?: string
  component?: string
  state?: string
  error?: string
  [key: string]: unknown
}

export interface StartupStatus {
  running: boolean
  phase: string
  message?: string
}

export interface ScanStatus {
  scanning: boolean
  message?: string
  status?: string
}

export interface Settings {
  dlc_path?: string
  dlcPath?: string
  lefty?: boolean
  default_arrangement?: string
  defaultArrangement?: string
  psarc_platform?: string
  psarcPlatform?: string
  demucs_url?: string
  demucsUrl?: string
}

export interface VersionInfo {
  version: string
  source_url?: string
  license_url?: string
}

// ─── Auth / Profile / Permissions ──────────────────────────────────────────

export interface SafeProfile {
  id: number
  name: string
  avatarId: number | null
  locked: boolean
  profileSettings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Session {
  token: string
  profileId: number
  profileName: string
  createdAt: number
  expiresAt: number
}

export interface LoginResponse {
  token: string
  expiresAt: number
  profile: SafeProfile
}

export type Permission =
  | 'admin'
  | 'upload'
  | 'edit_tracks'
  | 'delete_tracks'
  | 'manage_profiles'
  | 'manage_permissions'
  | 'manage_settings'

export const PERMISSIONS = {
  ADMIN: 'admin' as Permission,
  UPLOAD: 'upload' as Permission,
  EDIT_TRACKS: 'edit_tracks' as Permission,
  DELETE_TRACKS: 'delete_tracks' as Permission,
  MANAGE_PROFILES: 'manage_profiles' as Permission,
  MANAGE_PERMISSIONS: 'manage_permissions' as Permission,
  MANAGE_SETTINGS: 'manage_settings' as Permission,
}

export interface SetupStatus {
  setup: boolean
}

export interface PermissionGroup {
  id: number
  name: string
  profileIds: number[]
  permissions: string[]
  createdAt: string
  updatedAt: string
}

export interface SlopsmithBus extends EventTarget {
  emit(event: string, detail?: unknown): void
  on(event: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions): void
  off(event: string, fn: EventListenerOrEventListenerObject, opts?: EventListenerOptions): void
  diagnostics?: {
    contribute(pluginId: string, payload: unknown): void
    [key: string]: unknown
  }
  audio?: {
    getFaders?(): FaderDescriptor[]
    onFadersChange?(cb: () => void): () => void
    registerFader?(desc: FaderDescriptor): void
    unregisterFader?(id: string): void
    [key: string]: unknown
  }
}

export interface FaderDescriptor {
  id: string
  label: string
  unit?: string
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  getValue(): number
  setValue(v: number): void
}

declare global {
  interface Window {
    slopsmith: SlopsmithBus
    highway: {
      init(canvas: HTMLCanvasElement): void
      stop(): void
      reconnect(trackId: string, arrangement?: number): Promise<void>
      setAvOffset?(ms: number): void
      setMasterDifficulty?(ratio: number): void
      toggleLyrics?(): void
      setRenderer?(renderer: unknown): void
      setLoop?(a: number | null, b: number | null): void
      setTime?(t: number): void
      getTime?(): number
      getAudioElement?(): HTMLAudioElement | null
      setNoteStateProvider?(fn: ((note: Note, chartTime: number) => { state: string; alpha: number } | null | undefined) | null): void
      getSongInfo(): SongInfo
      getBeats(): Beat[]
      getNotes(): Note[]
      getChords(): Chord[]
      getChordTemplates(): ChordTemplate[]
      getStringCount(): number
      getLefty(): boolean
      getInverted(): boolean
      isDefaultRenderer(): boolean
      fireDrawHooks(ctx: CanvasRenderingContext2D, w: number, h: number): void
      [key: string]: unknown
    }
    pitchYin?: {
      isRunning(): boolean
      start(): Promise<void>
      stop(): void
    }
    slopsmithDesktop?: {
      pickDirectory?(): Promise<string | null>
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}
