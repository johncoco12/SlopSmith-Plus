import type { SongFormat } from "./library.js";

export interface Track {
  readonly id: number;
  readonly trackId: string;
  readonly artist: string;
  readonly title: string;
  readonly album: string;
  readonly year: string;
  readonly duration: number;
  readonly tuning: string;
  readonly hasLyrics: boolean;
  readonly format: SongFormat;
  readonly tuningName: string;
  readonly tuningSortKey: number;
  readonly trackData: TrackData | null;
  readonly stems: TrackStems | null;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}

export interface TrackData {
  readonly id: number;
  readonly trackId: number;
  readonly originalFilename: string;
  readonly arrangements: readonly ArrangementData[];
  readonly coverImageStorageId: string | null;
  readonly audioFileStorageId: string | null;
}

export interface ArrangementData {
  readonly index: number;
  readonly name: string;
  readonly notes: number;
}

export interface TrackStems {
  readonly id: number;
  readonly trackId: number;
  readonly stems: readonly StemData[];
}

export interface StemData {
  readonly id: number;
  readonly trackId: number;
  readonly stemIndex: number;
  readonly arrangement: string | null;
  readonly stemAudioFileStorageId: string | null;
}

export interface CreateTrackInput {
  readonly trackId: string;
  readonly artist?: string;
  readonly title?: string;
  readonly album?: string;
  readonly year?: string;
  readonly duration?: number;
  readonly tuning?: string;
  readonly hasLyrics?: boolean;
  readonly format?: SongFormat;
  readonly tuningName?: string;
  readonly tuningSortKey?: number;
}

export interface UpdateTrackInput {
  readonly trackId?: string;
  readonly artist?: string;
  readonly title?: string;
  readonly album?: string;
  readonly year?: string;
  readonly duration?: number;
  readonly tuning?: string;
  readonly hasLyrics?: boolean;
  readonly format?: SongFormat;
  readonly tuningName?: string;
  readonly tuningSortKey?: number;
}