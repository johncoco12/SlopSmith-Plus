import { get, post, patch, del } from './index'
import type { SafeProfile } from '@/types'

export function listProfiles(): Promise<SafeProfile[]> {
  return get('/api/profiles') as Promise<SafeProfile[]>
}

export function getProfile(id: number): Promise<SafeProfile> {
  return get(`/api/profiles/${id}`) as Promise<SafeProfile>
}

export function createProfile(data: {
  name: string
  pinCode: string
  recoveryPhrase: string
  recoveryPhraseHint?: string
  avatarId?: number
}): Promise<SafeProfile> {
  return post('/api/profiles', data) as Promise<SafeProfile>
}

export function updateProfile(id: number, data: {
  name?: string
  avatarId?: number | null
  pinCode?: string
  locked?: boolean
  profileSettings?: Record<string, unknown>
}): Promise<SafeProfile> {
  return patch(`/api/profiles/${id}`, data) as Promise<SafeProfile>
}

export function deleteProfile(id: number): Promise<void> {
  return del(`/api/profiles/${id}`) as Promise<void>
}