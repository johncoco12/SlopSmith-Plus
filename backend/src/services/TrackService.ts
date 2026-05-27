import type { ITrackRepository, ITrackDataRepository, IStemsRepository, IStemDataRepository, ILoopRepository, IFavoritesRepository, ISongRepository } from "../domain/repositories.js";
import type { Track, TrackData, TrackStems, StemData, UpdateTrackInput } from "../domain/models/track.js";
import type { Loop } from "../domain/models/library.js";
import type { IStorageService } from "../domain/interfaces/services/IStorageService.js";
import { NotFoundError } from "../domain/errors.js";

export class TrackService {
  constructor(
    private readonly tracks: ITrackRepository,
    private readonly trackData: ITrackDataRepository,
    private readonly stems: IStemsRepository,
    private readonly stemData: IStemDataRepository,
    private readonly loops: ILoopRepository,
    private readonly storage: IStorageService,
    private readonly favorites: IFavoritesRepository,
    private readonly songs: ISongRepository,
  ) {}

  async getTrack(trackId: string): Promise<Track> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");
    return track;
  }

  async getTrackData(trackId: string): Promise<TrackData> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");
    const data = await this.trackData.findByTrackId(track.id);
    if (!data) throw new NotFoundError("TrackData");
    return data;
  }

  async getStems(trackId: string): Promise<StemData[]> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");
    const stemsRecord = await this.stems.findByTrackId(track.id);
    if (!stemsRecord) return [];
    return this.stemData.findByStemsId(stemsRecord.id);
  }

  async getCoverArt(trackId: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const data = await this.getTrackData(trackId);
    if (!data.coverImageStorageId) return null;
    const buffer = await this.storage.get(data.coverImageStorageId);
    if (!buffer) return null;
    return { data: buffer, mimeType: "image/png" };
  }

  async getAudio(trackId: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const data = await this.getTrackData(trackId);
    if (!data.audioFileStorageId) return null;
    const buffer = await this.storage.get(data.audioFileStorageId);
    if (!buffer) return null;
    return { data: buffer, mimeType: "audio/mpeg" };
  }

  async getStemAudio(trackId: string, stemIndex: number): Promise<{ data: Buffer; mimeType: string } | null> {
    const allStems = await this.getStems(trackId);
    const stem = allStems.find((s) => s.stemIndex === stemIndex);
    if (!stem || !stem.stemAudioFileStorageId) return null;
    const buffer = await this.storage.get(stem.stemAudioFileStorageId);
    if (!buffer) return null;
    return { data: buffer, mimeType: "audio/ogg" };
  }

  async getLoops(trackId: string, profileId: number): Promise<Loop[]> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");
    return this.loops.findByTrackId(track.id, profileId);
  }

  async addLoop(trackId: string, profileId: number, name: string | undefined, startTime: number, endTime: number): Promise<Loop> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");
    const existing = await this.loops.findByTrackId(track.id, profileId);
    const resolvedName = name ?? `Loop ${existing.length + 1}`;
    return this.loops.create(track.id, profileId, resolvedName, startTime, endTime);
  }

  async deleteLoop(loopId: number): Promise<void> {
    await this.loops.delete(loopId);
  }

  async getCovers(count: number): Promise<string[]> {
    return this.trackData.findWithCovers(count);
  }

  async updateTrack(trackId: string, input: UpdateTrackInput): Promise<Track> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");
    return this.tracks.update(track.id, input);
  }

  async deleteTrack(trackId: string): Promise<void> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new NotFoundError("Track");

    const data = await this.trackData.findByTrackId(track.id);
    if (data) {
      const storageIds = [data.coverImageStorageId, data.audioFileStorageId].filter(Boolean) as string[];
      await Promise.all(storageIds.map((id) => this.storage.delete(id).catch(() => {})));
      await this.songs.delete(data.originalFilename);
      await this.trackData.delete(data.id);
    }

    const stemsRecord = await this.stems.findByTrackId(track.id);
    if (stemsRecord) {
      const stemRows = await this.stemData.findByStemsId(stemsRecord.id);
      const stemStorageIds = stemRows.map((s) => s.stemAudioFileStorageId).filter(Boolean) as string[];
      await Promise.all(stemStorageIds.map((id) => this.storage.delete(id).catch(() => {})));
      await Promise.all(stemRows.map((s) => this.stemData.delete(s.id).catch(() => {})));
      await this.stems.delete(stemsRecord.id).catch(() => {});
    }

    await this.loops.deleteAllByTrackId(track.id);
    await this.favorites.deleteByTrackId(trackId);
    await this.tracks.delete(track.id);
  }
}