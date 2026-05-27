import { describe, it, expect, vi } from "vitest";
import { LoopService } from "../../src/services/LoopService.js";
import type { ILoopRepository } from "../../src/domain/repositories.js";
import type { Loop } from "../../src/domain/models/library.js";

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 1,
    profileId: 1,
    trackId: 1,
    name: "Loop 1",
    startTime: 0,
    endTime: 10,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<ILoopRepository> = {}): ILoopRepository {
  return {
    findByTrackId: vi.fn(async () => []),
    create: vi.fn(async (trackId, profileId, name, st, et) =>
      makeLoop({ trackId, profileId, name, startTime: st, endTime: et })
    ),
    delete: vi.fn(async () => {}),
    deleteAllByTrackId: vi.fn(async () => {}),
    ...overrides,
  } as ILoopRepository;
}

describe("LoopService.getLoops", () => {
  it("delegates to repository findByTrackId", async () => {
    const loops = [makeLoop({ name: "Intro" }), makeLoop({ id: 2, name: "Chorus" })];
    const repo = makeRepo({ findByTrackId: vi.fn(async () => loops) });
    const service = new LoopService(repo);
    const result = await service.getLoops(1, 1);
    expect(result).toEqual(loops);
    expect(repo.findByTrackId).toHaveBeenCalledWith(1, 1);
  });

  it("returns empty array when no loops exist", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    const result = await service.getLoops(5, 2);
    expect(result).toEqual([]);
    expect(repo.findByTrackId).toHaveBeenCalledWith(5, 2);
  });
});

describe("LoopService.createLoop", () => {
  it("auto-generates name as 'Loop N' based on existing count", async () => {
    const existing = [makeLoop({ name: "Loop 1" }), makeLoop({ id: 2, name: "Loop 2" })];
    const repo = makeRepo({
      findByTrackId: vi.fn(async () => existing),
      create: vi.fn(async (trackId, profileId, name, st, et) =>
        makeLoop({ trackId, profileId, name, startTime: st, endTime: et })
      ),
    });
    const service = new LoopService(repo);
    await service.createLoop(1, 1, undefined, 5, 15);
    expect(repo.create).toHaveBeenCalledWith(1, 1, "Loop 3", 5, 15);
  });

  it("uses provided name when given", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.createLoop(1, 1, "My Loop", 0, 10);
    expect(repo.create).toHaveBeenCalledWith(1, 1, "My Loop", 0, 10);
  });

  it("names first loop 'Loop 1' when no loops exist", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.createLoop(1, 1, undefined, 0, 5);
    expect(repo.create).toHaveBeenCalledWith(1, 1, "Loop 1", 0, 5);
  });

  it("returns the created loop from the repository", async () => {
    const created = makeLoop({ name: "Custom", startTime: 1, endTime: 9 });
    const repo = makeRepo({ create: vi.fn(async () => created) });
    const service = new LoopService(repo);
    const result = await service.createLoop(1, 1, "Custom", 1, 9);
    expect(result).toEqual(created);
  });

  it("does not call findByTrackId when a name is explicitly provided", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.createLoop(1, 1, "Explicit", 0, 10);
    expect(repo.findByTrackId).not.toHaveBeenCalled();
  });
});

describe("LoopService.deleteLoop", () => {
  it("delegates to repository delete", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.deleteLoop(42);
    expect(repo.delete).toHaveBeenCalledWith(42);
  });
});
