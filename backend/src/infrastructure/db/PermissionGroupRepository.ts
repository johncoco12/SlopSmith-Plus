import type { IPermissionGroupRepository } from "../../domain/repositories.js";
import type { PermissionGroup, CreatePermissionGroupInput, UpdatePermissionGroupInput } from "../../domain/models/permission.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

function rowToGroup(row: {
  id: number;
  name: string;
  profileIds: unknown;
  permissions: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PermissionGroup {
  return {
    id: row.id,
    name: row.name,
    profileIds: (row.profileIds as number[]) ?? [],
    permissions: (row.permissions as string[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PermissionGroupRepository implements IPermissionGroupRepository {
  async findById(id: number): Promise<PermissionGroup | null> {
    const row = await prisma.permissionGroup.findUnique({ where: { id } });
    return row ? rowToGroup(row) : null;
  }

  async findByName(name: string): Promise<PermissionGroup | null> {
    const row = await prisma.permissionGroup.findUnique({ where: { name } });
    return row ? rowToGroup(row) : null;
  }

  async findAll(): Promise<PermissionGroup[]> {
    const rows = await prisma.permissionGroup.findMany({ orderBy: { id: "asc" } });
    return rows.map(rowToGroup);
  }

  async create(input: CreatePermissionGroupInput): Promise<PermissionGroup> {
    const row = await prisma.permissionGroup.create({
      data: {
        name: input.name,
        profileIds: [...(input.profileIds ?? [])],
        permissions: [...(input.permissions ?? [])],
      },
    });
    return rowToGroup(row);
  }

  async update(id: number, input: UpdatePermissionGroupInput): Promise<PermissionGroup> {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.profileIds !== undefined) data.profileIds = [...input.profileIds];
    if (input.permissions !== undefined) data.permissions = [...input.permissions];

    const row = await prisma.permissionGroup.update({ where: { id }, data });
    return rowToGroup(row);
  }

  async delete(id: number): Promise<void> {
    await prisma.permissionGroup.delete({ where: { id } }).catch(() => {
      throw new NotFoundError("PermissionGroup");
    });
  }

  async addProfile(groupId: number, profileId: number): Promise<PermissionGroup> {
    const group = await this.findById(groupId);
    if (!group) throw new NotFoundError("PermissionGroup");
    const ids = [...group.profileIds, profileId];
    return this.update(groupId, { profileIds: ids });
  }

  async removeProfile(groupId: number, profileId: number): Promise<PermissionGroup> {
    const group = await this.findById(groupId);
    if (!group) throw new NotFoundError("PermissionGroup");
    const ids = group.profileIds.filter((id) => id !== profileId);
    return this.update(groupId, { profileIds: ids });
  }
}