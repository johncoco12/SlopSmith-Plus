import type { ILoopRepository } from "../domain/repositories.js";
import type { Loop } from "../domain/models/library.js";

export class LoopService {
  constructor(private readonly loops: ILoopRepository) {}

  getForTrack(trackId: number, profileId: number): Promise<Loop[]> {
    return this.loops.findByTrackId(trackId, profileId);
  }

  async create(trackId: number, profileId: number, name: string | undefined, startTime: number, endTime: number): Promise<Loop> {
    const existing = await this.loops.findByTrackId(trackId, profileId);
    const resolvedName = name ?? `Loop ${existing.length + 1}`;
    return this.loops.create(trackId, profileId, resolvedName, startTime, endTime);
  }

  delete(id: number): Promise<void> {
    return this.loops.delete(id);
  }
}
