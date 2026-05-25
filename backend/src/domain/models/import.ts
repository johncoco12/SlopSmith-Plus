export type ImportFormat = "psarc" | "sloppak" | "loose";

export type ImportStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface ImportJob {
  readonly id: string;
  readonly profileId: number;
  readonly filename: string;
  readonly format: ImportFormat;
  readonly status: ImportStatus;
  readonly progress: number;
  readonly error: string | null;
  readonly trackId: string | null;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
}

export interface ImportResult {
  readonly jobId: string;
  readonly trackId: string;
  readonly title: string;
  readonly artist: string;
  readonly duration: number;
  readonly format: ImportFormat;
  readonly stemCount: number;
  readonly stemIds: readonly string[];
  readonly coverArtStored: boolean;
  readonly audioStored: boolean;
}