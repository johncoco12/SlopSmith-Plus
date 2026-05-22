import type { IStemDataRepository } from "../../domain/repositories.js";
import type { StemData } from "../../domain/models/track.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

function rowToStemData(row: {
  id: number;
  stemsId: number;
  stemIndex: number;
  arrangement: string | null;
  stemAudioFileStorageId: string | null;
}): StemData {
  return {
    id: row.id,
    trackId: row.stemsId,
    stemIndex: row.stemIndex,
    arrangement: row.arrangement,
    stemAudioFileStorageId: row.stemAudioFileStorageId,
  };
}

export class StemDataRepository implements IStemDataRepository {
  async findByStemsId(stemsId: number): Promise<StemData[]> {
    const rows = await prisma.stemData.findMany({ where: { stemsId } });
    return rows.map(rowToStemData);
  }

  async create(stemsId: number, stemIndex: number, arrangement?: string, stemAudioFileStorageId?: string): Promise<StemData> {
    const row = await prisma.stemData.create({
      data: {
        stemsId,
        stemIndex,
        arrangement: arrangement ?? null,
        stemAudioFileStorageId: stemAudioFileStorageId ?? null,
      },
    });
    return rowToStemData(row);
  }

  async update(id: number, data: Partial<Pick<StemData, "stemIndex" | "arrangement" | "stemAudioFileStorageId">>): Promise<StemData> {
    const updateData: Record<string, unknown> = {};
    if (data.stemIndex !== undefined) updateData.stemIndex = data.stemIndex;
    if (data.arrangement !== undefined) updateData.arrangement = data.arrangement;
    if (data.stemAudioFileStorageId !== undefined) updateData.stemAudioFileStorageId = data.stemAudioFileStorageId;

    const row = await prisma.stemData.update({ where: { id }, data: updateData });
    return rowToStemData(row);
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.stemData.delete({ where: { id } });
    } catch {
      throw new NotFoundError("StemData");
    }
  }
}