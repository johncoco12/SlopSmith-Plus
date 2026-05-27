import type { ILoopRepository } from "../domain/repositories.js";
import type { Loop } from "../domain/models/library.js";

export class LoopService {
  constructor(private readonly loops: ILoopRepository) {}

  async getLoops(trackId: number, profileId: number): Promise<Loop[]> {
    return this.loops.findByTrackId(trackId, profileId);
  }

  async createLoop(
    trackId: number,
    profileId: number,
    name: string | undefined,
    startTime: number,
    endTime: number,
  ): Promise<Loop> {
    let resolvedName = name;
    if (!resolvedName) {
      const existing = await this.loops.findByTrackId(trackId, profileId);
      resolvedName = `Loop ${existing.length + 1}`;
    }
    return this.loops.create(trackId, profileId, resolvedName, startTime, endTime);
  }

  async deleteLoop(id: number): Promise<void> {
    await this.loops.delete(id);
  }
}
