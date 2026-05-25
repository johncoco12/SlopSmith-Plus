export interface MetadataLookup {
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
}

export interface EnrichedMetadata {
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  readonly year?: string;
  readonly genre?: string;
  readonly albumArt?: string;
  readonly bpm?: number;
  readonly source: string;
  readonly sourceId?: string;
}

export interface IMetadataProvider {
  /** Display name for the provider (e.g. "MusicBrainz", "Spotify") */
  readonly name: string;

  /** Enrich song metadata from an external source */
  enrich(lookup: MetadataLookup): Promise<EnrichedMetadata | null>;
}
