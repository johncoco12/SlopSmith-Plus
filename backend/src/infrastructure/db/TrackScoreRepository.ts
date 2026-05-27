import { prisma } from "./client.js";

export interface TrackScore {
  id: number;
  profileId: number;
  trackId: string;
  bestScore: number;
  playCount: number;
  lastPlayedAt: Date;
}

export interface ITrackScoreRepository {
  upsertBetter(profileId: number, trackId: string, score: number): Promise<TrackScore>;
  findMany(profileId: number, trackIds: string[]): Promise<TrackScore[]>;
}

export class TrackScoreRepository implements ITrackScoreRepository {
  async upsertBetter(profileId: number, trackId: string, score: number): Promise<TrackScore> {
    const existing = await prisma.trackScore.findUnique({
      where: { profileId_trackId: { profileId, trackId } },
    });

    if (!existing) {
      return prisma.trackScore.create({
        data: { profileId, trackId, bestScore: score, playCount: 1, lastPlayedAt: new Date() },
      });
    }

    return prisma.trackScore.update({
      where: { profileId_trackId: { profileId, trackId } },
      data: {
        bestScore: Math.max(existing.bestScore, score),
        playCount: { increment: 1 },
        lastPlayedAt: new Date(),
      },
    });
  }

  async findMany(profileId: number, trackIds: string[]): Promise<TrackScore[]> {
    if (trackIds.length === 0) return [];
    return prisma.trackScore.findMany({
      where: { profileId, trackId: { in: trackIds } },
    });
  }
}
