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