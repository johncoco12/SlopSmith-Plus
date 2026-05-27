import { get, post, patch as patchReq, del } from '@/api/index'
import type { PermissionGroup, Permission } from '@/types'

export interface AvailablePermission {
  name: string
  description: string
  pluginId?: string
}

export function listAvailablePermissions(): Promise<AvailablePermission[]> {
  return get('/api/permissions/available') as Promise<AvailablePermission[]>
}

export function listGroups(): Promise<PermissionGroup[]> {
  return get('/api/permissions/groups') as Promise<PermissionGroup[]>
}

export function getGroup(id: number): Promise<PermissionGroup> {
  return get(`/api/permissions/groups/${id}`) as Promise<PermissionGroup>
}

export function createGroup(data: {
  name: string
  profileIds?: number[]
  permissions?: Permission[]
}): Promise<PermissionGroup> {
  return post('/api/permissions/groups', data) as Promise<PermissionGroup>
}

export function updateGroup(id: number, data: {
  name?: string
  profileIds?: number[]
  permissions?: Permission[]
}): Promise<PermissionGroup> {
  return patchReq(`/api/permissions/groups/${id}`, data) as Promise<PermissionGroup>
}

export function deleteGroup(id: number): Promise<void> {
  return del(`/api/permissions/groups/${id}`) as Promise<void>
}

export function addProfileToGroup(groupId: number, profileId: number): Promise<PermissionGroup> {
  return post(`/api/permissions/groups/${groupId}/profiles`, { profileId }) as Promise<PermissionGroup>
}

export function removeProfileFromGroup(groupId: number, profileId: number): Promise<PermissionGroup> {
  return del(`/api/permissions/groups/${groupId}/profiles/${profileId}`) as Promise<PermissionGroup>
}