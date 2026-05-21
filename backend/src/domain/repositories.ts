import type {
  SongMeta,
  LibraryQuery,
  PageResult,
  ArtistGroup,
  LibraryStats,
  TuningCount,
  Loop,
} from "./models/library.js";

// ─── Song repository ───────────────────────────────────────────────────────

export interface SongInput {
  readonly mtime: number;
  readonly size: number;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly year: string;
  readonly duration: number;
  readonly tuning: string;
  readonly tuningName: string;
  readonly tuningSortKey: number;
  readonly arrangements: readonly { index: number; name: string; notes: number }[];
  readonly hasLyrics: boolean;
  readonly format: string;
  readonly stemCount: number;
  readonly stemIds: readonly string[];
}

export interface ISongRepository {
  search(query: LibraryQuery): Promise<PageResult<SongMeta>>;
  artists(opts: { q?: string; letter?: string; page: number; size: number; favoritesOnly: boolean }): Promise<PageResult<ArtistGroup>>;
  stats(): Promise<LibraryStats>;
  tuningNames(): Promise<TuningCount[]>;
  findByFilename(filename: string): Promise<SongMeta | null>;
  findCached(filename: string, mtime: number, size: number): Promise<SongMeta | null>;
  upsert(filename: string, input: SongInput): Promise<void>;
  delete(filename: string): Promise<void>;
  deleteStale(keepFilenames: Set<string>): Promise<number>;
}

// ─── Favorites repository ─────────────────────────────────────────────────

export interface IFavoritesRepository {
  isFavorite(filename: string): Promise<boolean>;
  toggle(filename: string): Promise<boolean>;
  getAllFilenames(): Promise<Set<string>>;
}

// ─── Loop repository ──────────────────────────────────────────────────────

export interface ILoopRepository {
  findByFilename(filename: string): Promise<Loop[]>;
  create(filename: string, name: string, startTime: number, endTime: number): Promise<Loop>;
  delete(id: number): Promise<void>;
}
