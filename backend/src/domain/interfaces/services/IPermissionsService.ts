import type { PermissionGroup, CreatePermissionGroupInput, UpdatePermissionGroupInput } from "../../models/permission.js";

export interface IPermissionsService {
  resolvePermissions(profileId: number): Promise<string[]>;
  hasPermission(profileId: number, permission: string): Promise<boolean>;
  hasAnyPermission(profileId: number, ...permissions: string[]): Promise<boolean>;
  hasAllPermissions(profileId: number, ...permissions: string[]): Promise<boolean>;
  invalidateCache(profileId?: number): void;
  listGroups(): Promise<PermissionGroup[]>;
  getGroup(id: number): Promise<PermissionGroup>;
  createGroup(input: CreatePermissionGroupInput): Promise<PermissionGroup>;
  updateGroup(id: number, input: UpdatePermissionGroupInput): Promise<PermissionGroup>;
  deleteGroup(id: number): Promise<void>;
  addProfileToGroup(groupId: number, profileId: number): Promise<PermissionGroup>;
  removeProfileFromGroup(groupId: number, profileId: number): Promise<PermissionGroup>;
}