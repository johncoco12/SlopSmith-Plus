import type { IFavoritesRepository } from "../../domain/repositories.js";
import { prisma } from "./client.js";

export class FavoritesRepository implements IFavoritesRepository {
  async isFavorite(filename: string): Promise<boolean> {
    return !!(await prisma.favorite.findUnique({ where: { filename } }));
  }

  async toggle(filename: string): Promise<boolean> {
    const existing = await prisma.favorite.findUnique({ where: { filename } });
    if (existing) {
      await prisma.favorite.delete({ where: { filename } });
      return false;
    }
    await prisma.favorite.create({ data: { filename } });
    return true;
  }

  async getAllFilenames(): Promise<Set<string>> {
    const rows = await prisma.favorite.findMany({ select: { filename: true } });
    return new Set(rows.map((r) => r.filename));
  }
}
