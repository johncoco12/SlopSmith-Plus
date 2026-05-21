import type { ILoopRepository } from "../domain/repositories.js";
import type { Loop } from "../domain/models/library.js";

export class LoopService {
  constructor(private readonly loops: ILoopRepository) {}

  getForSong(filename: string): Promise<Loop[]> {
    return this.loops.findByFilename(filename);
  }

  async create(filename: string, name: string | undefined, startTime: number, endTime: number): Promise<Loop> {
    const existing = await this.loops.findByFilename(filename);
    const resolvedName = name ?? `Loop ${existing.length + 1}`;
    return this.loops.create(filename, resolvedName, startTime, endTime);
  }

  delete(id: number): Promise<void> {
    return this.loops.delete(id);
  }
}
