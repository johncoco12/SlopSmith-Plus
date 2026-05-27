import type { ILoopRepository } from "../../domain/repositories.js";
import type { Loop } from "../../domain/models/library.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

export class LoopRepository implements ILoopRepository {
  async findByTrackId(trackId: number, profileId: number): Promise<Loop[]> {
    const rows = await prisma.trackLoop.findMany({
      where: { trackId, profileId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profileId,
      trackId: r.trackId,
      name: r.name,
      startTime: r.startTime,
      endTime: r.endTime,
      createdAt: r.createdAt,
    }));
  }

  async create(
    trackId: number,
    profileId: number,
    name: string,
    startTime: number,
    endTime: number
  ): Promise<Loop> {
    const row = await prisma.trackLoop.create({
      data: { trackId, profileId, name, startTime, endTime },
    });
    return {
      id: row.id,
      profileId: row.profileId,
      trackId: row.trackId,
      name: row.name,
      startTime: row.startTime,
      endTime: row.endTime,
      createdAt: row.createdAt,
    };
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.trackLoop.delete({ where: { id } });
    } catch {
      throw new NotFoundError(`Loop ${id}`);
    }
  }

  async deleteAllByTrackId(trackId: number): Promise<void> {
    await prisma.trackLoop.deleteMany({ where: { trackId } });
  }
}
