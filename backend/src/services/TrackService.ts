import type { ITrackRepository, ITrackDataRepository, IStemsRepository, IStemDataRepository, ILoopRepository } from "../domain/repositories.js";
import type { Track, TrackData, TrackStems, StemData } from "../domain/models/track.js";
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
}