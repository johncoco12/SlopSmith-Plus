import type { ITrackScoreRepository, TrackScore } from "../infrastructure/db/TrackScoreRepository.js";

export class TrackScoreService {
  constructor(private readonly repo: ITrackScoreRepository) {}

  submit(profileId: number, trackId: string, score: number): Promise<TrackScore> {
    return this.repo.upsertBetter(profileId, trackId, score);
  }

  getBatch(profileId: number, trackIds: string[]): Promise<TrackScore[]> {
    return this.repo.findMany(profileId, trackIds);
  }
}
