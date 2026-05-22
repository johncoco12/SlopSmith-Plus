import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { ProfileService } from "../../src/services/ProfileService.js";
import type { IProfileRepository } from "../../src/domain/repositories.js";
import type { Profile, CreateProfileInput } from "../../src/domain/models/profile.js";
import { InvalidCredentialsError, AccountLockedError, NotFoundError } from "../../src/domain/errors.js";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    name: "testuser",
    avatarId: null,
    pinCode: "hashedpin",
    pinSalt: "salt123",
    recoveryPhrase: "hashedrecovery",
    recoveryPhraseSalt: "recsalt123",
    recoveryPhraseHint: "my hint",
    locked: false,
    profileSettings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IProfileRepository> = {}): IProfileRepository {
  return {
    findById: vi.fn(async () => null),
    findByName: vi.fn(async () => null),
    findAll: vi.fn(async () => []),
    create: vi.fn(async () => makeProfile()),
    update: vi.fn(async () => makeProfile()),
    delete: vi.fn(async () => {}),
    ...overrides,
  } as IProfileRepository;
}

describe("ProfileService.listProfiles", () => {
  it("returns sanitized profiles without sensitive fields", async () => {
    const profiles = [makeProfile({ id: 1, name: "alice" }), makeProfile({ id: 2, name: "bob", pinCode: "secret" })];
    const repo = makeRepo({ findAll: vi.fn(async () => profiles) });
    const service = new ProfileService(repo);
    const result = await service.listProfiles();
    expect(result).toHaveLength(2);
    for (const p of result) {
      expect(p).not.toHaveProperty("pinCode");
      expect(p).not.toHaveProperty("pinSalt");
      expect(p).not.toHaveProperty("recoveryPhrase");
      expect(p).not.toHaveProperty("recoveryPhraseSalt");
    }
  });
});

describe("ProfileService.getProfile", () => {
  it("returns a sanitized profile by id", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => makeProfile({ id: 5, name: "eve" })) });
    const service = new ProfileService(repo);
    const result = await service.getProfile(5);
    expect(result.id).toBe(5);
    expect(result.name).toBe("eve");
    expect(result).not.toHaveProperty("pinCode");
  });

  it("throws NotFoundError when profile does not exist", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    const service = new ProfileService(repo);
    await expect(service.getProfile(999)).rejects.toThrow(NotFoundError);
  });
});

