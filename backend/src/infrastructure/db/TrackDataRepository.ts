import type { ITrackDataRepository } from "../../domain/repositories.js";
import type { TrackData } from "../../domain/models/track.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

function rowToTrackData(row: {
  id: number;
  trackId: number;
  originalFilename: string;
  arrangements: unknown;
  coverImageStorageId: string | null;
  audioFileStorageId: string | null;
}): TrackData {
  return {
    id: row.id,
    trackId: row.trackId,
    originalFilename: row.originalFilename,
    arrangements: row.arrangements as { index: number; name: string; notes: number }[],
    coverImageStorageId: row.coverImageStorageId,
    audioFileStorageId: row.audioFileStorageId,
  };
}

export class TrackDataRepository implements ITrackDataRepository {
  async findByTrackId(trackId: number): Promise<TrackData | null> {
    const row = await prisma.trackData.findUnique({ where: { trackId } });
    return row ? rowToTrackData(row) : null;
  }

  async findByOriginalFilename(originalFilename: string): Promise<TrackData | null> {
    const row = await prisma.trackData.findUnique({ where: { originalFilename } });
    return row ? rowToTrackData(row) : null;
  }

  async create(trackId: number, originalFilename: string, arrangements: unknown, coverImageStorageId?: string, audioFileStorageId?: string): Promise<TrackData> {
    const row = await prisma.trackData.create({
      data: {
        trackId,
        originalFilename,
        arrangements: arrangements as [],
        coverImageStorageId: coverImageStorageId ?? null,
        audioFileStorageId: audioFileStorageId ?? null,
      },
    });
    return rowToTrackData(row);
  }

  async update(id: number, data: Partial<Pick<TrackData, "arrangements" | "coverImageStorageId" | "audioFileStorageId">>): Promise<TrackData> {
    const updateData: Record<string, unknown> = {};
    if (data.arrangements !== undefined) updateData.arrangements = data.arrangements as [];
    if (data.coverImageStorageId !== undefined) updateData.coverImageStorageId = data.coverImageStorageId;
    if (data.audioFileStorageId !== undefined) updateData.audioFileStorageId = data.audioFileStorageId;

    const row = await prisma.trackData.update({ where: { id }, data: updateData });
    return rowToTrackData(row);
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.trackData.delete({ where: { id } });
    } catch {
      throw new NotFoundError("TrackData");
    }
  }
}