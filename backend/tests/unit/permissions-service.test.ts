import { describe, it, expect, vi, beforeEach } from "vitest";
import { PermissionsService } from "../../src/services/PermissionsService.js";
import type { IPermissionGroupRepository } from "../../src/domain/repositories.js";
import type { PermissionGroup, CreatePermissionGroupInput } from "../../src/domain/models/permission.js";
import { NotFoundError } from "../../src/domain/errors.js";

function makeGroup(overrides: Partial<PermissionGroup> = {}): PermissionGroup {
  return {
    id: 1,
    name: "admins",
    profileIds: [1, 2],
    permissions: ["admin"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IPermissionGroupRepository> = {}): IPermissionGroupRepository {
  return {
    findById: vi.fn(async () => null),
    findByName: vi.fn(async () => null),
    findAll: vi.fn(async () => []),
    create: vi.fn(async () => makeGroup()),
    update: vi.fn(async () => makeGroup()),
    delete: vi.fn(async () => {}),
    addProfile: vi.fn(async () => makeGroup()),
    removeProfile: vi.fn(async () => makeGroup()),
    ...overrides,
  } as IPermissionGroupRepository;
}

describe("PermissionsService.resolvePermissions", () => {
  it("returns empty array when profile has no groups", async () => {
    const repo = makeRepo({ findAll: vi.fn(async () => []) });
    const service = new PermissionsService(repo);
    const result = await service.resolvePermissions(1);
    expect(result).toEqual([]);
  });

  it("collects permissions from all matching groups", async () => {
    const groups = [
      makeGroup({ id: 1, name: "editors", profileIds: [1], permissions: ["read", "write"] }),
      makeGroup({ id: 2, name: "admins", profileIds: [1, 2], permissions: ["admin"] }),
      makeGroup({ id: 3, name: "viewers", profileIds: [3], permissions: ["read"] }),
    ];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    const result = await service.resolvePermissions(1);
    expect(result.sort()).toEqual(["read", "write", "admin"].sort());
  });

  it("deduplicates permissions", async () => {
    const groups = [
      makeGroup({ id: 1, profileIds: [1], permissions: ["read"] }),
      makeGroup({ id: 2, profileIds: [1], permissions: ["read", "write"] }),
    ];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    const result = await service.resolvePermissions(1);
    expect(result.sort()).toEqual(["read", "write"]);
  });

  it("caches results and avoids repeated DB calls", async () => {
    const findAll = vi.fn(async () => [
      makeGroup({ profileIds: [1], permissions: ["read"] }),
    ]);
    const repo = makeRepo({ findAll });
    const service = new PermissionsService(repo);
    const first = await service.resolvePermissions(1);
    const second = await service.resolvePermissions(1);
    expect(first).toEqual(second);
    expect(findAll).toHaveBeenCalledTimes(1);
  });
});

describe("PermissionsService.hasPermission", () => {
  it("returns true when profile has the exact permission", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["read"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasPermission(1, "read")).toBe(true);
  });

  it("returns true when profile has admin permission (bypass)", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["admin"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasPermission(1, "write")).toBe(true);
  });

  it("returns false when profile lacks the permission", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["read"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasPermission(1, "delete")).toBe(false);
  });
});

describe("PermissionsService.hasAnyPermission", () => {
  it("returns true when profile has any of the specified permissions", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["read"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasAnyPermission(1, "write", "read")).toBe(true);
  });

  it("returns true when profile has admin permission", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["admin"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasAnyPermission(1, "write", "delete")).toBe(true);
  });

  it("returns false when profile has none of the specified permissions", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["read"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasAnyPermission(1, "write", "delete")).toBe(false);
  });
});

describe("PermissionsService.hasAllPermissions", () => {
  it("returns true when profile has all specified permissions", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["read", "write"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasAllPermissions(1, "read", "write")).toBe(true);
  });

  it("returns true when profile has admin permission", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["admin"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasAllPermissions(1, "read", "write")).toBe(true);
  });

  it("returns false when profile is missing any permission", async () => {
    const groups = [makeGroup({ profileIds: [1], permissions: ["read"] })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    expect(await service.hasAllPermissions(1, "read", "write")).toBe(false);
  });
});

