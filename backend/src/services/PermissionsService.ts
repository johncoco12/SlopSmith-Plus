import type { IPermissionGroupRepository } from "../domain/repositories.js";
import type { PermissionGroup, CreatePermissionGroupInput, UpdatePermissionGroupInput } from "../domain/models/permission.js";
import { NotFoundError } from "../domain/errors.js";

export class PermissionsService {
  private cache = new Map<number, { permissions: string[]; expiresAt: number }>();
  private readonly TTL_MS = 60_000;

  constructor(private readonly groups: IPermissionGroupRepository) {}

  async resolvePermissions(profileId: number): Promise<string[]> {
    const cached = this.cache.get(profileId);
    if (cached && Date.now() < cached.expiresAt) return cached.permissions;

    const allGroups = await this.groups.findAll();
    const permissions = new Set<string>();
    for (const group of allGroups) {
      if (group.profileIds.includes(profileId)) {
        for (const perm of group.permissions) {
          permissions.add(perm);
        }
      }
    }

    const result = [...permissions];
    this.cache.set(profileId, { permissions: result, expiresAt: Date.now() + this.TTL_MS });
    return result;
  }

  async hasPermission(profileId: number, permission: string): Promise<boolean> {
    const perms = await this.resolvePermissions(profileId);
    return perms.includes("admin") || perms.includes(permission);
  }

  async hasAnyPermission(profileId: number, ...permissions: string[]): Promise<boolean> {
    const perms = await this.resolvePermissions(profileId);
    if (perms.includes("admin")) return true;
    return permissions.some((p) => perms.includes(p));
  }

  async hasAllPermissions(profileId: number, ...permissions: string[]): Promise<boolean> {
    const perms = await this.resolvePermissions(profileId);
    if (perms.includes("admin")) return true;
    return permissions.every((p) => perms.includes(p));
  }

  invalidateCache(profileId?: number): void {
    if (profileId !== undefined) {
      this.cache.delete(profileId);
    } else {
      this.cache.clear();
    }
  }

  async listGroups(): Promise<PermissionGroup[]> {
    return this.groups.findAll();
  }

  async getGroup(id: number): Promise<PermissionGroup> {
    const group = await this.groups.findById(id);
    if (!group) throw new NotFoundError("PermissionGroup");
    return group;
  }

  async createGroup(input: CreatePermissionGroupInput): Promise<PermissionGroup> {
    const existing = await this.groups.findByName(input.name);
    if (existing) throw new NotFoundError("PermissionGroup name already exists");
    const group = await this.groups.create(input);
    this.cache.clear();
    return group;
  }

  async updateGroup(id: number, input: UpdatePermissionGroupInput): Promise<PermissionGroup> {
    const group = await this.groups.update(id, input);
    this.cache.clear();
    return group;
  }

  async deleteGroup(id: number): Promise<void> {
    await this.groups.delete(id);
    this.cache.clear();
  }

  async addProfileToGroup(groupId: number, profileId: number): Promise<PermissionGroup> {
    const group = await this.groups.addProfile(groupId, profileId);
    this.cache.clear();
    return group;
  }

  async removeProfileFromGroup(groupId: number, profileId: number): Promise<PermissionGroup> {
    const group = await this.groups.removeProfile(groupId, profileId);
    this.cache.clear();
    return group;
  }
}