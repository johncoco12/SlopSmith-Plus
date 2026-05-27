import { prisma } from "./client.js";

export interface TrackScore {
  id: number;
  profileId: number;
  trackId: string;
  bestScore: number;
  playCount: number;
  lastPlayedAt: Date;
}

export interface TrackScoreWithName extends TrackScore {
  playerName: string;
  title: string;
  artist: string;
}

export interface ITrackScoreRepository {
  upsertBetter(profileId: number, trackId: string, score: number): Promise<TrackScore>;
  findMany(profileId: number, trackIds: string[]): Promise<TrackScore[]>;
  findAll(): Promise<TrackScoreWithName[]>;
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

  async findAll(): Promise<TrackScoreWithName[]> {
    const rows = await prisma.trackScore.findMany();
    if (rows.length === 0) return [];

    const profileIds = [...new Set(rows.map(r => r.profileId))];
    const trackIds   = [...new Set(rows.map(r => r.trackId))];

    const [profiles, tracks] = await Promise.all([
      prisma.profile.findMany({
        where: { id: { in: profileIds } },
        select: { id: true, name: true },
      }),
      prisma.track.findMany({
        where: { trackId: { in: trackIds } },
        select: { trackId: true, title: true, artist: true },
      }),
    ]);

    const nameMap   = new Map(profiles.map(p => [p.id, p.name]));
    const trackMap  = new Map(tracks.map(t => [t.trackId, t]));

    return rows.map(r => {
      const t = trackMap.get(r.trackId);
      return {
        ...r,
        playerName: nameMap.get(r.profileId) ?? 'Unknown',
        title:      t?.title  ?? r.trackId,
        artist:     t?.artist ?? '',
      };
    });
  }
}
