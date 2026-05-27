import { post } from '@/api/index'

export function submitScore(trackId: string, score: number): Promise<unknown> {
  return post(`/api/tracks/${encodeURIComponent(trackId)}/score`, { score })
}

export interface TrackScoreEntry {
  trackId: string
  bestScore: number
  playCount: number
  lastPlayedAt: string
}

export async function fetchScoresBatch(trackIds: string[]): Promise<Map<string, number>> {
  if (!trackIds.length) return new Map()
  const data = await post('/api/scores/batch', { trackIds }) as { scores: TrackScoreEntry[] }
  const map = new Map<string, number>()
  for (const s of data.scores ?? []) {
    map.set(s.trackId, s.bestScore)
  }
  return map
}
