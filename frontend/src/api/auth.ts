import { get, post, setToken } from './index'
import type { SetupStatus, LoginResponse, SafeProfile, Session, Permission } from '@/types'

export function checkSetup(): Promise<SetupStatus> {
  return get('/api/setup') as Promise<SetupStatus>
}

export function initialSetup(data: {
  name: string
  pinCode: string
  recoveryPhrase: string
  recoveryPhraseHint?: string
  avatarId?: number
}): Promise<SafeProfile> {
  return post('/api/setup', data) as Promise<SafeProfile>
}

export async function login(name: string, pinCode: string): Promise<LoginResponse> {
  const res = (await post('/api/auth/login', { name, pinCode })) as LoginResponse
  setToken(res.token)
  return res
}

export function logout(): Promise<void> {
  setToken(null)
  return post('/api/auth/logout', {}) as Promise<void>
}

export function recoverProfile(name: string, recoveryPhrase: string, newPin: string): Promise<SafeProfile> {
  return post('/api/auth/recover', { name, recoveryPhrase, newPin }) as Promise<SafeProfile>
}

export function getSession(): Promise<{ session: Session; profile: SafeProfile }> {
  return get('/api/auth/session') as Promise<{ session: Session; profile: SafeProfile }>
}

export function getMyPermissions(): Promise<{ profileId: number; permissions: Permission[] }> {
  return get('/api/permissions/me') as Promise<{ profileId: number; permissions: Permission[] }>
}