import type { IFavoritesRepository } from "../../domain/repositories.js";
import { prisma } from "./client.js";

export class FavoritesRepository implements IFavoritesRepository {
  async isFavorite(trackId: string, profileId: number): Promise<boolean> {
    return !!(
      await prisma.favorite.findUnique({
        where: { trackId },
      })
    );
  }

  async toggle(trackId: string, profileId: number): Promise<boolean> {
    const existing = await prisma.favorite.findUnique({
      where: { trackId },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { trackId } });
      return false;
    }
    await prisma.favorite.create({ data: { trackId, profileId } });
    return true;
  }

  async getAllFilenames(): Promise<Set<string>> {
    const rows = await prisma.favorite.findMany({ select: { trackId: true } });
    return new Set(rows.map((r) => r.trackId));
  }

  async getFavoritesByProfile(profileId: number): Promise<Set<string>> {
    const rows = await prisma.favorite.findMany({
      where: { profileId },
      select: { trackId: true },
    });
    return new Set(rows.map((r) => r.trackId));
  }
}
