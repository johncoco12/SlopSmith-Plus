export interface PermissionGroup {
  readonly id: number;
  readonly name: string;
  readonly profileIds: readonly number[];
  readonly permissions: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePermissionGroupInput {
  readonly name: string;
  readonly profileIds?: readonly number[];
  readonly permissions?: readonly string[];
}

export interface UpdatePermissionGroupInput {
  readonly name?: string;
  readonly profileIds?: readonly number[];
  readonly permissions?: readonly string[];
}

export enum Permissions {
  ADMIN = "admin",
  UPLOAD = "upload",
  EDIT_TRACKS = "edit_tracks",
  DELETE_TRACKS = "delete_tracks",
  MANAGE_PROFILES = "manage_profiles",
  MANAGE_PERMISSIONS = "manage_permissions",
  MANAGE_SETTINGS = "manage_settings",
}

export const ALL_PERMISSIONS = Object.values(Permissions);

export const DEFAULT_ADMIN_PERMISSIONS: Permissions[] = [
  Permissions.ADMIN,
  Permissions.UPLOAD,
  Permissions.EDIT_TRACKS,
  Permissions.DELETE_TRACKS,
  Permissions.MANAGE_PROFILES,
  Permissions.MANAGE_PERMISSIONS,
  Permissions.MANAGE_SETTINGS,
];