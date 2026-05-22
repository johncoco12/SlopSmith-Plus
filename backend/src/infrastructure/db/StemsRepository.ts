import type { IStemsRepository } from "../../domain/repositories.js";
import type { TrackStems as TrackStemsModel } from "../../domain/models/track.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

function rowToStems(row: {
  id: number;
  trackId: number;
}): TrackStemsModel {
  return {
    id: row.id,
    trackId: row.trackId,
    stems: [],
  };
}

export class StemsRepository implements IStemsRepository {
  async findByTrackId(trackId: number): Promise<TrackStemsModel | null> {
    const row = await prisma.stems.findUnique({ where: { trackId } });
    return row ? rowToStems(row) : null;
  }

  async create(trackId: number): Promise<TrackStemsModel> {
    const row = await prisma.stems.create({
      data: { trackId },
    });
    return rowToStems(row);
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.stems.delete({ where: { id } });
    } catch {
      throw new NotFoundError("Stems");
    }
  }
}