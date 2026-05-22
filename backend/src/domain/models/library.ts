// ─── Library metadata ─────────────────────────────────────────────────────

export type SongFormat = "psarc" | "sloppak" | "loose";

export interface ArrangementMeta {
  readonly index: number;
  readonly name: string;
  readonly notes: number;
}

export interface SongMeta {
  readonly filename: string;
  readonly trackId?: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly year: string;
  readonly duration: number;
  readonly tuning: string;
  readonly tuningName: string;
  readonly tuningSortKey: number;
  readonly arrangements: readonly ArrangementMeta[];
  readonly hasLyrics: boolean;
  readonly format: SongFormat;
  readonly stemCount: number;
  readonly stemIds: readonly string[];
  readonly mtime: number;
  readonly favorite?: boolean;
  readonly hasEstd?: boolean;
}

export type SortField =
  | "artist"
  | "artist-desc"
  | "title"
  | "title-desc"
  | "recent"
  | "tuning"
  | "year"
  | "year-desc";

export interface LibraryQuery {
  readonly q?: string;
  readonly page: number;
  readonly size: number;
  readonly sort: SortField;
  readonly favoritesOnly: boolean;
  readonly format?: SongFormat;
  readonly arrangementsHas: readonly string[];
  readonly arrangementsLacks: readonly string[];
  readonly stemsHas: readonly string[];
  readonly stemsLacks: readonly string[];
  readonly hasLyrics?: boolean;
  readonly tunings: readonly string[];
}

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
}

export interface ArtistAlbum {
  readonly name: string;
  readonly songs: readonly SongMeta[];
}

export interface ArtistGroup {
  readonly name: string;
  readonly albums: readonly ArtistAlbum[];
}

export interface LibraryStats {
  readonly totalSongs: number;
  readonly totalArtists: number;
  readonly letters: Record<string, number>;
}

export interface TuningCount {
  readonly name: string;
  readonly count: number;
}

// ─── Scanner ─────────────────────────────────────────────────────────────

export type ScanStage = "idle" | "listing" | "scanning" | "complete" | "error";

export interface ScanStatus {
  readonly running: boolean;
  readonly stage: ScanStage;
  readonly total: number;
  readonly done: number;
  readonly current: string;
  readonly error?: string;
  readonly isFirstScan: boolean;
}

// ─── Settings ─────────────────────────────────────────────────────────────

export type PsarcPlatform = "both" | "pc" | "mac";
export type DefaultArrangement = "Lead" | "Rhythm" | "Bass" | "Combo";

export interface Settings {
  readonly dlcDir?: string;
  readonly psarcPlatform?: PsarcPlatform;
  readonly defaultArrangement?: DefaultArrangement;
  readonly masterDifficulty?: number;
  readonly avOffsetMs?: number;
  readonly demucsServerUrl?: string;
}

// ─── Loop ─────────────────────────────────────────────────────────────────

export interface Loop {
  readonly id: number;
  readonly profileId: number;
  readonly trackId: number;
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly createdAt: Date;
}
