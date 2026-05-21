import type { ILoopRepository } from "../../domain/repositories.js";
import type { Loop } from "../../domain/models/library.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

export class LoopRepository implements ILoopRepository {
  async findByFilename(filename: string): Promise<Loop[]> {
    const rows = await prisma.loop.findMany({
      where: { filename },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({ ...r }));
  }

  async create(
    filename: string,
    name: string,
    startTime: number,
    endTime: number
  ): Promise<Loop> {
    return prisma.loop.create({ data: { filename, name, startTime, endTime } });
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.loop.delete({ where: { id } });
    } catch {
      throw new NotFoundError(`Loop ${id}`);
    }
  }
}