describe("PermissionsService.invalidateCache", () => {
  it("invalidates cache for a specific profile", async () => {
    const findAll = vi.fn(async () => [makeGroup({ profileIds: [1], permissions: ["read"] })]);
    const repo = makeRepo({ findAll });
    const service = new PermissionsService(repo);
    await service.resolvePermissions(1);
    expect(findAll).toHaveBeenCalledTimes(1);
    service.invalidateCache(1);
    await service.resolvePermissions(1);
    expect(findAll).toHaveBeenCalledTimes(2);
  });

  it("invalidates cache for all profiles when no profileId given", async () => {
    const findAll = vi.fn(async () => [makeGroup({ profileIds: [1], permissions: ["read"] })]);
    const repo = makeRepo({ findAll });
    const service = new PermissionsService(repo);
    await service.resolvePermissions(1);
    expect(findAll).toHaveBeenCalledTimes(1);
    service.invalidateCache();
    await service.resolvePermissions(1);
    expect(findAll).toHaveBeenCalledTimes(2);
  });
});

describe("PermissionsService.listGroups", () => {
  it("delegates to repository findAll", async () => {
    const groups = [makeGroup({ id: 1 }), makeGroup({ id: 2, name: "editors" })];
    const repo = makeRepo({ findAll: vi.fn(async () => groups) });
    const service = new PermissionsService(repo);
    const result = await service.listGroups();
    expect(result).toEqual(groups);
  });
});

describe("PermissionsService.getGroup", () => {
  it("returns group when found", async () => {
    const group = makeGroup({ id: 5 });
    const repo = makeRepo({ findById: vi.fn(async () => group) });
    const service = new PermissionsService(repo);
    const result = await service.getGroup(5);
    expect(result).toEqual(group);
  });

  it("throws NotFoundError when group not found", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    const service = new PermissionsService(repo);
    await expect(service.getGroup(999)).rejects.toThrow(NotFoundError);
  });
});

describe("PermissionsService.createGroup", () => {
  it("creates a new group and clears cache", async () => {
    const input: CreatePermissionGroupInput = { name: "editors", permissions: ["read", "write"] };
    const created = makeGroup({ id: 10, name: "editors", permissions: ["read", "write"] });
    const repo = makeRepo({
      findByName: vi.fn(async () => null),
      create: vi.fn(async () => created),
      findAll: vi.fn(async () => []),
    });
    const service = new PermissionsService(repo);
    const result = await service.createGroup(input);
    expect(result.name).toBe("editors");
    expect(repo.findByName).toHaveBeenCalledWith("editors");
    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it("throws NotFoundError when group name already exists", async () => {
    const existing = makeGroup({ name: "admins" });
    const repo = makeRepo({ findByName: vi.fn(async () => existing) });
    const service = new PermissionsService(repo);
    const input: CreatePermissionGroupInput = { name: "admins" };
    await expect(service.createGroup(input)).rejects.toThrow(NotFoundError);
  });
});

describe("PermissionsService.updateGroup", () => {
  it("updates group and clears cache", async () => {
    const updated = makeGroup({ id: 1, name: "superadmins" });
    const repo = makeRepo({ update: vi.fn(async () => updated) });
    const service = new PermissionsService(repo);
    const result = await service.updateGroup(1, { name: "superadmins" });
    expect(result.name).toBe("superadmins");
    expect(repo.update).toHaveBeenCalledWith(1, { name: "superadmins" });
  });
});

describe("PermissionsService.deleteGroup", () => {
  it("delegates to repository and clears cache", async () => {
    const repo = makeRepo();
    const service = new PermissionsService(repo);
    await service.deleteGroup(1);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });
});

describe("PermissionsService.addProfileToGroup", () => {
  it("delegates to repository and clears cache", async () => {
    const updated = makeGroup({ id: 1, profileIds: [1, 2, 3] });
    const repo = makeRepo({ addProfile: vi.fn(async () => updated) });
    const service = new PermissionsService(repo);
    const result = await service.addProfileToGroup(1, 3);
    expect(result).toEqual(updated);
    expect(repo.addProfile).toHaveBeenCalledWith(1, 3);
  });
});

describe("PermissionsService.removeProfileFromGroup", () => {
  it("delegates to repository and clears cache", async () => {
    const updated = makeGroup({ id: 1, profileIds: [1] });
    const repo = makeRepo({ removeProfile: vi.fn(async () => updated) });
    const service = new PermissionsService(repo);
    const result = await service.removeProfileFromGroup(1, 2);
    expect(result).toEqual(updated);
    expect(repo.removeProfile).toHaveBeenCalledWith(1, 2);
  });
});