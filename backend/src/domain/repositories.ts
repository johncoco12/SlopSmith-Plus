import type {
  SongMeta,
  LibraryQuery,
  PageResult,
  ArtistGroup,
  LibraryStats,
  TuningCount,
  Loop,
} from "./models/library.js";
import type { Profile, CreateProfileInput, UpdateProfileInput } from "./models/profile.js";
import type {
  Track,
  TrackData,
  TrackStems,
  StemData,
  CreateTrackInput,
  UpdateTrackInput,
} from "./models/track.js";
import type {
  PermissionGroup,
  CreatePermissionGroupInput,
  UpdatePermissionGroupInput,
} from "./models/permission.js";

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
  deleteOrphaned(): Promise<number>;
}

// ─── Favorites repository ─────────────────────────────────────────────────

export interface IFavoritesRepository {
  isFavorite(trackId: string, profileId: number): Promise<boolean>;
  toggle(trackId: string, profileId: number): Promise<boolean>;
  getAllFilenames(): Promise<Set<string>>;
  getFavoritesByProfile(profileId: number): Promise<Set<string>>;
  deleteByTrackId(trackId: string): Promise<void>;
}

// ─── Loop repository ──────────────────────────────────────────────────────

export interface ILoopRepository {
  findByTrackId(trackId: number, profileId: number): Promise<Loop[]>;
  create(trackId: number, profileId: number, name: string, startTime: number, endTime: number): Promise<Loop>;
  delete(id: number): Promise<void>;
  deleteAllByTrackId(trackId: number): Promise<void>;
}

// ─── Profile repository ────────────────────────────────────────────────────

export interface IProfileRepository {
  findById(id: number): Promise<Profile | null>;
  findByName(name: string): Promise<Profile | null>;
  findAll(): Promise<Profile[]>;
  create(input: CreateProfileInput): Promise<Profile>;
  update(id: number, input: UpdateProfileInput): Promise<Profile>;
  delete(id: number): Promise<void>;
}

// ─── Track repository ──────────────────────────────────────────────────────

export interface ITrackRepository {
  findById(id: number): Promise<Track | null>;
  findByTrackId(trackId: string): Promise<Track | null>;
  findAll(): Promise<Track[]>;
  create(input: CreateTrackInput): Promise<Track>;
  update(id: number, input: UpdateTrackInput): Promise<Track>;
  delete(id: number): Promise<void>;
}

// ─── Track data repository ─────────────────────────────────────────────────

export interface ITrackDataRepository {
  findByTrackId(trackId: number): Promise<TrackData | null>;
  findByOriginalFilename(originalFilename: string): Promise<TrackData | null>;
  findWithCovers(limit: number): Promise<string[]>;
  create(trackId: number, originalFilename: string, arrangements: unknown, coverImageStorageId?: string, audioFileStorageId?: string): Promise<TrackData>;
  update(id: number, data: Partial<Pick<TrackData, "arrangements" | "coverImageStorageId" | "audioFileStorageId">>): Promise<TrackData>;
  delete(id: number): Promise<void>;
}

// ─── Stems repository ──────────────────────────────────────────────────────

export interface IStemsRepository {
  findByTrackId(trackId: number): Promise<TrackStems | null>;
  create(trackId: number): Promise<TrackStems>;
  delete(id: number): Promise<void>;
}

// ─── Stem data repository ──────────────────────────────────────────────────

export interface IStemDataRepository {
  findByStemsId(stemsId: number): Promise<StemData[]>;
  create(stemsId: number, stemIndex: number, arrangement?: string, stemAudioFileStorageId?: string): Promise<StemData>;
  update(id: number, data: Partial<Pick<StemData, "stemIndex" | "arrangement" | "stemAudioFileStorageId">>): Promise<StemData>;
  delete(id: number): Promise<void>;
}

// ─── Permission group repository ───────────────────────────────────────────

export interface IPermissionGroupRepository {
  findById(id: number): Promise<PermissionGroup | null>;
  findByName(name: string): Promise<PermissionGroup | null>;
  findAll(): Promise<PermissionGroup[]>;
  create(input: CreatePermissionGroupInput): Promise<PermissionGroup>;
  update(id: number, input: UpdatePermissionGroupInput): Promise<PermissionGroup>;
  delete(id: number): Promise<void>;
  addProfile(groupId: number, profileId: number): Promise<PermissionGroup>;
  removeProfile(groupId: number, profileId: number): Promise<PermissionGroup>;
}
