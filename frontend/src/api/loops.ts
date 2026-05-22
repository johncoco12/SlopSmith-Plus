import { get, post, del } from './index'

export function fetchLoops(trackId: string, profileId: number): Promise<unknown> {
  return get(`/api/tracks/${encodeURIComponent(trackId)}/loops?profileId=${profileId}`)
}

export function saveLoop(trackId: string, profileId: number, data: {
  name?: string
  start_time: number
  end_time: number
}): Promise<unknown> {
  return post(`/api/tracks/${encodeURIComponent(trackId)}/loops`, {
    ...data,
    profileId,
  })
}

export function deleteLoop(id: number): Promise<unknown> {
  return del(`/api/loops/${id}`)
}