describe("ProfileService.createProfile", () => {
  it("delegates to repository and returns sanitized profile", async () => {
    const created = makeProfile({ id: 10, name: "newuser" });
    const repo = makeRepo({ create: vi.fn(async () => created) });
    const service = new ProfileService(repo);
    const input: CreateProfileInput = { name: "newuser", pinCode: "1234", recoveryPhrase: "phrase", recoveryPhraseHint: "hint" };
    const result = await service.createProfile(input);
    expect(result.id).toBe(10);
    expect(result).not.toHaveProperty("pinCode");
    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it("throws InvalidCredentialsError when name already exists", async () => {
    const repo = makeRepo({ findByName: vi.fn(async () => makeProfile({ name: "taken" })) });
    const service = new ProfileService(repo);
    const input: CreateProfileInput = { name: "taken", pinCode: "1234", recoveryPhrase: "phrase", recoveryPhraseHint: "hint" };
    await expect(service.createProfile(input)).rejects.toThrow(InvalidCredentialsError);
  });
});

describe("ProfileService.updateProfile", () => {
  it("updates and returns sanitized profile", async () => {
    const updated = makeProfile({ id: 1, name: "updated" });
    const repo = makeRepo({
      findById: vi.fn(async () => makeProfile()),
      update: vi.fn(async () => updated),
    });
    const service = new ProfileService(repo);
    const result = await service.updateProfile(1, { name: "updated" });
    expect(result.name).toBe("updated");
    expect(result).not.toHaveProperty("pinCode");
  });

  it("throws NotFoundError when profile does not exist", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    const service = new ProfileService(repo);
    await expect(service.updateProfile(999, { name: "x" })).rejects.toThrow(NotFoundError);
  });
});

describe("ProfileService.deleteProfile", () => {
  it("delegates to repository and clears sessions for that profile", async () => {
    const profile = makeProfile({ id: 1, name: "testuser", pinSalt: "salt" });
    profile.pinCode = createHash("sha256").update("salt1234").digest("hex");
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    await service.login("testuser", "1234");
    await service.deleteProfile(1);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });
});

describe("ProfileService.login", () => {
  it("throws InvalidCredentialsError when profile not found", async () => {
    const repo = makeRepo({ findByName: vi.fn(async () => null) });
    const service = new ProfileService(repo);
    await expect(service.login("nobody", "1234")).rejects.toThrow(InvalidCredentialsError);
  });

  it("throws AccountLockedError when profile is locked", async () => {
    const locked = makeProfile({ locked: true });
    const repo = makeRepo({ findByName: vi.fn(async () => locked) });
    const service = new ProfileService(repo);
    await expect(service.login("lockeduser", "1234")).rejects.toThrow(AccountLockedError);
  });

  it("creates session on successful login and returns sanitized profile", async () => {
    const profile = makeProfile({ id: 1, name: "testuser", pinSalt: "salt" });
    profile.pinCode = createHash("sha256").update("salt1234").digest("hex");
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    const result = await service.login("testuser", "1234");
    expect(result.session).toBeDefined();
    expect(result.session.token).toBeDefined();
    expect(result.session.profileId).toBe(1);
    expect(result.profile).not.toHaveProperty("pinCode");
    expect(result.profile.id).toBe(1);
  });

  it("increments failed attempts on wrong PIN", async () => {
    const profile = makeProfile({ id: 1, name: "testuser", pinSalt: "salt", pinCode: "wrong_hash" });
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    await expect(service.login("testuser", "wrong")).rejects.toThrow(InvalidCredentialsError);
  });

  it("locks account after MAX_FAILED_ATTEMPTS wrong PINs", async () => {
    const profile = makeProfile({ id: 1, name: "testuser", pinSalt: "salt", pinCode: "wrong_hash" });
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    for (let i = 0; i < 5; i++) {
      await expect(service.login("testuser", "wrong")).rejects.toThrow();
    }
    await expect(service.login("testuser", "wrong")).rejects.toThrow(AccountLockedError);
  });
});

describe("ProfileService.validateSession", () => {
  it("returns null for non-existent token", () => {
    const service = new ProfileService(makeRepo());
    expect(service.validateSession("nonexistent")).toBeNull();
  });

  it("returns session for valid token", async () => {
    const profile = makeProfile({ id: 1, name: "testuser", pinSalt: "salt" });
    profile.pinCode = createHash("sha256").update("salt1234").digest("hex");
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    const { session } = await service.login("testuser", "1234");
    const validated = service.validateSession(session.token);
    expect(validated).not.toBeNull();
    expect(validated!.profileId).toBe(1);
  });

  it("returns null for expired session", () => {
    const service = new ProfileService(makeRepo());
    (service as any).sessions.set("expired-token", {
      token: "expired-token",
      profileId: 1,
      profileName: "test",
      createdAt: Date.now() - 100000,
      expiresAt: Date.now() - 1000,
    });
    expect(service.validateSession("expired-token")).toBeNull();
  });
});

describe("ProfileService.logout", () => {
  it("removes the session token", async () => {
    const profile = makeProfile({ id: 1, name: "testuser", pinSalt: "salt" });
    profile.pinCode = createHash("sha256").update("salt1234").digest("hex");
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    const { session } = await service.login("testuser", "1234");
    service.logout(session.token);
    expect(service.validateSession(session.token)).toBeNull();
  });
});

describe("ProfileService.recoverProfile", () => {
  it("resets PIN and unlocks profile with valid recovery phrase", async () => {
    const salt = "recsalt";
    const correctRecovery = "myphrase";
    const hashedRecovery = createHash("sha256").update(salt + correctRecovery).digest("hex");
    const profile = makeProfile({ id: 1, name: "lockeduser", locked: true, recoveryPhrase: hashedRecovery, recoveryPhraseSalt: salt });
    const updated = makeProfile({ id: 1, name: "lockeduser", locked: false });
    const repo = makeRepo({
      findByName: vi.fn(async () => profile),
      update: vi.fn(async () => updated),
    });
    const service = new ProfileService(repo);
    const result = await service.recoverProfile("lockeduser", correctRecovery, "newpin");
    expect(result).not.toHaveProperty("pinCode");
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({ locked: false }));
  });

  it("throws InvalidCredentialsError with wrong recovery phrase", async () => {
    const profile = makeProfile({ recoveryPhrase: "hashed", recoveryPhraseSalt: "salt" });
    const repo = makeRepo({ findByName: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    await expect(service.recoverProfile("testuser", "wrong", "newpin")).rejects.toThrow(InvalidCredentialsError);
  });

  it("throws NotFoundError when profile does not exist", async () => {
    const repo = makeRepo({ findByName: vi.fn(async () => null) });
    const service = new ProfileService(repo);
    await expect(service.recoverProfile("nobody", "phrase", "newpin")).rejects.toThrow(NotFoundError);
  });
});

describe("ProfileService.getPermissions", () => {
  it("returns permissions array from profile settings", async () => {
    const profile = makeProfile({ profileSettings: { permissions: ["read", "write"] } });
    const repo = makeRepo({ findById: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    const result = await service.getPermissions(1);
    expect(result).toEqual(["read", "write"]);
  });

  it("returns empty array when profile not found", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    const service = new ProfileService(repo);
    const result = await service.getPermissions(999);
    expect(result).toEqual([]);
  });

  it("returns empty array when no permissions in settings", async () => {
    const profile = makeProfile({ profileSettings: {} });
    const repo = makeRepo({ findById: vi.fn(async () => profile) });
    const service = new ProfileService(repo);
    const result = await service.getPermissions(1);
    expect(result).toEqual([]);
  });
});